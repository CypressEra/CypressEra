#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# ---------------------------------------------------------------------------
# Platform version — single source of truth for the version string surfaced
# in the React About modal and stamped onto every ACCC study-result meta.
# ---------------------------------------------------------------------------
if [[ ! -s VERSION ]]; then
    echo "ERROR: product-deploy/VERSION is missing or empty. Refusing to deploy." >&2
    exit 1
fi
PLATFORM_VERSION="$(tr -d '[:space:]' < VERSION)"
if [[ -z "$PLATFORM_VERSION" ]]; then
    echo "ERROR: product-deploy/VERSION contained only whitespace." >&2
    exit 1
fi
export PLATFORM_VERSION

# ---------------------------------------------------------------------------
# Build channel — the deployment environment surfaced in the About modal.
# Unlike VERSION this is per-environment config, not a committed file. The
# product is in its preview phase, so deployed instances report "preview" for
# now; set PLATFORM_BUILD in the environment / .env to override (e.g.
# "production" once we cut over). The value is a pass-through string.
# ---------------------------------------------------------------------------
PLATFORM_BUILD="${PLATFORM_BUILD:-preview}"
export PLATFORM_BUILD

# ---------------------------------------------------------------------------
# Colors
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# ---------------------------------------------------------------------------
# 1. Prerequisites
# ---------------------------------------------------------------------------
install_docker() {
    if command -v docker &>/dev/null && docker compose version &>/dev/null; then
        info "Docker and Docker Compose are already installed."
        return
    fi

    warn "Docker is not installed. Installing..."
    sudo apt-get update -y
    sudo apt-get install -y ca-certificates curl gnupg

    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
        sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg

    echo \
        "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
        $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
        sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

    sudo apt-get update -y
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

    sudo usermod -aG docker "$USER"
    info "Docker installed. You may need to log out and back in for group changes to take effect."
}

check_prerequisites() {
    install_docker

    if ! command -v openssl &>/dev/null; then
        info "Installing openssl..."
        sudo apt-get install -y openssl
    fi
}

# ---------------------------------------------------------------------------
# 2. Generate .env
# ---------------------------------------------------------------------------
generate_secret() {
    openssl rand -hex 32
}

setup_env() {
    if [[ -f .env ]]; then
        info ".env already exists — preserving existing configuration."
        return
    fi

    info "Generating .env from template..."
    cp .env.template .env

    # Replace [auto] placeholders with generated secrets
    local jwt_secret service_secret pg_password
    jwt_secret=$(generate_secret)
    service_secret=$(generate_secret)
    pg_password=$(generate_secret)

    sed -i.bak \
        -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${pg_password}|" \
        -e "s|^AUTH_JWT_SECRET=.*|AUTH_JWT_SECRET=${jwt_secret}|" \
        -e "s|^SERVICE_AUTH_SECRET=.*|SERVICE_AUTH_SECRET=${service_secret}|" \
        .env
    rm -f .env.bak

    # Expand ${VAR} references within .env (simple substitution)
    # DATABASE_URL and FRONTEND_BASE_URL reference other vars
    local db_user db_name
    db_user=$(grep '^POSTGRES_USER=' .env | cut -d= -f2)
    db_name=$(grep '^POSTGRES_DB=' .env | cut -d= -f2)
    local domain
    domain=$(grep '^DOMAIN=' .env | cut -d= -f2)

    sed -i.bak \
        -e "s|\${POSTGRES_USER}|${db_user}|g" \
        -e "s|\${POSTGRES_PASSWORD}|${pg_password}|g" \
        -e "s|\${POSTGRES_DB}|${db_name}|g" \
        -e "s|\${DOMAIN}|${domain}|g" \
        .env
    rm -f .env.bak

    chmod 600 .env
    info ".env created with generated secrets. Edit it to add API keys and admin credentials."
}

# ---------------------------------------------------------------------------
# 3. Pull images
# ---------------------------------------------------------------------------
REGISTRY="ghcr.io/cypressera"
IMAGES=(
    "react-ui/cypressera-react-ui"
    "api-server/cypressera-api-server"
    "agent-server/cypressera-agent-server"
    "flow-solver/cypressera-flow-solver"
)

