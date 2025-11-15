# VSCode Web IDE - Codebase Documentation

## Overview

This is a production-ready web-based IDE built on top of VSCode, designed to run in the browser with full VS Code functionality. The project enables remote development, collaborative coding, and cloud-based development environments.

**Architecture:** Client/Server Web Application
- **Backend:** Node.js/Express server with WebSocket support
- **Frontend:** Full VSCode web client (Monaco Editor + Workbench)
- **Communication:** HTTP + WebSocket for bidirectional real-time communication
- **Deployment:** Standalone binary, Docker container, or NPM package

---

## Extension Integration Strategy

### Two Approaches for Extensions

#### 1. **Code-Server Plugins** (Server-Side Extensions)
Modern plugin system for extending the server with new capabilities:
- Add custom HTTP/WebSocket routes
- Create new API endpoints
- Integrate external tools and services
- Custom authentication providers
- Middleware injection
- Service sharing via registry

**Location:** `src/core/plugin.ts`

**Example Use Cases:**
- Database connection managers
- Cloud service integrations (AWS, GCP, Azure)
- Custom file viewers (PDF, CSV, Markdown)
- Linter/formatter integrations
- Collaborative editing features
- Real-time analytics
- Terminal enhancements
- Project templates
- CI/CD integrations

#### 2. **VSCode Extensions** (Client-Side Extensions)
Standard VSCode extensions work out-of-the-box:
- Language support (syntax, IntelliSense)
- Themes and UI customizations
- Debuggers
- Snippets and commands
- Keybindings

**Installation:**
```bash
code-server --install-extension ms-python.python
code-server --install-extension dbaeumer.vscode-eslint
```

### Hybrid Approach
Combine both for maximum flexibility:
- **Plugins** provide backend services (database access, API integrations)
- **Extensions** consume those services via API bridge
- Example: Database plugin exposes REST API → VSCode extension provides UI

---

## Directory Structure

```
vscode-web-main/
├── src/                      # Main source code
│   ├── browser/             # Frontend assets (HTML, CSS, media)
│   ├── common/              # Shared utilities (client + server)
│   ├── core/                # Plugin system, security, config
│   └── node/                # Backend server code
├── test/                     # Test suites (unit, integration, e2e)
├── ci/                       # Build scripts and CI/CD
├── lib/                      # External libraries (VSCode source)
├── docs/                     # Documentation
├── patches/                  # NPM package patches
└── typings/                  # TypeScript type definitions
```

---

## Quick Navigation Index

### Core Server Components
- [src/node/](src/node/claude.md) - Backend server implementation
- [src/node/routes/](src/node/routes/claude.md) - HTTP route handlers
- [src/core/](src/core/claude.md) - Plugin system & security
- [src/common/](src/common/claude.md) - Shared utilities

### Frontend & UI
- [src/browser/](src/browser/claude.md) - Frontend assets and pages

### Testing
- [test/](test/claude.md) - Test suites and utilities

### Build & Deployment
- [ci/](ci/claude.md) - Build scripts and Docker configs

### Documentation
- [docs/](docs/claude.md) - Integration guides and analysis

---

## Key Entry Points

### Server Entry Points

#### `src/node/entry.ts`
Main application entry point. Determines execution mode:
- Server mode (web server)
- CLI mode (extension management)
- Child process mode (spawned instances)
- Existing instance mode (IPC communication)

#### `src/node/main.ts`
Core server orchestration:
- `runCodeServer()` - Initialize and start web server
- `runCodeCli()` - Handle VSCode CLI commands
- `openInExistingInstance()` - IPC for file opening

#### `src/node/app.ts`
Express application factory:
- Creates HTTP/HTTPS server
- Configures middleware stack
- Sets up WebSocket routing
- Manages TLS/SSL

---

## Core Services Architecture

### Application Services

| Service | Location | Purpose |
|---------|----------|---------|
| **PluginManager** | `src/core/plugin.ts` | Plugin lifecycle & dependency management |
| **SecurityManager** | `src/core/security.ts` | CSRF, input validation, rate limiting |
| **UpdateProvider** | `src/node/update.ts` | GitHub-based update checking |
| **SettingsProvider** | `src/node/settings.ts` | JSON-based settings persistence |
| **Heart** | `src/node/heart.ts` | Activity tracking & idle timeout |
| **EditorSessionManager** | `src/node/vscodeSocket.ts` | Editor session lifecycle |
| **SocketProxyProvider** | `src/node/socket.ts` | TLS socket proxying |

