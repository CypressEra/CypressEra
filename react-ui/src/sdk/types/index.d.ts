/**
 * XFlow SDK Type Definitions
 */

// ==================== File library categories ====================

/** Study-file kinds — the .sub/.mon/.con analysis inputs. */
export type StudyFileType = 'sub' | 'mon' | 'con';

/** User-file library categories: case + reference libraries plus study files plus diagram layouts. */
export type UserFileType = 'model' | 'knowledge' | StudyFileType | 'diagram';

// ==================== Constants ====================

export const ANALYSIS_METHODS: {
  DC: 'dc';
  FNSL: 'fnsl';
  FDNS: 'fdns';
};

export const ELEMENT_TYPES: {
  BUS: 'bus';
  LOAD: 'load';
  GENERATOR: 'generator';
  ACLINE: 'acline';
  TRANSFORMER: 'transformer';
  FIXSHUNT: 'fixshunt';
  SWSHUNT: 'swshunt';
};

export const EDIT_ACTIONS: {
  ADD: 'add';
  MODIFY: 'modify';
  DELETE: 'delete';
};

export const SDK_EVENTS: {
  INITIALIZED: 'initialized';
  SOLVE_FLOW_START: 'solveflow:start';
  SOLVE_FLOW_COMPLETE: 'solveflow:complete';
  SOLVE_FLOW_ERROR: 'solveflow:error';
  EDIT_START: 'edit:start';
  EDIT_COMPLETE: 'edit:complete';
  EDIT_ERROR: 'edit:error';
  SESSION_CREATED: 'session:created';
  SESSION_CLEARED: 'session:cleared';
  SESSION_CHANGED: 'session:changed';
  NETWORK_UPDATED: 'network:updated';
  FILE_DELETED: 'file:deleted';
  HEALTH_CHECK: 'health:check';
  RESET: 'reset';
  ERROR: 'error';
  LOG: 'log';
};

export const STATUS: {
  IDLE: 'idle';
  CONNECTING: 'connecting';
  CONNECTED: 'connected';
  DISCONNECTED: 'disconnected';
  UPLOADING: 'uploading';
  ANALYZING: 'analyzing';
  ERROR: 'error';
};

// ==================== Types ====================

export type AnalysisMethod = 'dc' | 'fnsl' | 'fdns';
export type ElementType = 'bus' | 'load' | 'generator' | 'acline' | 'transformer' | 'fixshunt' | 'swshunt';
export type EditAction = 'add' | 'modify' | 'delete';

export interface SDKConfig {
  apiBaseURL?: string;
  userId?: string;
  /** Bearer access token for authenticated API calls. */
  accessToken?: string;
  logLevel?: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';
  persistSession?: boolean;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  autoReconnect?: boolean;
}

// ==================== Session ====================

export interface SessionInfo {
  id: string;
  user_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  /** Basenames of the session working files; omitted when not set. */
  model_file?: string;
  results_file?: string;
  method?: string;
  converged?: boolean;
  solution_time_ms?: number;
  /** Loaded study-file names; omitted when no file of that kind is loaded. */
  sub_file?: string;
  mon_file?: string;
  con_file?: string;
}

export interface NetworkData {
  status: string;
  session_id: string;
  network_data: {
    bus?: Array<BusData>;
    load?: Array<LoadData>;
    generator?: Array<GeneratorData>;
    acline?: Array<AclineData>;
    twotermdc?: Array<any>;
    transformer?: Array<TransformerData>;
    fixshunt?: Array<FixshuntData>;
    swshunt?: Array<SwshuntData>;
    caseid?: any;
    general?: any;
  };
}

// ==================== Network Elements ====================

export interface BusData {
  ibus: number;
  name?: string;
  baskv?: number;
  ide?: number;
  vm?: number;
  va?: number;
  [key: string]: any;
}

export interface LoadData {
  ibus: number;
  loadid?: string;
  status?: number;
  pl?: number;
  ql?: number;
  [key: string]: any;
}

