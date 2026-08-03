package main

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"api-server/src/auth"
	"api-server/src/handlers"
	"api-server/src/services"
	"api-server/src/websocket"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/spf13/viper"
	"github.com/subosito/gotenv"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
	"gopkg.in/natefinch/lumberjack.v2"
)

func main() {
	// Best-effort load local .env for development (api-server/.env).
	// In production (e.g. Docker), env vars still come from the container environment.
	_ = gotenv.Load(".env")

	// Clean up any existing processes on port 8080
	cleanupExistingProcesses()

	// Initialize configuration
	if err := initConfig(); err != nil {
		fmt.Printf("Failed to initialize configuration: %v\n", err)
		os.Exit(1)
	}

	// Initialize logger
	logger, err := initLogger()
	if err != nil {
		fmt.Printf("Failed to initialize logger: %v\n", err)
		os.Exit(1)
	}
	defer logger.Sync()

	logger.Info("Starting Power Flow Solver API Server")

	// Authentication operating mode. postgres exists solely for the auth
	// tables, so in ModeNone the server runs without any database at all.
	authMode, err := auth.ModeFromEnv()
	if err != nil {
		logger.Fatal("Invalid AUTH_MODE", zap.Error(err))
	}
	if authMode == auth.ModeNone {
		logger.Warn("AUTH_MODE=none: login disabled, all requests run as the synthetic local user. Do not expose this instance to untrusted networks.")
	} else {
		logger.Info("Authentication mode", zap.String("mode", string(authMode)))
	}

	// Initialize PostgreSQL connection (for user authentication)
	var db *pgxpool.Pool
	if authMode != auth.ModeNone {
		db, err = initDB(logger)
		if err != nil {
			logger.Fatal("Failed to initialize database", zap.Error(err))
		}
		defer db.Close()
	}

	// Initialize auth service (user store + JWT)
	authService, err := auth.NewService(db, logger)
	if err != nil {
		logger.Fatal("Failed to initialize auth service", zap.Error(err))
	}
	authHandler := auth.NewHandler(authService, logger)

	// Initialize services
	sessionService, err := initSessionService(logger)
	if err != nil {
		logger.Fatal("Failed to initialize storage service", zap.Error(err))
	}

	// Wire up default study case and knowledge base seeding on new user registration.
	authHandler.SetOnUserCreated(func(userID string) {
		sessionService.CopyDefaultStudyCase(userID)
		sessionService.CopyDefaultKnowledgeBase(userID)
		sessionService.CopyDefaultStudyFiles(userID)
		sessionService.CopyDefaultDiagrams(userID)
	})

	// In ModeNone there is no registration event, so seed the synthetic user's
	// workspace on first boot only — the copy helpers overwrite, and later
	// boots must not clobber files the user has since edited.
	if authMode == auth.ModeNone {
		syntheticModelDir := filepath.Join(sessionService.BasePath(), "model", auth.SyntheticUserID)
		if _, statErr := os.Stat(syntheticModelDir); os.IsNotExist(statErr) {
			sessionService.CopyDefaultStudyCase(auth.SyntheticUserID)
			sessionService.CopyDefaultKnowledgeBase(auth.SyntheticUserID)
			sessionService.CopyDefaultStudyFiles(auth.SyntheticUserID)
			sessionService.CopyDefaultDiagrams(auth.SyntheticUserID)
		}
	}

	solverService, err := initSolverService(sessionService, logger)
	if err != nil {
		logger.Fatal("Failed to initialize solver service", zap.Error(err))
	}

	editorService, err := initEditorService(logger)
	if err != nil {
		logger.Fatal("Failed to initialize editor service", zap.Error(err))
	}

	parserService, err := initParserService(logger)
	if err != nil {
		logger.Fatal("Failed to initialize parser service", zap.Error(err))
	}

	analyzerService, err := initAnalyzerService(logger)
	if err != nil {
		logger.Fatal("Failed to initialize analyzer service", zap.Error(err))
	}

	// Study service validates .sub/.mon/.con files (delegating parsing and
	// resolution to the flow-solver) and post-processes results.
	studyService := services.NewStudyService(sessionService, logger, viper.GetString("solver.path"))

	// Async analysis jobs (AC contingency analysis).
	jobService := services.NewJobService(2, logger)
	// Durable, per-user store of completed analyses (study-result history).
	studyResultService := services.NewStudyResultService(sessionService.BasePath(), logger)
	contingencyService := services.NewContingencyService(sessionService, studyService, solverService, jobService, studyResultService, logger)

	// Initialize handlers
	apiHandler := handlers.NewAPIHandler(sessionService, solverService, editorService, parserService, analyzerService, studyService, contingencyService, studyResultService, logger)

	// Initialize WebSocket Hub (if enabled)
	var wsHub *websocket.Hub
	var wsHandler *websocket.Handler
	if viper.GetBool("websocket.enabled") {
		wsHub = websocket.NewHub(logger)
		go wsHub.Run()
		logger.Info("WebSocket Hub started")

		// Authenticate WS upgrades with the same token parser as the HTTP API,
		// so there is a single JWT-secret source of truth. Previously this path
		// re-read AUTH_JWT_SECRET with a *different* fallback default, so a
		// missing secret silently broke WS auth while HTTP kept working.
		wsHandler = websocket.NewHandler(wsHub, logger, authService)

		// Set event publisher on API handler
		apiHandler.SetEventPublisher(handlers.NewEventPublisher(wsHub, logger))
	}

	// Initialize heartbeat handler with dependency checkers
	heartbeatHandler := handlers.NewHeartbeatHandler(
		logger,
		createDBChecker(db),
		createSolverChecker(viper.GetString("solver.path")),
		createMCPChecker(),
		wsHub,
	)

	// Setup cleanup goroutine
	go func() {
		ticker := time.NewTicker(1 * time.Hour) // Clean up every hour
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				if err := sessionService.CleanupExpiredSessions(24 * time.Hour); err != nil {
					logger.Error("Failed to cleanup expired sessions", zap.Error(err))
				}
			}
		}
	}()

	// Setup router
	router := setupRouter(apiHandler, authHandler, authService, logger, wsHandler, heartbeatHandler)

	// Get server configuration
	host := viper.GetString("server.host")
	port := viper.GetInt("server.port")
	addr := fmt.Sprintf("%s:%d", host, port)

	// Create HTTP server
	server := &http.Server{
		Addr:        addr,
		Handler:     router,
		ReadTimeout: 30 * time.Second,
		// WriteTimeout is intentionally 0 (no server-imposed response deadline):
		// synchronous endpoints like /session/solve-flow can run for minutes on
		// large networks. Per-operation context timeouts (e.g. solver.timeout_seconds,
		// contingencyTimeout) bound the actual work instead.
		WriteTimeout: 0,
		IdleTimeout:  60 * time.Second,
	}

	// Check if port is available before starting
	if err := checkPortAvailable(addr); err != nil {
		logger.Fatal("Port already in use", zap.String("address", addr), zap.Error(err))
	}

	// Start server in goroutine
	go func() {
		logger.Info("Starting HTTP server", zap.String("address", addr))
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal("Failed to start server", zap.Error(err))
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("Shutting down server...")

	// Graceful shutdown
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		logger.Error("Server forced to shutdown", zap.Error(err))
	}

	logger.Info("Server exited")
}