### Request Flow

```
Client Request
    ↓
Express Middleware Chain
    ↓
Authentication Check (if enabled)
    ↓
Route Handler
    ↓
VSCode Server (if IDE route)
    ↓
Response to Client
```

---

## API Endpoints

### HTTP Endpoints

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/` | GET | Yes* | VSCode IDE interface |
| `/login` | GET/POST | No | Authentication |
| `/logout` | GET/POST | Yes | Session termination |
| `/healthz` | GET | No | Health check |
| `/update` | GET | Yes | Check for updates |
| `/manifest.json` | GET | No | PWA manifest |
| `/proxy/:port/*` | ALL | Yes | Port forwarding (relative) |
| `/absproxy/:port/*` | ALL | Yes | Port forwarding (absolute) |
| `/_static/*` | GET | No | Static assets |

*Redirects to `/login` if not authenticated

### WebSocket Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/` | VSCode WebSocket connection |
| `/proxy/:port/*` | WebSocket port forwarding |
| `/healthz` | Health check WebSocket |

---

## Plugin System Deep Dive

### Plugin Interface

```typescript
interface IPlugin {
  metadata: PluginMetadata
  init(context: PluginContext): Promise<void>
  destroy(): Promise<void>
  healthCheck?(): Promise<boolean>
}

interface PluginContext {
  app: Express              // HTTP router
  wsRouter: Express         // WebSocket router
  config: any              // Configuration
  logger: Logger           // Logger instance
  events: EventEmitter     // Event bus
  services: Map<string, any>  // Service registry
}
```

### Plugin Capabilities

1. **Route Registration**
   - Add custom HTTP endpoints
   - Register WebSocket handlers
   - Inject middleware

2. **Service Registry**
   - Share services between plugins
   - Dependency injection
   - Loose coupling

3. **Event System**
   - Plugin lifecycle events
   - Custom event emission
   - Inter-plugin communication

4. **Health Monitoring**
   - Optional health checks
   - Automatic monitoring
   - Graceful degradation

### Example Plugin

```typescript
export class MyPlugin extends BasePlugin {
  metadata = {
    name: 'my-plugin',
    version: '1.0.0',
    description: 'Example plugin',
    dependencies: []
  }

  async init(context: PluginContext): Promise<void> {
    const { app, logger, services } = context

    // Register service
    const myService = new MyService()
    services.set('my-service', myService)

    // Add route
    app.get('/api/my-plugin', async (req, res) => {
      const data = await myService.getData()
      res.json(data)
    })

    logger.info('MyPlugin initialized')
  }

  async destroy(): Promise<void> {
    // Cleanup resources
  }

  async healthCheck(): Promise<boolean> {
    return true
  }
}
```

---

## Security Features

### Built-In Security (src/core/security.ts)

1. **CSRF Protection**
   - Token generation and validation
   - One-time use tokens
   - 1-hour expiration

2. **Security Headers**
   - Content Security Policy
   - X-Frame-Options
   - X-Content-Type-Options
   - HSTS support

3. **Rate Limiting**
   - In-memory rate limiter
   - Configurable limits
   - Automatic cleanup

4. **Input Validation**
   - Type checking
   - Length validation
   - Pattern matching
   - HTML sanitization

5. **Authentication**
   - Password (Argon2 hashing)
   - Cookie-based sessions
   - Configurable auth types

---

## Configuration Management

### CLI Configuration (src/node/cli.ts)

**Key Flags:**
- `--bind-addr` - Server address (default: 127.0.0.1:8080)
- `--auth` - Authentication type (password|none)
- `--password` - Set password
- `--cert/--cert-key` - HTTPS certificates
- `--user-data-dir` - User data directory
- `--extensions-dir` - Extensions directory
- `--disable-telemetry` - Privacy mode

### Environment Variables (.env)

See `.env.example` for complete configuration options:
- Server settings
- Authentication
- Security options
- Paths and directories
- Application settings
- Docker configuration
- Logging levels

---

## Build System

### Build Commands

```bash
# Build VSCode from source
npm run build:vscode

# Build TypeScript
npm run build

# Development mode
npm run watch

# Testing
npm run test:unit
npm run test:integration
npm run test:e2e

# Release
npm run release
npm run package
```

### Build Process

1. **postinstall.sh** - Check VS Code submodule
2. **build-vscode.sh** - Compile VS Code
3. **build-code-server.sh** - Compile TypeScript
4. **build-release.sh** - Create release artifacts
5. **build-packages.sh** - Create platform packages

---

## Testing Strategy

### Test Organization

```
test/
├── unit/              # Jest unit tests
│   ├── common/       # Common utilities
│   └── node/         # Node.js code
├── integration/       # Integration tests
├── e2e/              # Playwright E2E tests
│   ├── extensions/   # Test extension
│   └── models/       # Page object models
└── utils/            # Test utilities
```

**Coverage Target:** 60%

**Frameworks:**
- Jest (unit/integration)
- Playwright (E2E)
- ts-jest (TypeScript support)

---

## Deployment Options

### Docker

**Optimized multi-stage build:**
- Alpine Linux base (minimal size)
- Non-root user (security)
- Health checks
- Volume mounts
- Multi-architecture support

```bash
docker build -f Dockerfile.optimized -t vscode-web .
docker run -p 8080:8080 vscode-web
```

### Docker Compose

```bash
docker-compose up -d
```

**Features:**
- Nginx reverse proxy
- Resource limits
- Health checks
- Network isolation
- Traefik labels

### NPM Package

```bash
npm install -g code-server
code-server
```

### Standalone Binary

```bash
curl -fsSL https://code-server.dev/install.sh | sh
code-server
```

---

## Common Extension Patterns

### 1. REST API Plugin

Add custom REST endpoints for external integrations:
- Project management APIs
- Build system integrations
- Deployment triggers
- Metrics collection

### 2. Database Integration

Connect to databases and provide query interfaces:
- PostgreSQL, MySQL, MongoDB
- Schema exploration
- Query execution
- Result visualization

### 3. Collaborative Editing

Real-time collaboration features:
- WebSocket-based sync
- Operational transformation
- Cursor tracking
- User presence

### 4. Custom Authentication

Replace or extend authentication:
- OAuth2/OIDC
- SAML
- LDAP/AD
- Multi-factor auth

### 5. Cloud Service Integration

Connect to cloud providers:
- AWS S3, EC2, Lambda
- GCP Storage, Compute
- Azure Blob, VMs
- File upload/download

### 6. Linter/Formatter Integration

Integrate code quality tools:
- ESLint, Pylint, RuboCop
- Prettier, Black, gofmt
- Real-time feedback
- Auto-fix support

### 7. Terminal Enhancements

Extend terminal capabilities:
- Custom shells
- Terminal multiplexing
- Command logging
- Output processing

### 8. File System Providers

Add virtual file systems:
- Remote file systems (S3, FTP, SFTP)
- In-memory file systems
- Encrypted file systems
- Version control integration

---

## Performance Considerations

### Plugin Performance

1. **Lazy Loading**
   - Load heavy dependencies on-demand
   - Dynamic imports for large modules

2. **Caching**
   - Cache expensive operations
   - Use service registry for shared caches
   - Implement TTL and cleanup

3. **Connection Pooling**
   - Reuse database connections
   - HTTP connection pooling
   - WebSocket connection management

4. **Resource Cleanup**
   - Implement proper destroy() methods
   - Close connections and file handles
   - Clear timers and intervals

---

## Development Workflow

### Adding a New Plugin

1. Create plugin file in `src/plugins/`
2. Implement `IPlugin` interface
3. Register in plugin manager
4. Add tests
5. Update documentation

### Adding a New Route

1. Create route handler in `src/node/routes/`
2. Register in `src/node/routes/index.ts`
3. Add authentication if needed
4. Add tests
5. Update API documentation

### Installing VSCode Extensions

```bash
# From marketplace
code-server --install-extension publisher.extension-name

# From VSIX file
code-server --install-extension /path/to/extension.vsix

# List installed
code-server --list-extensions --show-versions
```

---

## Troubleshooting

### Common Issues

1. **Extension Installation Fails**
   - Check network connectivity
   - Verify extensions directory permissions
   - Check marketplace URL configuration

2. **WebSocket Connection Fails**
   - Verify reverse proxy WebSocket support
   - Check CORS configuration
   - Verify SSL/TLS setup

3. **Authentication Issues**
   - Verify password hash format
   - Check cookie settings
   - Verify HTTPS configuration for secure cookies

4. **Performance Issues**
   - Check plugin health status
   - Monitor connection pool usage
   - Review cache hit rates
   - Check resource limits

---

## Best Practices

### Security

- Always validate and sanitize user input
- Use parameterized queries for databases
- Enable HTTPS in production
- Implement proper CORS policies
- Use secure session cookies
- Enable rate limiting on public endpoints
- Keep dependencies updated

### Performance

- Implement caching where appropriate
- Use connection pooling
- Lazy load heavy dependencies
- Clean up resources in destroy()
- Monitor memory usage
- Use streaming for large files

### Reliability

- Implement health checks
- Handle errors gracefully
- Log errors appropriately
- Provide meaningful error messages
- Implement retry logic for network operations
- Use timeouts on external calls

### Code Quality

- Write comprehensive tests
- Use TypeScript for type safety
- Follow ESLint configuration
- Document public APIs
- Use meaningful variable names
- Keep functions small and focused

---

## Contributing

### Code Style

- TypeScript strict mode
- ESLint + Prettier
- Meaningful commit messages
- Pull request descriptions
- Test coverage requirements

### Testing Requirements

- Unit tests for business logic
- Integration tests for APIs
- E2E tests for critical flows
- Minimum 60% coverage

---

## Resources

### Documentation
- [VSCode API Docs](https://code.visualstudio.com/api)
- [Express.js Docs](https://expressjs.com/)
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)

### Related Projects
- [VSCode](https://github.com/microsoft/vscode)
- [Monaco Editor](https://microsoft.github.io/monaco-editor/)
- [code-server](https://github.com/coder/code-server)

---

## Subdirectory Documentation

Detailed documentation for each directory is available in the respective `claude.md` files. Each file contains comprehensive information about the files, their purposes, APIs, and usage examples.

### Frontend & Browser

#### [src/browser/claude.md](src/browser/claude.md) - Frontend Assets & UI Components
**Contains:** HTML pages, CSS stylesheets, media files, service worker

**Key Files:**
- `pages/modern-login.html` - Modern login page with accessibility features
- `pages/design-system.css` - Design tokens and CSS variables
- `pages/error.html` - Error page template
- `media/` - Favicons, PWA icons
- `serviceWorker.ts` - Progressive Web App support

**Focus Areas:**
- Login page UI and authentication flow
- Design system and theming
- Progressive Web App capabilities
- Static asset serving
- Template variable system

**Extension Points:**
- Custom login pages (OAuth, SSO)
- White-label branding
- Custom error pages
- PWA customization

---

### Shared Code

#### [src/common/claude.md](src/common/claude.md) - Shared Utilities
**Contains:** Event emitters, HTTP constants, utility functions

**Key Files:**
- `emitter.ts` - Type-safe event emitter with async support
- `http.ts` - HTTP status codes, error classes, cookie constants
- `util.ts` - Common utilities (UUID, pluralization, path normalization)

**Focus Areas:**
- Event-driven architecture patterns
- Consistent error handling with HttpError
- Reusable utility functions
- Type-safe event communication

**Extension Points:**
- Custom event systems for plugins
- Domain-specific error types
- Additional utility functions

---

### Core Systems

#### [src/core/claude.md](src/core/claude.md) - Plugin System, Security & Configuration
**Contains:** Plugin architecture, security utilities, configuration management

**Key Files:**
- `plugin.ts` - Plugin manager and base plugin interface
- `security.ts` - CSRF protection, input validation, security headers
- `config.ts` - Type-safe configuration management

**Focus Areas:**
- Plugin lifecycle management (init, destroy, healthCheck)
- Dependency injection via PluginContext
- Service registry for inter-plugin communication
- CSRF token generation and validation
- Input sanitization and validation
- Rate limiting
- Security headers (CSP, HSTS, X-Frame-Options)

**Extension Points:**
- Creating custom plugins
- Adding new security validations
- Custom rate limiting strategies
- Configuration schema extensions

---

### Backend Server

#### [src/node/claude.md](src/node/claude.md) - Backend Server Implementation
**Contains:** Core server code, HTTP/WebSocket handling, VS Code integration

**Key Files:**
- `entry.ts` - Application entry point and mode dispatcher
- `main.ts` - Server orchestration and initialization
- `app.ts` - Express application factory
- `http.ts` - HTTP utilities and authentication middleware
- `wsRouter.ts` - WebSocket routing system
- `vscodeSocket.ts` - Editor session management
- `proxy.ts` - Port forwarding proxy
- `heart.ts` - Activity heartbeat tracking
- `update.ts` - Update checking service
- `settings.ts` - Settings persistence
- `cli.ts` - CLI argument parsing

**Focus Areas:**
- Server startup and initialization
- WebSocket routing (Express-compatible)
- VS Code integration and lazy loading
- Session management for workspaces
- Authentication and authorization
- Port forwarding for development servers
- Idle timeout and activity tracking
- Update notifications

**Extension Points:**
- Custom server middleware
- Authentication providers
- Session management customization
- Proxy configuration

---

#### [src/node/routes/claude.md](src/node/routes/claude.md) - HTTP Route Handlers
**Contains:** All HTTP and WebSocket route handlers

**Key Files:**
- `index.ts` - Central route registration
- `vscode.ts` - VS Code IDE integration routes
- `login.ts` - Authentication handlers
- `logout.ts` - Session termination
- `health.ts` - Health check endpoints
- `update.ts` - Update notification endpoint
- `pathProxy.ts` - Port forwarding routes
- `errors.ts` - Error handling middleware

**Focus Areas:**
- Route registration and middleware stack
- VS Code server loading and delegation
- Login/logout flow with rate limiting
- Health and readiness checks
- Port forwarding (HTTP and WebSocket)
- Error handling and custom error pages

**Extension Points:**
- Adding custom API endpoints
- Custom authentication flows
- Proxy customization
- Error page customization

---

### Testing

#### [test/claude.md](test/claude.md) - Test Suites
**Contains:** Unit, integration, and E2E tests

**Key Directories:**
- `unit/` - Jest unit tests for individual functions
- `integration/` - Integration tests for component interaction
- `e2e/` - Playwright E2E tests for user flows
- `utils/` - Test utilities and helpers
- `e2e/models/` - Page object models

**Focus Areas:**
- Unit testing with Jest (60% coverage target)
- Integration testing for CLI and APIs
- End-to-end browser testing with Playwright
- Page object pattern for maintainable E2E tests
- Test fixtures and utilities

**Test Categories:**
- Login/logout functionality
- Extension installation
- Terminal usage
- File operations
- WebSocket communication
- Route testing

---

### Build & Deployment

#### [ci/claude.md](ci/claude.md) - Build Scripts & CI/CD
**Contains:** Build automation, CI/CD scripts, Docker configurations, Helm charts

**Key Directories:**
- `build/` - Build scripts (VS Code, code-server, packages)
- `dev/` - Development scripts (watch, test, lint)
- `steps/` - CI step scripts (Docker, npm publish)
- `release-image/` - Docker release images
- `helm-chart/` - Kubernetes Helm chart

**Focus Areas:**
- Building VS Code from source
- Compiling TypeScript code
- Creating release artifacts (tar.gz, zip)
- Platform-specific packages (deb, rpm, apk)
- Docker multi-arch builds
- Helm chart for Kubernetes deployment
- CI/CD automation

**Build Outputs:**
- Platform binaries (Linux, macOS, Windows)
- Docker images (Debian, Alpine, Fedora)
- NPM packages
- System packages (deb, rpm)
- Helm charts

---

### Documentation

#### [docs/claude.md](docs/claude.md) - User & Developer Documentation
**Contains:** Installation guides, deployment docs, FAQs, contribution guidelines

**Key Files:**
- `README.md` - Documentation overview
- `install.md` - Installation for all platforms
- `guide.md` - Comprehensive user guide
- `FAQ.md` - Frequently asked questions
- `CONTRIBUTING.md` - Contribution guidelines
- `SECURITY.md` - Security policy
- `helm.md` - Kubernetes deployment
- `termux.md`, `android.md`, `ios.md`, `ipad.md` - Mobile platform guides

**Focus Areas:**
- Quick start and installation
- Configuration and setup
- Extension management
- Deployment options (Docker, Kubernetes, NPM)
- Platform-specific instructions
- Security and best practices
- Contributing and maintaining

---

## How to Use This Documentation

1. **Start with the root** `claude.md` (this file) for overall architecture
2. **Dive into subdirectories** based on what you're working on:
   - Modifying UI? → `src/browser/claude.md`
   - Adding server features? → `src/node/claude.md`
   - Creating plugins? → `src/core/claude.md`
   - Adding routes? → `src/node/routes/claude.md`
   - Writing tests? → `test/claude.md`
   - Build/deployment? → `ci/claude.md`
3. **Search for specifics** - Each subdirectory doc has detailed file descriptions
4. **Follow cross-references** - Docs link to related files and concepts

---

## Version Information

- **Node.js:** 22.x
- **TypeScript:** 5.x
- **VSCode:** Latest (via submodule)
- **Target:** ES6/ES2020

---

## License

MIT License - See LICENSE file for details

---

## Contact & Support

For issues, questions, or contributions, please refer to the project repository.
