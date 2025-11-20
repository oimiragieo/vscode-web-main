# Getting Started with VSCode Web Server

A step-by-step guide to getting your web-based VS Code server up and running.

## What This Is

This is a **production-ready VS Code server** built on [code-server](https://github.com/coder/code-server) with:

- Enhanced security features (Argon2 hashing, security headers, rate limiting)
- Performance optimizations (Brotli, HTTP/2, caching, debouncing)
- Production deployment options (Docker, Kubernetes)
- Monitoring and observability (Prometheus metrics, audit logging)

## Prerequisites

Before you start, ensure you have:

1. **Node.js 22.x** (required version)
   ```bash
   node --version  # Must be v22.x.x
   ```

2. **Git** (any recent version)
   ```bash
   git --version
   ```

3. **System Requirements:**
   - At least 4GB RAM (for building VS Code)
   - 10GB free disk space (for dependencies and build artifacts)
   - Linux, macOS, or Windows with WSL2

## Quick Start Options

Choose the method that best fits your needs:

### Option 1: Docker (Recommended for Production)

Fastest way to get started. No build required if using pre-built images.

```bash
# 1. Clone the repository
git clone <repository-url>
cd vscode-web-main

# 2. Set your password
echo "PASSWORD=your-secure-password" > .env

# 3. Start with Docker Compose
docker-compose up -d

# 4. Access at http://localhost:8080
```

### Option 2: NPM (For Development)

Build from source for development and customization.

```bash
# 1. Clone the repository
git clone <repository-url>
cd vscode-web-main

# 2. Initialize VS Code submodule (CRITICAL!)
git submodule update --init --recursive

# 3. Install dependencies
npm install

# 4. Build VS Code (takes 10-30 minutes)
npm run build:vscode

# 5. Build the server (takes 1-2 minutes)
npm run build

# 6. Start the server
PASSWORD=your-secure-password npm start

# 7. Access at http://localhost:8080
```

---

## Detailed Installation (NPM Method)

### Step 1: Clone the Repository

```bash
git clone <repository-url>
cd vscode-web-main
```

### Step 2: Initialize VS Code Submodule

This step is **critical** - the build will fail without it:

```bash
# Initialize and fetch the VS Code submodule
git submodule update --init --recursive

# Verify it worked
ls lib/vscode/package.json
# Should display: lib/vscode/package.json
```

If you see "No such file or directory", the submodule initialization failed. Try:

```bash
git submodule init
git submodule update --recursive
```

### Step 3: Install Dependencies

```bash
npm install
```

This installs dependencies for:
- The main code-server project
- The test directory
- The VS Code submodule

**Time:** 5-15 minutes depending on internet speed

**Disk space:** ~2-3GB for node_modules

### Step 4: Build VS Code

```bash
npm run build:vscode
```

**Time:** 10-30 minutes depending on CPU

**Output:**
- TypeScript compilation messages
- Build artifacts in `lib/vscode/out/`
- Success message at completion

**Troubleshooting:**
If you run out of memory, increase Node.js heap size:

```bash
export NODE_OPTIONS="--max-old-space-size=8192"
npm run build:vscode
```

### Step 5: Build the Server

```bash
npm run build
```

**Time:** 1-2 minutes

**Output:**
- Compiled JavaScript in `out/` directory
- No TypeScript errors

### Step 6: Run the Server

```bash
# Method 1: Using npm start
PASSWORD=your-secure-password npm start

# Method 2: Using the binary directly
export PASSWORD=your-secure-password
./out/node/entry.js

# Method 3: With custom port
PASSWORD=your-password PORT=3000 ./out/node/entry.js
```

The server will start and display:

```
[timestamp] INFO  HTTP server listening on http://0.0.0.0:8080
```

### Step 7: Access the IDE

Open your browser to:

```
http://localhost:8080
```

You'll see a modern login page. Enter the password you set in the `PASSWORD` environment variable.

---

## Docker Installation

### Using Docker Compose (Recommended)

The easiest Docker method with volume persistence and health checks.

```bash
# 1. Create environment file
cat > .env << EOF
PASSWORD=your-secure-password
PORT=8080
DISABLE_TELEMETRY=true
EOF

# 2. Start the service
docker-compose up -d

# 3. Check status
docker-compose ps

# 4. View logs
docker-compose logs -f

# 5. Stop the service
docker-compose down
```

**Features included in docker-compose.yml:**
- Resource limits (2 CPU, 2GB RAM)
- Health checks (30s interval)
- Volume persistence
- Security hardening
- Automatic restart on failure

### Building Your Own Docker Image

```bash
# Build from Dockerfile.optimized
docker build -f Dockerfile.optimized -t vscode-web:latest .

# Run with basic settings
docker run -d \
  --name vscode-web \
  -p 8080:8080 \
  -e PASSWORD=your-password \
  -v $(pwd)/workspace:/home/coder/project \
  vscode-web:latest

# Run with all security options
docker run -d \
  --name vscode-web \
  -p 8080:8080 \
  -e PASSWORD=your-password \
  -v $(pwd)/workspace:/home/coder/project \
  -v vscode-data:/home/coder/.local/share/code-server \
  --security-opt no-new-privileges \
  --read-only \
  --tmpfs /tmp \
  --health-cmd="curl -f http://localhost:8080/healthz || exit 1" \
  --health-interval=30s \
  vscode-web:latest
```

### Kubernetes Deployment

For production Kubernetes deployment:

```bash
# 1. Create namespace
kubectl create namespace code-server

# 2. Create password secret
kubectl create secret generic code-server-secret \
  --from-literal=password=your-secure-password \
  -n code-server

# 3. Deploy using Helm chart
helm install code-server ./ci/helm-chart \
  --namespace code-server \
  --set persistence.enabled=true \
  --set persistence.size=10Gi \
  --set resources.limits.cpu=2 \
  --set resources.limits.memory=4Gi

# 4. Check deployment
kubectl get pods -n code-server
kubectl get svc -n code-server

# 5. Port forward for testing
kubectl port-forward -n code-server svc/code-server 8080:8080
```

---

## Configuration

### Environment Variables

All available environment variables (create a `.env` file):

```bash
# Server Configuration
PORT=8080                    # Server port
HOST=0.0.0.0                # Bind address

# Authentication
PASSWORD=your-password       # Login password (required)

# Features
DISABLE_TELEMETRY=true      # Disable telemetry
DISABLE_UPDATE_CHECK=true   # Disable update notifications
APP_NAME=My Code Server     # Custom application name

# Paths
USER_DATA_DIR=/path/to/data # User data directory
EXTENSIONS_DIR=/path/to/ext # Extensions directory

# Security
HASHED_PASSWORD=...         # Pre-hashed Argon2 password
CERT=/path/to/cert.pem     # TLS certificate
CERT_KEY=/path/to/key.pem  # TLS private key

# Performance
NODE_OPTIONS=--max-old-space-size=4096  # Node.js heap size
```

### Configuration File

Create `~/.config/code-server/config.yaml`:

```yaml
bind-addr: 0.0.0.0:8080
auth: password
password: your-secure-password
disable-telemetry: true
disable-update-check: true
user-data-dir: ~/.local/share/code-server
extensions-dir: ~/.local/share/code-server/extensions

# Optional: TLS configuration
cert: /path/to/cert.pem
cert-key: /path/to/key.pem
```

### CLI Arguments

All configuration can also be passed as CLI arguments:

```bash
./out/node/entry.js \
  --bind-addr 0.0.0.0:8080 \
  --auth password \
  --password your-password \
  --disable-telemetry \
  --user-data-dir ~/.local/share/code-server \
  /path/to/project
```

---

## Common Issues and Solutions

### Issue: "lib/vscode/package.json is missing"

**Cause:** VS Code submodule not initialized

**Solution:**
```bash
git submodule update --init --recursive
ls lib/vscode/package.json  # Verify it exists
```

### Issue: "Cannot find module '@coder/logger'"

**Cause:** Dependencies not installed

**Solution:**
```bash
rm -rf node_modules package-lock.json
npm install
```

### Issue: Build fails with "JavaScript heap out of memory"

**Cause:** Insufficient memory for VS Code build

**Solution:**
```bash
export NODE_OPTIONS="--max-old-space-size=8192"
npm run build:vscode
```

### Issue: "EACCES: permission denied"

**Cause:** Permission issues with config directory

**Solution:**
```bash
# Don't run as root
sudo chown -R $USER:$USER ~/.config/code-server
sudo chown -R $USER:$USER ~/.local/share/code-server
```

### Issue: Docker build fails

**Cause:** VS Code submodule not initialized before Docker build

**Solution:**
```bash
# Initialize submodule BEFORE building Docker image
git submodule update --init --recursive
docker build -f Dockerfile.optimized -t vscode-web:latest .
```

### Issue: "Failed to load resource" in browser console

**Cause:** Service worker caching issues after update

**Solution:**
- Hard refresh: Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (Mac)
- Clear browser cache
- Unregister service worker in DevTools > Application > Service Workers

---

## Development Workflow

### Watch Mode

Automatically rebuild on file changes:

```bash
npm run watch
```

This starts a development server with hot reload. Make changes to TypeScript files in `src/` and they'll be automatically recompiled.

### Running Tests

```bash
# Run all unit tests
npm run test:unit

# Run integration tests
npm run test:integration

# Run E2E tests with Playwright
npm run test:e2e

# Run specific test file
npm run test:unit -- path/to/test.ts

# Run tests with coverage
npm run test:unit -- --coverage
```

### Linting and Formatting

```bash
# Format all code with Prettier
npm run prettier

# Lint TypeScript files
npm run lint:ts

# Lint shell scripts
npm run lint:scripts

# Format and update docs
npm run fmt
```

### Building for Production

```bash
# Clean previous builds
npm run clean

# Build VS Code
npm run build:vscode

# Build server
npm run build

# Create release packages
npm run release
```

---

## Production Deployment Checklist

Before deploying to production:

- [ ] Use HTTPS with valid certificates (not self-signed)
- [ ] Set a strong password (minimum 12 characters, mixed case, numbers, symbols)
- [ ] Enable rate limiting on reverse proxy (nginx, Caddy, etc.)
- [ ] Set up log rotation for audit logs
- [ ] Configure resource limits (CPU, memory, disk)
- [ ] Enable monitoring (Prometheus metrics at `/metrics`)
- [ ] Set up health checks (use `/healthz` endpoint)
- [ ] Configure backups for user data directory
- [ ] Use secrets management (not environment variables)
- [ ] Enable security headers (already enabled in app)
- [ ] Review and configure CSP policy if needed
- [ ] Set up alerting for failed health checks
- [ ] Test disaster recovery procedures

---

## Monitoring Your Instance

### Health Check

```bash
curl http://localhost:8080/healthz
# Response: {"status":"ok"}
```

### Prometheus Metrics

```bash
curl http://localhost:8080/metrics
```

Available metrics:
- `http_request_duration_seconds` - Request latency
- `http_requests_total` - Total requests by status code
- `nodejs_*` - Node.js runtime metrics
- Custom application metrics

### Monitoring Dashboard

Access the built-in dashboard:

```
http://localhost:8080/monitoring-dashboard
```

Shows real-time metrics and system status.

### Audit Logs

Audit logs are stored in:
```
~/.local/share/code-server/audit-logs/
```

Logs include:
- Login attempts (successful and failed)
- Session creation and destruction
- File access (if enabled)
- Configuration changes

---

## Next Steps

### For Production Use

1. Review [README.md](README.md) for full feature list
2. Set up HTTPS with Let's Encrypt
3. Configure reverse proxy (nginx/Caddy)
4. Enable monitoring and alerting
5. Set up automated backups

### For Development

1. Read architecture documentation in [docs/architecture/](docs/architecture/)
2. Explore the codebase structure in [docs/claude-codebase-analysis.md](docs/claude-codebase-analysis.md)
3. Check [IMPROVEMENTS_IMPLEMENTED.md](IMPROVEMENTS_IMPLEMENTED.md) for recent changes
4. Review test examples in `test/` directory

### For Contributing

1. Read [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)
2. Check open issues on GitHub
3. Run tests before submitting PRs
4. Follow code style guidelines (Prettier + ESLint)

---

## Getting Help

- **Documentation**: See [docs/](docs/) directory
- **Issues**: GitHub Issues for bug reports
- **Upstream docs**: [code-server documentation](https://coder.com/docs/code-server)
- **VS Code docs**: [VS Code documentation](https://code.visualstudio.com/docs)

---

## License

MIT License - See [LICENSE](LICENSE) file for details.

---

**Last Updated:** 2025-11-20

**Status:** Production ready - actively maintained