// initConfig initializes configuration from file and environment
func initConfig() error {
	viper.SetConfigName("config")
	viper.SetConfigType("yaml")
	viper.AddConfigPath(".")
	viper.AddConfigPath("./config")

	// Default storage path: store user data in user-data folder inside project
	// Project root is parent of api-server directory
	var defaultStoragePath string
	if projectRoot, err := filepath.Abs(".."); err == nil {
		// Store in user-data folder inside project root
		defaultStoragePath = filepath.Join(projectRoot, "user-data")
	} else {
		// Fallback to home directory if we can't determine project root
		defaultStoragePath = filepath.Join(os.Getenv("HOME"), "user-data")
	}

	// Set defaults
	viper.SetDefault("server.host", "0.0.0.0")
	viper.SetDefault("server.port", 8080)
	// Default local DB URL (can be overridden by DATABASE_URL env var)
	viper.SetDefault("database.url", "postgres://xflow:xflow_password@localhost:5433/xflow?sslmode=disable")
	viper.SetDefault("storage.base_path", defaultStoragePath)
	viper.SetDefault("storage.max_file_size", 128*1024*1024) // 128MB
	viper.SetDefault("storage.max_sessions_per_user", 5)
	viper.SetDefault("storage.default_study_case_path", "./assets/default-study-cases")
	viper.SetDefault("storage.default_knowledge_base_path", "./assets/default-knowledge-base")
	viper.SetDefault("storage.default_study_files_path", "./assets/default-study-files")
	viper.SetDefault("storage.default_diagrams_path", "./assets/default-diagrams")
	viper.SetDefault("solver.path", "../flow-solver/target/release/flow-solver")
	// Seconds to wait for a single solve-flow run. 0 (default) => no time cap:
	// the solve runs to completion (bounded only by cancellation/shutdown).
	// Set a positive value to impose a safety cap.
	viper.SetDefault("solver.timeout_seconds", 0)
	// Logging defaults
	viper.SetDefault("log.level", "info")
	viper.SetDefault("log.format", "json")
	viper.SetDefault("log.dir", "./logs")
	viper.SetDefault("log.max_size", 20)    // MB
	viper.SetDefault("log.max_backups", 14) // Number of files
	viper.SetDefault("log.max_age", 30)     // Days
	viper.SetDefault("log.compress", true)

	// Read config file
	if err := viper.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			return fmt.Errorf("failed to read config file: %w", err)
		}
	}

	// Read environment variables (environment variables take precedence)
	viper.AutomaticEnv()
	// Support STORAGE_BASE_PATH environment variable
	if envPath := os.Getenv("STORAGE_BASE_PATH"); envPath != "" {
		viper.Set("storage.base_path", envPath)
	}
	// Support DATABASE_URL environment variable
	if dsn := os.Getenv("DATABASE_URL"); dsn != "" {
		viper.Set("database.url", dsn)
	}
	// Support SOLVER_PATH environment variable
	if solverPath := os.Getenv("SOLVER_PATH"); solverPath != "" {
		viper.Set("solver.path", solverPath)
	}
	// Support LOG_DIR environment variable
	if logDir := os.Getenv("LOG_DIR"); logDir != "" {
		viper.Set("log.dir", logDir)
	}

	// Resolve storage base path to absolute path and store it back
	basePath := viper.GetString("storage.base_path")
	if !filepath.IsAbs(basePath) {
		absPath, err := filepath.Abs(basePath)
		if err != nil {
			return fmt.Errorf("failed to resolve storage base path: %w", err)
		}
		viper.Set("storage.base_path", absPath)
	}

	// Resolve log directory to absolute path
	logDir := viper.GetString("log.dir")
	if !filepath.IsAbs(logDir) {
		absLogDir, err := filepath.Abs(logDir)
		if err != nil {
			return fmt.Errorf("failed to resolve log directory: %w", err)
		}
		viper.Set("log.dir", absLogDir)
	}

	// Create log directory if it doesn't exist
	if err := os.MkdirAll(viper.GetString("log.dir"), 0755); err != nil {
		return fmt.Errorf("failed to create log directory: %w", err)
	}

	return nil
}