export interface GeneratorData {
  ibus: number;
  machid?: string;
  pg?: number;
  qg?: number;
  qt?: number;
  qb?: number;
  vs?: number;
  [key: string]: any;
}

export interface AclineData {
  ibus: number;
  jbus: number;
  ckt?: string;
  r?: number;
  x?: number;
  b?: number;
  [key: string]: any;
}

export interface TransformerData {
  ibus: number;
  jbus: number;
  k?: number;
  ckt?: string;
  r?: number;
  x?: number;
  [key: string]: any;
}

export interface FixshuntData {
  ibus: number;
  shntid?: string;
  stat?: number;
  gl?: number;
  bl?: number;
  /** Result: Active power injection (MW) */
  p?: number;
  /** Result: Reactive power injection (Mvar) */
  q?: number;
  [key: string]: any;
}

export interface SwshuntData {
  ibus: number;
  shntid?: string;
  modsw?: number;
  adjm?: number;
  stat?: number;
  vswhi?: number;
  vswlo?: number;
  swreg?: number;
  nreg?: number;
  rmpct?: number;
  rmidnt?: string;
  binit?: number;
  s1?: number; n1?: number; b1?: number;
  s2?: number; n2?: number; b2?: number;
  s3?: number; n3?: number; b3?: number;
  s4?: number; n4?: number; b4?: number;
  s5?: number; n5?: number; b5?: number;
  s6?: number; n6?: number; b6?: number;
  s7?: number; n7?: number; b7?: number;
  s8?: number; n8?: number; b8?: number;
  /** Result: Reactive power injection (Mvar) */
  q?: number;
  [key: string]: any;
}

// ==================== Calculation ====================

export interface CalculationConfig {
  method: string;
  tolerance?: number;
  max_iterations?: number;
  lossless_network?: boolean;
  [key: string]: any;
}

export interface CalculationOptions {
  sessionId?: string;
  /** Solver configuration (tolerance, max_iterations, lossless_network, etc.) */
  config?: Partial<CalculationConfig>;
}

export interface SolveFlowResult {
  status: string;
  success: boolean;
  converged: boolean;
  message: string;
  session_id: string;
  method: string;
  /** Present only when the session has study files attached. */
  monitored_report?: MonitoredReport;
}

/** A study-file parse or resolution diagnostic. */
export interface StudyDiagnostic {
  file: string;
  line: number;
  severity: 'warning' | 'error';
  code: string;
  message: string;
}

/** The outcome of validating a session's study files — diagnostics plus
 * severity counts. Embedded in both the validate response and the load
 * responses, so a load already carries it. */
export interface StudyValidationResult {
  /** false when the session has no study files attached. */
  has_files: boolean;
  /** false when no network model is attached (validation is parse-only). */
  has_model: boolean;
  diagnostics: StudyDiagnostic[];
  errors: number;
  warnings: number;
}

/** Response from validateStudyFiles(). */
export interface StudyValidateResult extends StudyValidationResult {
  status: string;
  session_id: string;
}

/** Response from loadSub()/loadMon()/loadCon() — the load result plus the
 * validation result for all of the session's study files. */
export interface LoadStudyFileResult extends StudyValidationResult {
  status: string;
  message: string;
  session_id: string;
  file_name: string;
  type: 'sub' | 'mon' | 'con';
}

/** One monitored branch's base-case loading. */
export interface ThermalRow {
  from: number;
  to: number;
  ckt: string;
  is_xfmr: boolean;
  flow_mw: number;
  flow_mva: number;
  rating?: number;
  has_rating: boolean;
  loading_pct?: number;
  has_loading: boolean;
  violation: boolean;
}

/** Thermal rows grouped by MONTYPE label. */
export interface ThermalGroup {
  mon_type: string;
  rows: ThermalRow[];
}

/** One monitored bus's base-case voltage check. */
export interface VoltageRow {
  bus: number;
  mon_type?: string;
  vm: number;
  lo?: number;
  hi?: number;
  has_limits: boolean;
  violation: boolean;
}

