#!/bin/bash
# Entrypoint script for VSCode Web IDE Docker container

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  VSCode Web IDE - Starting...${NC}"
echo -e "${GREEN}========================================${NC}"

# Function to print info
info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

# Function to print warning
warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Function to print error
error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if password is set
if [ -z "$PASSWORD" ] && [ -z "$HASHED_PASSWORD" ]; then
    warn "No password set! Authentication will be required but no password is configured."
    warn "Set PASSWORD or HASHED_PASSWORD environment variable."
fi

# Print configuration
info "Configuration:"
info "  Port: ${PORT:-8080}"
info "  Host: ${HOST:-0.0.0.0}"
info "  User Data Dir: ${USER_DATA_DIR:-~/.local/share/code-server}"
info "  Extensions Dir: ${EXTENSIONS_DIR:-~/.local/share/code-server/extensions}"
info "  Telemetry: $([ "$DISABLE_TELEMETRY" = "true" ] && echo "Disabled" || echo "Enabled")"

# Create config directory if it doesn't exist
CONFIG_DIR="${HOME}/.config/code-server"
mkdir -p "$CONFIG_DIR"

# Generate config file if it doesn't exist
if [ ! -f "$CONFIG_DIR/config.yaml" ]; then
    info "Generating default configuration..."
    cat > "$CONFIG_DIR/config.yaml" <<EOF
bind-addr: ${HOST:-0.0.0.0}:${PORT:-8080}
auth: password
password: ${PASSWORD:-}
cert: false
disable-telemetry: ${DISABLE_TELEMETRY:-true}
disable-update-check: ${DISABLE_UPDATE_CHECK:-false}
EOF
    info "Configuration file created at $CONFIG_DIR/config.yaml"
fi

# Run startup scripts if they exist
if [ -d "${HOME}/entrypoint.d" ]; then
    info "Running startup scripts..."
    for script in "${HOME}/entrypoint.d"/*; do
        if [ -x "$script" ]; then
            info "  Executing: $(basename "$script")"
            "$script"
        fi
    done
fi

# Handle signals gracefully
_term() {
    info "Received SIGTERM, shutting down gracefully..."
    kill -TERM "$child" 2>/dev/null
}

trap _term SIGTERM SIGINT

info "Starting VSCode Web IDE..."
echo -e "${GREEN}========================================${NC}\n"

# Execute the command
exec "$@" &

child=$!
wait "$child"