// initLogger initializes the logger with file and console output
func initLogger() (*zap.Logger, error) {
	// Get log configuration
	logLevel := viper.GetString("log.level")
	logFormat := viper.GetString("log.format")
	logDir := viper.GetString("log.dir")
	maxSize := viper.GetInt("log.max_size")
	maxBackups := viper.GetInt("log.max_backups")
	maxAge := viper.GetInt("log.max_age")
	compress := viper.GetBool("log.compress")

	// Parse log level
	var level zapcore.Level
	if err := level.UnmarshalText([]byte(logLevel)); err != nil {
		return nil, fmt.Errorf("invalid log level: %w", err)
	}

	// Create encoder config
	encoderConfig := zap.NewProductionEncoderConfig()
	encoderConfig.TimeKey = "timestamp"
	encoderConfig.EncodeTime = zapcore.ISO8601TimeEncoder

	// Choose encoder based on format
	var encoder zapcore.Encoder
	if logFormat == "console" {
		encoderConfig.EncodeLevel = zapcore.CapitalColorLevelEncoder
		encoder = zapcore.NewConsoleEncoder(encoderConfig)
	} else {
		encoder = zapcore.NewJSONEncoder(encoderConfig)
	}

	// Console writer
	consoleWriter := zapcore.AddSync(os.Stdout)

	// Application log file with rotation
	appLogFile := &lumberjack.Logger{
		Filename:   filepath.Join(logDir, "app.log"),
		MaxSize:    maxSize,    // MB
		MaxBackups: maxBackups, // Number of backups
		MaxAge:     maxAge,     // Days
		Compress:   compress,   // Compress rotated files
	}

	// Error log file with rotation (only errors)
	errorLogFile := &lumberjack.Logger{
		Filename:   filepath.Join(logDir, "error.log"),
		MaxSize:    maxSize,
		MaxBackups: maxBackups * 2, // Keep more error logs
		MaxAge:     maxAge * 2,     // Keep error logs longer
		Compress:   compress,
	}

	// Create cores for different outputs
	consoleCore := zapcore.NewCore(encoder, consoleWriter, level)
	appFileCore := zapcore.NewCore(encoder, zapcore.AddSync(appLogFile), level)
	errorFileCore := zapcore.NewCore(encoder, zapcore.AddSync(errorLogFile), zapcore.ErrorLevel)

	// Combine all cores
	core := zapcore.NewTee(consoleCore, appFileCore, errorFileCore)

	// Create logger
	logger := zap.New(core, zap.AddCaller(), zap.AddStacktrace(zapcore.ErrorLevel))

	return logger, nil
}