/** One monitored interface's base-case flow. */
export interface InterfaceRow {
  name: string;
  flow_mw: number;
  rating?: number;
  has_rating: boolean;
  loading_pct?: number;
  has_loading: boolean;
  violation: boolean;
}

/** An async analysis job (AC contingency analysis). */
export interface AnalysisJob {
  id: string;
  session_id: string;
  type: string;
  state: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: { done: number; total: number; violations: number; detail?: string };
  error?: string;
  created_at: string;
  updated_at: string;
}

/** Settings for an AC contingency analysis run. Omitted fields take engine
 * defaults: report scope `both`, threshold 100%, transformers on the MVA
 * basis and non-transformer branches on the Amps basis (PSS/E / TARA). */
export interface ContingencySettings {
  report_scope?: 'thermal' | 'voltage' | 'both';
  loading_threshold_pct?: number;
  transformer_loading_basis?: 'mva' | 'amps';
  nontransformer_loading_basis?: 'mva' | 'amps';
}

/** One row of the flat contingency report. A monitored-element row has a
 * `type` (thermal/voltage/interface) and `status` "converged"; a contingency
 * status row has no `type` and `status` "non-converged"/"islanded". */
export interface ContingencyViolation {
  /** Absent on a contingency-status row. */
  type?: 'thermal' | 'voltage' | 'interface';
  /** The status of the contingency this row belongs to. */
  status: 'converged' | 'non-converged' | 'islanded';
  cont_name?: string;
  monitored_facility?: string;

  // thermal
  from_bus?: number;
  to_bus?: number;
  ckt?: string;
  winding?: number;
  from_kv?: number;
  to_kv?: number;
  base_rating_mva?: number;
  cont_rating_mva?: number;
  cont_loading_mva?: number;
  cont_loading_pct?: number;
  base_loading_mva?: number;
  base_loading_pct?: number;
  violation?: boolean;

  // voltage
  bus?: number;
  bus_name?: string;
  bus_kv?: number;
  volt_upper_limit_pu?: number;
  volt_lower_limit_pu?: number;
  volt_deviation_limit_pu?: number;
  cont_voltage_pu?: number;
  base_voltage_pu?: number;
  cont_deviation_pu?: number;

  // interface
  name?: string;
}

/** The AC contingency analysis report — a flat list of mon/con-pair result
 * rows (base-case rows tagged cont_name "Base Case") plus a run summary. */
export interface ContingencyReport {
  results: ContingencyViolation[];
  summary: {
    total: number;
    non_converged: number;
    islanded: number;
    with_violations: number;
    worst_loading_pct: number;
  };
}

/** Metadata envelope for a stored study result (the unit the history list returns). */
export interface StudyResultMeta {
  id: string;
  type: string;
  app_version: string;
  created_at: string;
  model_file?: string;
  session_id?: string;
  power_flow_config?: Record<string, unknown>;
  contingency_settings?: ContingencySettings;
  summary: ContingencyReport['summary'];
}

/** A stored study result in full — its metadata plus the analysis report. */
export interface StudyResult {
  meta: StudyResultMeta;
  report: ContingencyReport;
}

/** The base-case monitored report produced from study files. */
export interface MonitoredReport {
  thermal: ThermalGroup[];
  voltage: VoltageRow[];
  interfaces: InterfaceRow[];
  diagnostics: StudyDiagnostic[];
  summary: {
    monitored_branches: number;
    monitored_buses: number;
    interfaces: number;
    violations: number;
    skipped: number;
  };
}

export interface PowerFlowData {
  session_id: string;
  method: string;
  converged: boolean;
  solution_time_ms: number;
  iterations?: number;
  max_mismatch?: number;
  bus_results: Array<any>;
  generator_results?: Array<any>;
  acline_results?: Array<any>;
  transformer_results?: Array<any>;
  twotermdc_results?: Array<any>;
  vscdc_results?: Array<any>;
  fixshunt_results?: Array<FixshuntResult>;
  swshunt_results?: Array<SwshuntResult>;
  system_summary?: any;
}

