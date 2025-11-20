# VSCode Web Server

**Run VS Code in your browser with enhanced security, performance optimizations, and production-ready deployment.**

A production-ready web-based VS Code server built on [code-server](https://github.com/coder/code-server) with security enhancements, performance optimizations, and modern deployment options.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node Version](https://img.shields.io/badge/node-22.x-brightgreen)](https://nodejs.org)
[![Docker](https://img.shields.io/badge/docker-ready-blue)](https://docker.com)

---

## Features

### Core Functionality

- **Full VS Code Experience**: Complete VS Code running in your browser
- **Terminal Access**: Integrated terminal with full shell access
- **Extension Support**: Install and use VS Code extensions
- **File Operations**: Full file system access and operations
- **Port Forwarding**: Forward ports for web development
- **Service Worker**: Offline capability and improved caching

### Security & Authentication

- **Argon2 Password Hashing**: Industry-standard password security with worker pool for non-blocking operation
- **Security Headers**: Comprehensive security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options)
- **Rate Limiting**: Protection against brute-force attacks on login
- **HTTPS/TLS Support**: Built-in support for custom SSL certificates
- **Request Timeout Protection**: 30-second timeout to prevent resource exhaustion

### Performance Optimizations (Active)

- **Brotli Compression**: 40-45% bandwidth reduction for faster load times
- **HTTP/2 Support**: Modern protocol with HTTP/1.1 fallback
- **Static File Caching**: Request deduplication for frequently accessed files
- **Settings Debouncing**: 98% reduction in disk writes
- **Request Batching**: Batched processing for static file requests

### Monitoring & Observability

- **Prometheus Metrics**: `/metrics` endpoint for monitoring integration
- **Health Checks**: `/healthz` endpoint for container orchestration
- **Audit Logging**: File-based audit trail with daily rotation
- **Performance Tracking**: HTTP request tracking and system metrics

### Deployment Ready

- **Docker**: Optimized multi-stage Dockerfile with security hardening
- **Docker Compose**: Production-ready configuration with resource limits
- **Kubernetes**: Full Helm chart with deployment manifests
- **CI/CD**: Complete GitHub Actions workflows for build, test, and release

---

## Quick Start

### Using Docker (Recommended)

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

### Using NPM

```bash
# 1. Install dependencies (Node 22 required)
npm install

# 2. Build VS Code and the server
npm run build:vscode
npm run build

# 3. Start the server
PASSWORD=your-password npm start

# 4. Access at http://localhost:8080
```

---

## Configuration

### Environment Variables

Create a `.env` file based on `.env.example`:

```bash
# Server Configuration
IDE_PORT=8080
IDE_HOST=0.0.0.0

# Authentication
IDE_PASSWORD=your-secure-password

# Features
DISABLE_TELEMETRY=true
DISABLE_UPDATE_CHECK=true

# Customization
APP_NAME=My VS Code Server
```

### Configuration File

Alternatively, use a YAML config file:

```yaml
bind-addr: 0.0.0.0:8080
auth: password
password: your-secure-password
disable-telemetry: true
user-data-dir: ~/.local/share/code-server
```

---

## Docker Deployment

### Quick Deploy

```bash
docker run -d \
  -p 8080:8080 \
  -e PASSWORD=your-password \
  -v $(pwd)/workspace:/home/coder/project \
  vscode-web:latest
```

### Build Your Own Image

```bash
# Build optimized image
docker build -f Dockerfile.optimized -t vscode-web:latest .

# Run with custom configuration
docker run -d \
  --name vscode-web \
  -p 8080:8080 \
  -e PASSWORD=your-password \
  -v ./workspace:/home/coder/project \
  -v vscode-data:/home/coder/.local/share/code-server \
  --security-opt no-new-privileges \
  --read-only \
  vscode-web:latest
```

### Docker Compose

The included `docker-compose.yml` provides:

- Resource limits (2 CPU cores, 2GB RAM)
- Health checks (30s interval)
- Volume persistence
- Security hardening
- Optional nginx reverse proxy

```bash
docker-compose up -d
```

---

## Kubernetes Deployment

A production-ready Helm chart is available in `ci/helm-chart/`.

```bash
# 1. Create namespace
kubectl create namespace code-server

# 2. Create password secret
kubectl create secret generic code-server-secret \
  --from-literal=password=your-secure-password \
  -n code-server

# 3. Install with Helm
helm install code-server ./ci/helm-chart \
  --namespace code-server \
  --set persistence.enabled=true \
  --set persistence.size=10Gi

# 4. Access via service/ingress
kubectl get svc -n code-server
```

The Helm chart includes:
- Deployment with configurable replicas
- Persistent Volume Claims
- Service and Ingress
- ConfigMaps and Secrets
- Resource limits and requests
- Health checks and readiness probes

---

## Project Structure

```
vscode-web-main/
├── src/
│   ├── browser/              # Frontend assets
│   │   ├── pages/           # HTML pages (modern login, error pages)
│   │   ├── media/           # Images and icons
│   │   └── serviceWorker.ts # Service worker for offline support
│   │
│   ├── node/                # Backend server
│   │   ├── entry.ts        # Main entry point
│   │   ├── app.ts          # Express app setup
│   │   ├── cli.ts          # CLI argument parsing
│   │   ├── routes/         # HTTP routes
│   │   ├── services/       # Service layer (monitoring, audit, etc.)
│   │   ├── utils/          # Request batching, timeouts
│   │   └── workers/        # Argon2 worker pool
│   │
│   └── common/             # Shared utilities
│
├── test/                   # Comprehensive test suite
│   ├── unit/              # Jest unit tests
│   ├── integration/       # Integration tests
│   └── e2e/               # Playwright E2E tests
│
├── ci/                     # CI/CD and deployment
│   ├── build/             # Build scripts
│   ├── dev/               # Development scripts
│   ├── helm-chart/        # Kubernetes Helm chart
│   └── steps/             # CI pipeline steps
│
├── docs/                   # Documentation
├── .github/workflows/      # GitHub Actions CI/CD
├── docker-compose.yml      # Docker Compose configuration
├── Dockerfile.optimized    # Production Docker image
└── package.json           # Dependencies and scripts
```

---

## Architecture

```
┌─────────────────────────────────────┐
│      Modern Browser UI              │
│  (Service Worker + Modern Login)    │
└─────────────────────────────────────┘
                ↓
┌─────────────────────────────────────┐
│     Security & Performance          │
│  (Headers, Rate Limiting,           │
│   Brotli, HTTP/2, Caching)          │
└─────────────────────────────────────┘
                ↓
┌─────────────────────────────────────┐
│     Express Server + Monitoring     │
│  (Audit Logs, Prometheus Metrics)   │
└─────────────────────────────────────┘
                ↓
┌─────────────────────────────────────┐
│       VS Code Integration           │
│  (Full IDE, Extensions, Terminal)   │
└─────────────────────────────────────┘
```

---

## Security

### Implemented Security Features

- **Password Security**: Argon2 hashing with worker pool
- **Security Headers**:
  - Content Security Policy (CSP)
  - HTTP Strict Transport Security (HSTS)
  - X-Frame-Options: SAMEORIGIN
  - X-Content-Type-Options: nosniff
  - X-XSS-Protection
  - Referrer-Policy
  - Permissions-Policy
- **Rate Limiting**: Login protection (2 req/min + 12 req/hour)
- **Request Timeout**: 30-second timeout to prevent hanging requests
- **HTTPS/TLS**: Custom certificate support
- **Audit Logging**: File-based audit trail with rotation

### Security Best Practices

When deploying to production:

1. **Always use HTTPS** with valid certificates
2. **Use strong passwords** (minimum 12 characters)
3. **Keep dependencies updated** (use Dependabot)
4. **Monitor audit logs** regularly
5. **Set up resource limits** in Docker/K8s
6. **Use secrets management** (not environment variables in production)
7. **Enable rate limiting** on reverse proxy

---

## Performance

### Active Optimizations

| Feature | Implementation | Benefit |
|---------|---------------|---------|
| Brotli Compression | Enabled on all text content | 40-45% bandwidth reduction |
| HTTP/2 | Active with fallback | Faster parallel requests |
| Static File Caching | Request deduplication | Reduced disk I/O |
| Settings Debouncing | 1-second debounce | 98% fewer disk writes |
| Request Batching | Batched static files | Improved throughput |
| Worker Pool | Argon2 hashing | Non-blocking auth |

### Build Performance

```bash
# Production build
npm run build:vscode  # ~2-3 minutes
npm run build         # ~30 seconds

# Development watch mode
npm run watch         # Hot reload enabled
```

---

## Testing

Comprehensive test suite with 60%+ code coverage:

```bash
# Run all unit tests
npm run test:unit

# Run integration tests
npm run test:integration

# Run E2E tests (Playwright)
npm run test:e2e

# Run specific tests
npm run test:scripts
npm run test:native
```

### Test Coverage

- **Unit Tests**: Core functionality, routes, services, utilities
- **Integration Tests**: Extension installation, help commands
- **E2E Tests**: Login, logout, terminal, extensions, file operations, webview

Coverage reports are generated in the `coverage/` directory.

---

## Development

### Prerequisites

- Node.js 22.x
- npm or yarn
- Git

### Development Workflow

```bash
# 1. Install dependencies
npm install

# 2. Build VS Code (first time only)
npm run build:vscode

# 3. Start development server with watch mode
npm run watch

# 4. Make changes and test
npm run test:unit

# 5. Lint and format
npm run lint:ts
npm run prettier
```

### Code Quality

- **ESLint**: TypeScript linting with strict rules
- **Prettier**: Code formatting (tabs, 120 char width)
- **TypeScript**: Strict type checking
- **Jest**: Unit and integration testing
- **Playwright**: E2E testing

---

## Monitoring

### Prometheus Metrics

The `/metrics` endpoint exposes Prometheus-compatible metrics:

```bash
# Access metrics
curl http://localhost:8080/metrics
```

Available metrics:
- HTTP request duration
- HTTP request count by status code
- Active connections
- System resource usage

### Monitoring Dashboard

Access the built-in monitoring dashboard at:

```
http://localhost:8080/monitoring-dashboard
```

### Health Checks

```bash
# Health check endpoint
curl http://localhost:8080/healthz

# Response: { "status": "ok" }
```

---

## CI/CD

GitHub Actions workflows handle:

- **Build**: Compile and test on every push
- **Test**: Unit, integration, and E2E tests
- **Security**: CodeQL analysis and Trivy container scanning
- **Release**: Automated releases with semantic versioning
- **Publish**: Docker image publishing
- **Dependencies**: Automated Dependabot updates

View workflows in `.github/workflows/`.

---

## Roadmap

### Implemented ✅

- [x] Core VS Code server functionality
- [x] Docker deployment with optimization
- [x] Kubernetes Helm chart
- [x] Security headers and HTTPS
- [x] Performance optimizations (Brotli, HTTP/2, caching)
- [x] Monitoring with Prometheus
- [x] Audit logging
- [x] Comprehensive testing suite
- [x] CI/CD with GitHub Actions

### Planned 📋

- [ ] Multi-user support with user isolation
- [ ] Plugin system integration
- [ ] OAuth authentication providers
- [ ] Advanced CSRF protection on all forms
- [ ] Real-time collaboration
- [ ] Cloud storage integration (S3, GCS, Azure)
- [ ] Extension marketplace
- [ ] Horizontal scaling with session persistence

---

## Documentation

- **[Getting Started Guide](GETTING_STARTED.md)** - Detailed setup instructions
- **[Changelog](CHANGELOG.md)** - Version history and changes
- **[Improvements](IMPROVEMENTS_IMPLEMENTED.md)** - Implemented improvements
- **[Contributing Guide](docs/CONTRIBUTING.md)** - How to contribute
- **[Architecture Docs](docs/architecture/)** - Technical architecture details
- **[Historical Audits](docs/historical-audits/)** - Past security and code audits

---

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes with tests
4. Ensure tests pass (`npm run test:unit`)
5. Lint your code (`npm run lint:ts`)
6. Commit your changes (`git commit -m 'Add amazing feature'`)
7. Push to the branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

See [CONTRIBUTING.md](docs/CONTRIBUTING.md) for detailed guidelines.

---

## License

MIT License - see [LICENSE](LICENSE) file for details.

This project is based on [code-server](https://github.com/coder/code-server) by Coder.

---

## Acknowledgments

- Built on [code-server](https://github.com/coder/code-server) by Coder
- Powered by [VS Code](https://github.com/microsoft/vscode) by Microsoft
- Security best practices from OWASP
- Performance optimizations inspired by modern web standards

---

## Support

- **Issues**: [GitHub Issues](https://github.com/your-org/vscode-web-main/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/vscode-web-main/discussions)
- **Documentation**: See `docs/` directory

---

**Built for developers who need a powerful, secure, and performant web-based development environment.**