// initSessionService initializes the session service
func initSessionService(logger *zap.Logger) (*services.SessionService, error) {
	// Path is already resolved to absolute in initConfig
	basePath := viper.GetString("storage.base_path")
	maxFileSize := viper.GetInt64("storage.max_file_size")
	maxSessionsPerUser := viper.GetInt("storage.max_sessions_per_user")
	defaultStudyCasePath := viper.GetString("storage.default_study_case_path")
	defaultKnowledgeBasePath := viper.GetString("storage.default_knowledge_base_path")
	defaultStudyFilesPath := viper.GetString("storage.default_study_files_path")
	defaultDiagramsPath := viper.GetString("storage.default_diagrams_path")

	// Resolve default study case path to absolute
	if defaultStudyCasePath != "" && !filepath.IsAbs(defaultStudyCasePath) {
		absPath, err := filepath.Abs(defaultStudyCasePath)
		if err != nil {
			return nil, fmt.Errorf("failed to resolve default study case path: %w", err)
		}
		defaultStudyCasePath = absPath
	}

	// Resolve default knowledge base path to absolute
	if defaultKnowledgeBasePath != "" && !filepath.IsAbs(defaultKnowledgeBasePath) {
		absPath, err := filepath.Abs(defaultKnowledgeBasePath)
		if err != nil {
			return nil, fmt.Errorf("failed to resolve default knowledge base path: %w", err)
		}
		defaultKnowledgeBasePath = absPath
	}

	// Resolve default study-files path to absolute
	if defaultStudyFilesPath != "" && !filepath.IsAbs(defaultStudyFilesPath) {
		absPath, err := filepath.Abs(defaultStudyFilesPath)
		if err != nil {
			return nil, fmt.Errorf("failed to resolve default study-files path: %w", err)
		}
		defaultStudyFilesPath = absPath
	}

	// Resolve default diagrams path to absolute
	if defaultDiagramsPath != "" && !filepath.IsAbs(defaultDiagramsPath) {
		absPath, err := filepath.Abs(defaultDiagramsPath)
		if err != nil {
			return nil, fmt.Errorf("failed to resolve default diagrams path: %w", err)
		}
		defaultDiagramsPath = absPath
	}

	logger.Info("Initializing storage service",
		zap.String("base_path", basePath),
		zap.Int64("max_file_size", maxFileSize),
		zap.Int("max_sessions_per_user", maxSessionsPerUser),
		zap.String("default_study_case_path", defaultStudyCasePath),
		zap.String("default_knowledge_base_path", defaultKnowledgeBasePath),
		zap.String("default_study_files_path", defaultStudyFilesPath),
		zap.String("default_diagrams_path", defaultDiagramsPath))

	return services.NewSessionService(basePath, maxFileSize, maxSessionsPerUser, defaultStudyCasePath, defaultKnowledgeBasePath, defaultStudyFilesPath, defaultDiagramsPath, logger)
}