/** Fixed shunt power flow result */
export interface FixshuntResult {
  ibus: number;
  shntid?: string;
  stat: number;
  p: number;
  q: number;
}

/** Switched shunt power flow result */
export interface SwshuntResult {
  ibus: number;
  shntid?: string;
  stat: number;
  q: number;
  active_blocks?: Array<{ n: number; b: number }>;
  /** Warm-start: converged total susceptance (Mvar @1pu), folded into binit. */
  binit_solved?: number;
}

export interface CalculationResult {
  status: string;
  message: string;
  session_id: string;
  method: string;
  results: {
    converged: boolean;
    iterations: number;
    solution_time_ms: number;
    bus_results?: Array<any>;
    generator_results?: Array<any>;
    acline_results?: Array<any>;
    transformer_results?: Array<any>;
    twotermdc_results?: Array<any>;
    vscdc_results?: Array<any>;
    fixshunt_results?: Array<FixshuntResult>;
    swshunt_results?: Array<SwshuntResult>;
    system_summary?: any;
  };
}


// ==================== Edit ====================

export interface EditOptions {
  sessionId?: string;
  data?: any;
  identifier?: any;
}

/** Schema for an element type: identifier keys, data keys, descriptions, and examples. Returned by getElementSchema(). */
export interface ElementSchema {
  elementType: string;
  identifierKeys: string[];
  dataKeys: string[];
  /** Short explanation of the element type. */
  description?: string;
  /** Per-key descriptions for identifier and data keys (e.g. pl: "Active power demand (MW)"). */
  keyDescriptions?: Record<string, string>;
  /** Example identifier object for getNetwork/modify/delete (e.g. { ibus: 1, loadid: "1" }). */
  exampleIdentifier?: Record<string, number | string>;
  /** Example partial data for modify/add (e.g. { pl: 100, ql: 50 }). */
  exampleData?: Record<string, number | string>;
}

export interface EditResult {
  status: string;
  message: string;
  session_id: string;
  file_path: string;
}

// ==================== Error ====================

export class SDKError extends Error {
  code: string;
  details: any;
  constructor(message: string, details?: any);
}

export class InitializationError extends SDKError {}
export class SolveError extends SDKError {}
export class NetworkError extends SDKError {}
export class SessionError extends SDKError {}
export class ValidationError extends SDKError {}

// ==================== Event Emitter ====================

export class EventEmitter {
  on(event: string, handler: Function): () => void;
  off(event: string, handler: Function): void;
  once(event: string, handler: Function): () => void;
  emit(event: string, data?: any): void;
  removeAllListeners(event?: string): void;
}

// ==================== Core Components ====================

export class HttpClient {
  constructor(baseURL: string, config?: SDKConfig);
  setBaseURL(url: string): void;
  request(endpoint: string, options?: RequestInit): Promise<Response>;
  get<T = any>(endpoint: string, options?: RequestInit): Promise<T>;
  post<T = any>(endpoint: string, data?: any, options?: RequestInit): Promise<T>;
  postFormData<T = any>(endpoint: string, formData: FormData, options?: RequestInit): Promise<T>;
  put<T = any>(endpoint: string, data?: any, options?: RequestInit): Promise<T>;
  delete<T = any>(endpoint: string, options?: RequestInit): Promise<T>;
  ping(endpoint?: string): Promise<boolean>;
}

export class SessionManager extends EventEmitter {
  getSessionId(): string | null;
  setSessionId(sessionId: string): void;
  clearSession(): void;
  hasSession(): boolean;
  setData(key: string, value: any): void;
  getData(key: string): any;
  clearData(): void;
  getAllData(): Record<string, any>;
  saveToLocalStorage(key?: string): void;
  loadFromLocalStorage(key?: string): boolean;
  clearLocalStorage(key?: string): void;
}

// ==================== Services ====================

export class SessionService extends EventEmitter {
  constructor(httpClient: HttpClient, sessionManager: SessionManager);
  getInfo(sessionId?: string): Promise<SessionInfo>;
  getNetwork(sessionId?: string, elementType?: string, identifier?: Record<string, unknown>): Promise<NetworkData>;
  getUserSessions(userId: string): Promise<SessionInfo[]>;
  deleteUserSessions(userId: string): Promise<any>;
  