pull_images() {
    local tag
    tag=$(grep '^IMAGE_TAG=' .env 2>/dev/null | cut -d= -f2 || echo "latest")
    tag="${tag:-latest}"

    for img in "${IMAGES[@]}"; do
        local full="${REGISTRY}/${img}:${tag}"
        info "Pulling ${full}..."
        if ! docker pull "$full"; then
            error "Failed to pull ${full}."
            error "If the package is private on ghcr.io, authenticate first:"
            error "  echo YOUR_GITHUB_TOKEN | docker login ghcr.io -u x-access-token --password-stdin"
            error "(PAT needs the read:packages scope.) Then re-run ./deploy.sh."
            exit 1
        fi
    done
    info "All images pulled successfully."
}

# ---------------------------------------------------------------------------
# 4. Extract flow-solver binary
# ---------------------------------------------------------------------------
extract_flow_solver() {
    local tag
    tag=$(grep '^IMAGE_TAG=' .env 2>/dev/null | cut -d= -f2 || echo "latest")
    tag="${tag:-latest}"

    mkdir -p bin

    local image="${REGISTRY}/flow-solver/cypressera-flow-solver:${tag}"
    local container_id

    info "Extracting flow-solver binary from ${image}..."
    container_id=$(docker create "$image" 2>/dev/null || {
        error "Failed to create container from ${image}."
        exit 1
    })

    docker cp "${container_id}:/app/flow-solver" bin/flow-solver
    docker rm "$container_id" > /dev/null

    chmod +x bin/flow-solver
    info "flow-solver binary extracted to bin/flow-solver"
}

# ---------------------------------------------------------------------------
# 5. Fix volume permissions
# ---------------------------------------------------------------------------
fix_permissions() {
    info "Setting volume permissions..."
    docker run --rm \
        -v product-deploy_user-data:/data \
        alpine sh -c "mkdir -p /data/models /data/sessions /data/results /data/knowledge && chown -R 1001:1001 /data"
}

# ---------------------------------------------------------------------------
# 6. Start services
# ---------------------------------------------------------------------------
start_services() {
    info "Starting services..."
    docker compose up -d

    info "Waiting for services to become healthy..."
    local retries=30
    local all_healthy=false

    for ((i = 1; i <= retries; i++)); do
        if docker compose ps --format json 2>/dev/null | grep -q '"running"' 2>/dev/null; then
            # Check if any service has exited
            local exited
            exited=$(docker compose ps --format '{{.Status}}' 2>/dev/null | grep -c "exited" || true)
            if [[ "$exited" -gt 0 ]]; then
                error "One or more containers exited unexpectedly:"
                docker compose ps --format "table {{.Name}}\t{{.Status}}"
                docker compose logs --tail=50
                exit 1
            fi
        fi

        # Check postgres specifically since other services depend on it
        if docker compose exec -T postgres pg_isready -U xflow &>/dev/null; then
            all_healthy=true
            break
        fi

        sleep 2
    done

    if [[ "$all_healthy" != "true" ]]; then
        warn "Timed out waiting for health checks. Check status with: docker compose ps"
    else
        info "All services are running."
    fi

    echo ""
    local public_ip
    public_ip=$(curl -sf --max-time 5 ifconfig.me 2>/dev/null || echo "unknown")
    local domain
    domain=$(grep '^DOMAIN=' .env | cut -d= -f2)
    info "========================================="
    info "  CypressEra is live!"
    info "  URL:  https://${domain}"
    if [[ "$public_ip" != "unknown" ]]; then
    info "  IP:   http://${public_ip}"
    fi
    info "========================================="
    if [[ "$public_ip" != "unknown" ]]; then
    echo ""
    info "DNS setup: Add an A record in GoDaddy:"
    info "  Type:  A"
    info "  Name:  flow"
    info "  Value: ${public_ip}"
    info "  TTL:   600"
    fi
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
    info "CypressEra Deployment"
    info "====================="

    check_prerequisites
    setup_env
    pull_images
    extract_flow_solver
    fix_permissions
    start_services
}

main "$@"