// initSolverService initializes the solver service
func initSolverService(sessionService *services.SessionService, logger *zap.Logger) (*services.SolverService, error) {
	solverPath := viper.GetString("solver.path")

	// Resolve relative path if needed
	if !filepath.IsAbs(solverPath) {
		absPath, err := filepath.Abs(solverPath)
		if err != nil {
			return nil, fmt.Errorf("failed to resolve solver path: %w", err)
		}
		solverPath = absPath
	}

	solverTimeout := time.Duration(viper.GetInt("solver.timeout_seconds")) * time.Second

	logger.Info("Initializing solver service",
		zap.String("solver_path", solverPath),
		zap.Duration("solver_timeout", solverTimeout))

	// Check if solver exists
	if _, err := os.Stat(solverPath); os.IsNotExist(err) {
		return nil, fmt.Errorf("solver binary not found at: %s", solverPath)
	}

	return services.NewSolverService(solverPath, sessionService, logger, solverTimeout), nil
}

// initEditorService initializes the editor service
func initEditorService(logger *zap.Logger) (*services.EditorService, error) {
	solverPath := viper.GetString("solver.path")

	// Resolve relative path if needed
	if !filepath.IsAbs(solverPath) {
		absPath, err := filepath.Abs(solverPath)
		if err != nil {
			return nil, fmt.Errorf("failed to resolve solver path: %w", err)
		}
		solverPath = absPath
	}

	logger.Info("Initializing editor service", zap.String("solver_path", solverPath))

	// Check if solver exists
	if _, err := os.Stat(solverPath); os.IsNotExist(err) {
		return nil, fmt.Errorf("solver binary not found at: %s", solverPath)
	}

	return services.NewEditorService(solverPath, logger), nil
}

// initAnalyzerService initializes the analyzer service
func initAnalyzerService(logger *zap.Logger) (*services.AnalyzerService, error) {
	solverPath := viper.GetString("solver.path")

	if !filepath.IsAbs(solverPath) {
		absPath, err := filepath.Abs(solverPath)
		if err != nil {
			return nil, fmt.Errorf("failed to resolve solver path: %w", err)
		}
		solverPath = absPath
	}

	logger.Info("Initializing analyzer service", zap.String("solver_path", solverPath))

	if _, err := os.Stat(solverPath); os.IsNotExist(err) {
		return nil, fmt.Errorf("solver binary not found at: %s", solverPath)
	}

	return services.NewAnalyzerService(solverPath, logger), nil
}

// initParserService initializes the parser service
func initParserService(logger *zap.Logger) (*services.ParserService, error) {
	solverPath := viper.GetString("solver.path")

	// Resolve relative path if needed
	if !filepath.IsAbs(solverPath) {
		absPath, err := filepath.Abs(solverPath)
		if err != nil {
			return nil, fmt.Errorf("failed to resolve solver path: %w", err)
		}
		solverPath = absPath
	}

	logger.Info("Initializing parser service", zap.String("solver_path", solverPath))

	// Check if solver exists
	if _, err := os.Stat(solverPath); os.IsNotExist(err) {
		return nil, fmt.Errorf("solver binary not found at: %s", solverPath)
	}

	return services.NewParserService(solverPath, logger), nil
}