  // User File Management
  uploadUserFile(file: File, userId: string, fileType?: 'model' | 'knowledge'): Promise<any>;
  getUserFiles(userId: string, fileType?: 'model' | 'knowledge'): Promise<any>;
  deleteUserFile(fileName: string, userId: string, fileType?: 'model' | 'knowledge'): Promise<any>;
  getUserFileInfo(fileName: string, userId: string): Promise<any>;
  createSessionFromFile(fileName: string, userId: string): Promise<any>;
  saveSessionToUserFile(sessionId?: string): Promise<any>;
  saveSessionAsUserFile(newFileName: string, sessionId?: string): Promise<any>;
}


export class AnalysisService extends EventEmitter {
  constructor(httpClient: HttpClient, sessionManager: SessionManager);
  solveFlow(method?: AnalysisMethod, options?: CalculationOptions): Promise<SolveFlowResult>;
  getPowerFlowData(options?: { sessionId?: string; busNumbers?: number[]; branches?: Array<{ from_bus: number; to_bus: number; id?: string }> }): Promise<PowerFlowData | null>;
  getResults(sessionId?: string): Promise<SessionInfo | null>;
  batchCalculate(methods?: AnalysisMethod[], options?: CalculationOptions): Promise<any>;
  compareAnalysis(methods?: AnalysisMethod[]): Promise<any>;
  cancel(): void;
}

export class EditService extends EventEmitter {
  constructor(httpClient: HttpClient, sessionManager: SessionManager);
  editElement(elementType: ElementType, action: EditAction, options?: EditOptions): Promise<EditResult>;
  addElement(elementType: ElementType, data: any, options?: EditOptions): Promise<EditResult>;
  modifyElement(elementType: ElementType, identifier: any, data: any, options?: EditOptions): Promise<EditResult>;
  deleteElement(elementType: ElementType, identifier: any, options?: EditOptions): Promise<EditResult>;
  addBus(busData: BusData, options?: EditOptions): Promise<EditResult>;
  modifyBus(identifier: any, busData: Partial<BusData>, options?: EditOptions): Promise<EditResult>;
  deleteBus(identifier: any, options?: EditOptions): Promise<EditResult>;
  addLoad(loadData: LoadData, options?: EditOptions): Promise<EditResult>;
  modifyLoad(identifier: any, loadData: Partial<LoadData>, options?: EditOptions): Promise<EditResult>;
  deleteLoad(identifier: any, options?: EditOptions): Promise<EditResult>;
  addGenerator(generatorData: GeneratorData, options?: EditOptions): Promise<EditResult>;
  modifyGenerator(identifier: any, generatorData: Partial<GeneratorData>, options?: EditOptions): Promise<EditResult>;
  deleteGenerator(identifier: any, options?: EditOptions): Promise<EditResult>;
  addAcline(aclineData: AclineData, options?: EditOptions): Promise<EditResult>;
  modifyAcline(identifier: any, aclineData: Partial<AclineData>, options?: EditOptions): Promise<EditResult>;
  deleteAcline(identifier: any, options?: EditOptions): Promise<EditResult>;
  addTransformer(transformerData: TransformerData, options?: EditOptions): Promise<EditResult>;
  modifyTransformer(identifier: any, transformerData: Partial<TransformerData>, options?: EditOptions): Promise<EditResult>;
  deleteTransformer(identifier: any, options?: EditOptions): Promise<EditResult>;
}

// ==================== Main SDK Class ====================

export class Xolution extends EventEmitter {
  constructor();
  
  // Initialization
  initialize(config?: SDKConfig): Promise<boolean>;
  isConnected(): boolean;
  getStatus(): string;
  getBaseURL(): string;
  checkHealth(): Promise<any>;
  
