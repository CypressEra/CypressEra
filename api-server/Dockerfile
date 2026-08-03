# API server build (Go only)
# The flow-solver binary is injected at runtime via volume mount

# ---------- Go API server build ----------
FROM golang:1.24-alpine AS builder

RUN apk add --no-cache git ca-certificates tzdata

WORKDIR /app

COPY go.mod go.sum ./

RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o main ./src/main.go


# ---------- Final runtime image ----------
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    ca-certificates \
    tzdata \
    curl \
    libsuitesparse-dev \
    && rm -rf /var/lib/apt/lists/*

# Create symlink for libklu.so.2 (solver expects v2, Debian bookworm has v1)
RUN ln -sf /usr/lib/x86_64-linux-gnu/libklu.so.1 /usr/lib/x86_64-linux-gnu/libklu.so.2 && \
    ldconfig

RUN groupadd -g 1001 app && \
    useradd -u 1001 -g app -M -s /usr/sbin/nologin app

WORKDIR /app

COPY --from=builder /app/main .
COPY --from=builder /app/config.yaml ./config.yaml
COPY --from=builder /app/assets ./assets

# Directory where flow-solver binary will be mounted at runtime
RUN mkdir -p /flow-solver/target/release

# User data volume mount point — must be writable by app user
RUN mkdir -p /user-data && chown -R app:app /user-data

RUN mkdir -p /app/data && chown -R app:app /app

USER app

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

CMD ["./main"]