// initDB initializes a PostgreSQL connection pool using DATABASE_URL.
func initDB(logger *zap.Logger) (*pgxpool.Pool, error) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = viper.GetString("database.url")
	}
	if dsn == "" {
		return nil, fmt.Errorf("DATABASE_URL environment variable is required (or set database.url in config.yaml)")
	}

	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to parse DATABASE_URL: %w", err)
	}

	pool, err := pgxpool.NewWithConfig(context.Background(), cfg)
	if err != nil {
		return nil, fmt.Errorf("failed to create PostgreSQL connection pool: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("failed to connect to PostgreSQL database: %w", err)
	}

	logger.Info("Connected to PostgreSQL database", zap.String("database_url", dsn))
	return pool, nil
}

// setupRouter sets up the HTTP router with middleware and routes
func setupRouter(
	apiHandler *handlers.APIHandler,
	authHandler *auth.Handler,
	authService *auth.Service,
	logger *zap.Logger,
	wsHandler *websocket.Handler,
	heartbeatHandler *handlers.HeartbeatHandler,
) *gin.Engine {
	// Set Gin mode
	if viper.GetString("gin.mode") == "release" {
		gin.SetMode(gin.ReleaseMode)
	}

	router := gin.New()

	// Middleware
	router.Use(gin.Recovery())
	router.Use(loggerMiddleware(logger))
	router.Use(corsMiddleware())
	router.Use(textPlainToJSONMiddleware())
	router.Use(auth.RequestIDMiddleware())

	// Service authentication middleware (for MCP-Server to API-Server calls)
	// Enable if SERVICE_AUTH_SECRET is set or service_auth.enabled is true
	serviceAuthEnabled := viper.GetBool("service_auth.enabled") || os.Getenv("SERVICE_AUTH_SECRET") != ""
	if serviceAuthEnabled {
		router.Use(auth.ServiceAuthMiddleware(logger))
		logger.Info("Service authentication middleware enabled")
	}

	// Health check endpoints
	router.GET("/health", heartbeatHandler.HealthCheck)  // Backward compatible
	router.GET("/heartbeat", heartbeatHandler.Heartbeat) // Detailed status

	// Platform-version endpoint (unauthenticated; identity, not health).
	router.GET("/api/version", handlers.VersionHandler)

	// WebSocket endpoint (if enabled)
	if wsHandler != nil && viper.GetBool("websocket.enabled") {
		router.GET("/ws", wsHandler.HandleWebSocket)
		logger.Info("WebSocket endpoint enabled at /ws")
	}

	// Public auth routes
	public := router.Group("/api/v1")
	{
		// Feature discovery: which auth features are active. Unauthenticated
		// and available in every mode so the frontend can adapt before login.
		public.GET("/auth/config", authHandler.AuthConfig)

		if authService.Mode() == auth.ModeNone {
			// Single-user mode: the only auth surface is the synthetic-user
			// session issuer. Login/registration/reset routes are not
			// mounted and return 404.
			public.POST("/auth/session", authHandler.Session)
		} else {
			public.POST("/auth/login", authHandler.Login)
			public.POST("/auth/register", authHandler.Register)
			public.GET("/auth/verify-email", authHandler.VerifyEmail)
			public.POST("/auth/verify-passcode", authHandler.VerifyPasscode)
			public.POST("/auth/forgot-password", authHandler.ForgotPassword)
			public.POST("/auth/reset-password", authHandler.ResetPassword)
			public.GET("/auth/google/url", authHandler.GoogleOAuthURL)
			public.POST("/auth/google/callback", authHandler.GoogleCallback)
			// Refresh-token flow. /auth/refresh and /auth/logout are intentionally
			// unprotected: refresh runs when the access token has expired, and
			// logout takes the refresh token as proof of identity.
			// When AUTH_REFRESH_ENABLED=false the handlers themselves 404.
			public.POST("/auth/refresh", authHandler.Refresh)
			public.POST("/auth/logout", authHandler.Logout)
		}
	}

	// Note: the flow-solver no longer POSTs results back to the api-server.
	// Results are delivered via files written to caller-specified --output
	// paths, so the former /api/v1/solver/result, /network/parse,
	// /editor/edited and /analysis/*/result internal callback endpoints have
	// been removed.

	// Protected API routes (require valid JWT)
	api := router.Group("/api/v1")
	api.Use(authService.GinAuthMiddleware())
	{
		// ===========================================
		// USER FILE MANAGEMENT
		// ===========================================
		// Manage files in user's personal folder
		api.POST("/user/upload", apiHandler.UploadUserFile)           // Upload file to user folder
		api.POST("/user/files", apiHandler.GetUserFiles)              // List user's uploaded files
		api.POST("/user/files/download", apiHandler.DownloadUserFile) // Download/fetch user file with caching
		api.POST("/user/files/delete", apiHandler.DeleteUserFile)     // Delete user file

		// ===========================================
		// SESSION LIFECYCLE MANAGEMENT
		// ===========================================
		// Create, manage, and destroy sessions
		api.POST("/session", apiHandler.CreateSession)                   // Create empty session
		api.POST("/session/info", apiHandler.GetSessionInfo)             // Get session information
		api.POST("/session/load-case", apiHandler.LoadCase)              // Create a session from a network case (RAWX)
		api.POST("/session/save-case", apiHandler.SaveCase)              // Save the session's case back to its library file
		api.POST("/session/save-case-as", apiHandler.SaveCaseAs)         // Save the session's case as a new library file
		api.POST("/session/load-sub", apiHandler.LoadSub)                // Load a subsystem (.sub) file into the session
		api.POST("/session/load-mon", apiHandler.LoadMon)                // Load a monitored-elements (.mon) file into the session
		api.POST("/session/load-con", apiHandler.LoadCon)                // Load a contingency (.con) file into the session
		api.POST("/session/study/validate", apiHandler.ValidateStudyFiles) // Parse & resolve study files; return diagnostics
		api.POST("/user/sessions", apiHandler.GetUserSessions)           // List all user sessions
		api.DELETE("/user/sessions", apiHandler.CleanupUserSessions)     // Delete all user sessions

		// ===========================================
		// SESSION MODEL OPERATIONS
		// ===========================================
		// All operations on network models require a session context
		api.POST("/session/network", apiHandler.GetSessionNetwork)                              // Get parsed network data
		api.POST("/session/solve-flow", apiHandler.CalculatePowerFlow)                       // Run power flow calculation
		api.POST("/session/powerflow", apiHandler.GetPowerFlowData)                          // Get power flow results
		api.POST("/session/edit", apiHandler.EditElement)                                    // Edit network elements
		api.POST("/session/analysis/shortest-path", apiHandler.FindShortestPath)             // Graph: shortest path
		api.POST("/session/analysis/neighbour-elements", apiHandler.FindNeighbourElements)   // Graph: neighbour elements

		// ===========================================
		// AC CONTINGENCY ANALYSIS (async jobs)
		// ===========================================
		api.POST("/session/analysis/contingency", apiHandler.StartContingencyAnalysis) // Start an ACCC run
		api.GET("/analysis/jobs/:id", apiHandler.GetAnalysisJob)                       // Job status & progress
		api.GET("/analysis/jobs/:id/report", apiHandler.GetAnalysisReport)             // Completed job report
		api.POST("/analysis/jobs/:id/cancel", apiHandler.CancelAnalysisJob)            // Cancel a running job

		// Study-result history (durable, per-user)
		api.GET("/user/study-results", apiHandler.ListStudyResults)          // List the user's study results
		api.GET("/user/study-results/:id", apiHandler.GetStudyResult)        // Open one study result
		api.DELETE("/user/study-results/:id", apiHandler.DeleteStudyResult)  // Delete a study result

		// ===========================================
		// SYSTEM INFORMATION
		// ===========================================
		api.GET("/stat", apiHandler.GetStats) // Get system statistics and health

		// Revoke every active refresh token for the current user.
		// Requires a valid access token to identify the user.
		// Not mounted in ModeNone: refresh tokens are postgres-backed and
		// none of them exist in that mode.
		if authService.Mode() != auth.ModeNone {
			api.POST("/auth/logout-all", authHandler.LogoutAll)
		}
	}

	// Static file serving for models, knowledge, study files, results, and sessions
	router.Static("/model", viper.GetString("storage.base_path")+"/model")
	router.Static("/knowledge", viper.GetString("storage.base_path")+"/knowledge")
	router.Static("/sub", viper.GetString("storage.base_path")+"/sub")
	router.Static("/mon", viper.GetString("storage.base_path")+"/mon")
	router.Static("/con", viper.GetString("storage.base_path")+"/con")
	router.Static("/diagram", viper.GetString("storage.base_path")+"/diagram")
	router.Static("/power-flow", viper.GetString("storage.base_path")+"/power-flow")
	router.Static("/sessions", viper.GetString("storage.base_path")+"/sessions")

	return router
}