  // Session Operations
  getSessionInfo(sessionId?: string): Promise<SessionInfo>;
  getNetwork(sessionId?: string, elementType?: string, identifier?: Record<string, unknown>): Promise<NetworkData>;
  getCachedNetwork(): NetworkData | null;
  updateCachedNetwork(networkData: NetworkData): void;
  getCachedCalculationResult(): CalculationResult | null;
  clearCache(): void;
  getUserSessions(userId?: string): Promise<SessionInfo[]>;
  deleteUserSessions(userId?: string): Promise<any>;
  
  // User File Management
  uploadUserFile(file: File, userId?: string, fileType?: UserFileType): Promise<any>;
  getUserFiles(userId?: string | undefined, fileType?: UserFileType): Promise<any>;
  deleteUserFile(fileName: string, fileType?: UserFileType): Promise<any>;
  getUserFileInfo(fileName: string, userId?: string | undefined): Promise<any>;
  createSessionFromFile(fileName: string, userId?: string): Promise<any>;
  saveSessionToUserFile(sessionId?: string): Promise<any>;
  saveSessionAsUserFile(newFileName: string, sessionId?: string): Promise<any>;

  // Study Files (.sub/.mon/.con)
  loadStudyFile(fileType: StudyFileType, fileName: string, sessionId?: string | null): Promise<LoadStudyFileResult>;
  loadSub(fileName: string, sessionId?: string | null): Promise<LoadStudyFileResult>;
  loadMon(fileName: string, sessionId?: string | null): Promise<LoadStudyFileResult>;
  loadCon(fileName: string, sessionId?: string | null): Promise<LoadStudyFileResult>;
  validateStudyFiles(sessionId?: string | null): Promise<StudyValidateResult>;

  // AC Contingency Analysis
  startContingencyAnalysis(
    sessionId?: string | null,
    settings?: ContingencySettings | null,
    config?: Record<string, unknown> | null
  ): Promise<AnalysisJob>;
  getAnalysisJob(jobId: string): Promise<AnalysisJob>;
  getAnalysisReport(jobId: string): Promise<ContingencyReport>;
  cancelAnalysisJob(jobId: string): Promise<any>;

  // Study-result history (durable, per-user)
  listStudyResults(): Promise<{ status: string; results: StudyResultMeta[] }>;
  getStudyResult(resultId: string): Promise<StudyResult>;
  deleteStudyResult(resultId: string): Promise<any>;
  
  // Edit Operations
  editElement(elementType: ElementType, action: EditAction, options?: EditOptions): Promise<EditResult>;
  addElement(elementType: ElementType, data: any, options?: EditOptions): Promise<EditResult>;
  modifyElement(elementType: ElementType, identifier: any, data: any, options?: EditOptions): Promise<EditResult>;
  deleteElement(elementType: ElementType, identifier: any, options?: EditOptions): Promise<EditResult>;
  getElementSchema(elementType: string): ElementSchema | null;

  // Calculation Operations
  solveFlow(method?: AnalysisMethod, options?: CalculationOptions): Promise<SolveFlowResult>;
  getPowerFlowData(options?: { sessionId?: string; busNumbers?: number[]; branches?: Array<{ from_bus: number; to_bus: number; id?: string }> }): Promise<PowerFlowData | null>;
  getResults(sessionId?: string): Promise<SessionInfo | null>;
  batchCalculate(methods?: AnalysisMethod[], options?: CalculationOptions): Promise<any>;
  compareAnalysis(methods?: AnalysisMethod[]): Promise<any>;
  
  // Convenience Methods
  uploadAndCalculate(file: File, method?: AnalysisMethod, options?: CalculationOptions): Promise<SolveFlowResult>;
  
  // Session Management
  getSession(): string | null;
  setSession(sessionId: string): void;
  clearSession(): void;
  hasSession(): boolean;
  getSessionData(key: string): any;
  
  // Configuration
  updateConfig(config: Partial<SDKConfig>): void;
  getConfig(): SDKConfig;
  
  // Cleanup
  reset(): void;
  destroy(): void;
}

// ==================== Exports ====================

export const PowerFlowApp: Xolution;
export default PowerFlowApp;