// loggerMiddleware adds logging middleware
func loggerMiddleware(logger *zap.Logger) gin.HandlerFunc {
	return gin.LoggerWithFormatter(func(param gin.LogFormatterParams) string {
		logger.Info("HTTP Request",
			zap.String("method", param.Method),
			zap.String("path", param.Path),
			zap.Int("status", param.StatusCode),
			zap.Duration("latency", param.Latency),
			zap.String("client_ip", param.ClientIP),
			zap.String("user_agent", param.Request.UserAgent()),
		)
		return ""
	})
}

// corsMiddleware adds CORS middleware
func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Origin, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, X-Request-Id")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}

// textPlainToJSONMiddleware converts text/plain requests to application/json
// This allows the frontend to send JSON as text/plain to avoid CORS preflight requests
func textPlainToJSONMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Only process POST requests with text/plain content type
		if c.Request.Method == "POST" && c.ContentType() == "text/plain" {
			// Change the content type to application/json so Gin can parse it
			c.Request.Header.Set("Content-Type", "application/json")
		}
		c.Next()
	}
}

// checkPortAvailable checks if the port is available for binding
func checkPortAvailable(addr string) error {
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("port %s is already in use: %w", addr, err)
	}
	ln.Close()
	return nil
}

// cleanupExistingProcesses kills any existing processes using port 8080
func cleanupExistingProcesses() {
	// This is a simple approach - in production you might want more sophisticated process management
	// For now, we'll let the port check handle conflicts gracefully
}

// createDBChecker creates a database health checker. A nil pool (AUTH_MODE=none
// runs without a database) reports healthy: there is nothing to check.
func createDBChecker(db *pgxpool.Pool) func() (bool, int64, error) {
	return func() (bool, int64, error) {
		if db == nil {
			return true, 0, nil
		}
		start := time.Now()
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		err := db.Ping(ctx)
		latency := time.Since(start).Milliseconds()

		if err != nil {
			return false, latency, err
		}
		return true, latency, nil
	}
}

// createSolverChecker creates a solver health checker
func createSolverChecker(solverPath string) func() (bool, string, error) {
	return func() (bool, string, error) {
		// Check if solver binary exists
		if _, err := os.Stat(solverPath); os.IsNotExist(err) {
			return false, "", fmt.Errorf("solver binary not found at: %s", solverPath)
		}

		// Try to get version
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		cmd := exec.CommandContext(ctx, solverPath, "--version")
		output, err := cmd.Output()
		if err != nil {
			return false, "", err
		}

		// Parse version from output (assuming format like "flow-solver 1.0.0")
		version := "unknown"
		if len(output) > 0 {
			version = string(output)
		}

		return true, version, nil
	}
}

// createMCPChecker creates an agent server health checker
func createMCPChecker() func() (bool, error) {
	return func() (bool, error) {
		agentURL := os.Getenv("AGENT_SERVER_URL")
		if agentURL == "" {
			agentURL = "http://localhost:3001/health"
		}

		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		req, err := http.NewRequestWithContext(ctx, "GET", agentURL, nil)
		if err != nil {
			return false, err
		}

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return false, err
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			return false, fmt.Errorf("agent server returned status %d", resp.StatusCode)
		}

		return true, nil
	}
}
