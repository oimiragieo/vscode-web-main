# VSCode Web IDE - Codebase Documentation

## Overview

This is a production-ready web-based IDE built on top of VSCode, designed to run in the browser with full VS Code functionality. The project enables remote development, collaborative coding, and cloud-based development environments.

**Architecture:** Client/Server Web Application
- **Backend:** Node.js/Express server with WebSocket support
- **Frontend:** Full VSCode web client (Monaco Editor + Workbench)
- **Communication:** HTTP + WebSocket for bidirectional real-time communication
- **Deployment:** Standalone binary, Docker container, or NPM package

### Deployment Modes

**Single-User Mode (Default):**
- Lightweight, simple deployment for personal use
- Single password authentication
- Shared resources (settings, extensions)
- Zero overhead, backward compatible

**Multi-User Mode (New):**
- Enterprise-ready deployment for multiple concurrent users
- Complete user isolation (processes, filesystems, state)
- User authentication with database-backed sessions
- Role-based access control (Admin, User, Viewer)
- Resource quotas and limits per user
- Comprehensive audit logging
- Horizontal scaling support

**See:** [MULTI_USER_README.md](MULTI_USER_README.md) for complete multi-user documentation

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
│       ├── routes/          # HTTP route handlers
│       └── services/        # Multi-user services (NEW)
│           ├── auth/        # Authentication & user management
│           ├── session/     # Session storage (Memory, Redis, Database)
│           ├── isolation/   # User environment isolation
│           ├── audit/       # Security audit logging
│           ├── config/      # Multi-user configuration loader
│           └── types.ts     # TypeScript type definitions
├── test/                     # Test suites (unit, integration, e2e)
├── ci/                       # Build scripts and CI/CD
├── lib/                      # External libraries (VSCode source)
├── docs/                     # Documentation
├── patches/                  # NPM package patches
├── typings/                  # TypeScript type definitions
│
├── MULTI_USER_README.md                 # Multi-user overview & quick start
├── MULTI_USER_ARCHITECTURE_DESIGN.md   # Complete architecture (70+ pages)
├── IMPLEMENTATION_GUIDE.md              # Step-by-step integration guide
├── SERVER_ARCHITECTURE_ANALYSIS.md     # Current system analysis
└── ARCHITECTURE_DIAGRAMS.md            # Visual architecture diagrams
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

### Multi-User Services (NEW)

| Service | Location | Purpose |
|---------|----------|---------|
| **AuthService** | `src/node/services/auth/AuthService.ts` | User authentication, session management, login/logout |
| **UserRepository** | `src/node/services/auth/UserRepository.ts` | User data persistence (Memory, SQLite, PostgreSQL) |
| **SessionStore** | `src/node/services/session/SessionStore.ts` | Session storage (Memory, Redis, Database) |
| **UserIsolationManager** | `src/node/services/isolation/UserIsolationManager.ts` | User environment isolation & resource quotas |
| **AuditLogger** | `src/node/services/audit/AuditLogger.ts` | Security audit logging (File, Database) |
| **MultiUserConfig** | `src/node/services/config/MultiUserConfig.ts` | Multi-user configuration loader |
| **MultiUserService** | `src/node/services/MultiUserService.ts` | Service container & orchestration |

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

### Multi-User API Endpoints (NEW)

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/users/me` | GET | Yes | Get current user info |
| `/api/users` | GET | Admin | List all users |
| `/api/users` | POST | Admin | Create new user |
| `/api/users/:userId` | PUT | Admin | Update user |
| `/api/users/:userId` | DELETE | Admin | Delete user |
| `/api/users/me/sessions` | GET | Yes | List active sessions |
| `/api/users/me/sessions/:sessionId` | DELETE | Yes | Revoke session |
| `/api/users/me/usage` | GET | Yes | Get resource usage |

**Note:** Multi-user endpoints are only available when `deployment-mode: multi` is configured.

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
- `--deployment-mode` - Deployment mode (single|multi) **NEW**
- `--multi-user-config` - Multi-user configuration file path **NEW**

### Environment Variables (.env)

See `.env.example` for complete configuration options:
- Server settings
- Authentication
- Security options
- Paths and directories
- Application settings
- Docker configuration
- Logging levels

### Multi-User Configuration (NEW)

Multi-user mode is configured via YAML/JSON configuration files.

**Example `.code-server.yaml`:**

```yaml
deployment-mode: multi  # single | multi

multi-user:
  auth:
    provider: database  # database | ldap | oauth | saml
    database:
      type: sqlite  # sqlite | postgres | mysql
      path: /var/lib/code-server/users.db
    session:
      store: redis  # memory | redis | database
      ttl: 86400
      redis:
        host: localhost
        port: 6379

  isolation:
    strategy: directory  # directory | container | process
    base-path: /var/lib/code-server/users

  limits:
    max-sessions-per-user: 5
    max-concurrent-connections: 100
    storage-quota-mb: 5000
    memory-limit-mb: 2048

  features:
    audit-logging: true
    usage-analytics: false
    admin-dashboard: true
```

**Environment Variable Overrides:**

```bash
# Deployment mode
CODE_SERVER_DEPLOYMENT_MODE=multi

# Database
CODE_SERVER_DB_TYPE=postgres
CODE_SERVER_DB_HOST=localhost
CODE_SERVER_DB_NAME=code_server

# Session store
CODE_SERVER_SESSION_STORE=redis
CODE_SERVER_REDIS_HOST=localhost

# Admin user (created on first start)
ADMIN_USERNAME=admin
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=SecurePassword123!
```

**Quick Start:**

```bash
# Single-user mode (default - no changes needed)
code-server

# Multi-user mode with config file
code-server --multi-user-config=.code-server.yaml

# Multi-user mode with environment variables
export CODE_SERVER_DEPLOYMENT_MODE=multi
code-server
```

**See:** [MULTI_USER_ARCHITECTURE_DESIGN.md](MULTI_USER_ARCHITECTURE_DESIGN.md) for complete configuration reference

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

### Multi-User Deployment (NEW)

**Phase 1: Directory-Based Isolation**
```bash
# Create configuration
cat > .code-server.yaml <<EOF
deployment-mode: multi
multi-user:
  auth:
    provider: database
    database:
      type: sqlite
      path: /var/lib/code-server/users.db
  isolation:
    strategy: directory
    base-path: /var/lib/code-server/users
EOF

# Start server
code-server --multi-user-config=.code-server.yaml
```

**Phase 2: Container-Based Isolation**
```bash
# Docker Compose with multi-user support
docker-compose -f docker-compose.multi-user.yml up -d
```

**Phase 3: Kubernetes Deployment**
```bash
# Helm chart with multi-user support
helm install code-server ./helm-chart --values multi-user-values.yaml
```

**See:**
- [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md) - Step-by-step setup instructions
- [MULTI_USER_ARCHITECTURE_DESIGN.md](MULTI_USER_ARCHITECTURE_DESIGN.md) - Complete deployment configs

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

## Multi-User Architecture Documentation (NEW)

### Complete Multi-User System

The VSCode Web IDE now supports two deployment modes: **single-user** (default) and **multi-user** (enterprise-ready). The multi-user architecture provides complete isolation, authentication, and resource management for multiple concurrent users.

### Key Documentation Files

#### [MULTI_USER_README.md](MULTI_USER_README.md) - Executive Summary & Quick Start
**Contains:** Project overview, quick start guides, feature summary

**Key Sections:**
- Executive summary
- Quick start (single-user and multi-user modes)
- Architecture overview diagrams
- Security features
- Performance & scalability targets
- Implementation phases
- Configuration examples
- Deployment options

**Best For:** Product managers, decision makers, quick overview

---

#### [MULTI_USER_ARCHITECTURE_DESIGN.md](MULTI_USER_ARCHITECTURE_DESIGN.md) - Complete Architecture (70+ pages)
**Contains:** Comprehensive technical specification for multi-user system

**Key Sections:**
1. Executive Summary
2. Design Goals (single-user vs multi-user)
3. Deployment Modes (comparison table)
4. **Architecture Options Analysis:**
   - Session-Based Isolation (single process)
   - Container-Per-User (recommended for production)
   - Process Pool (hybrid)
   - Serverless (future)
5. **Recommended Architecture** (phased approach)
6. **Implementation Phases:**
   - Phase 1: Directory-based (2-3 weeks)
   - Phase 2: Container-based (4-6 weeks)
   - Phase 3: Enterprise (6-8 weeks)
7. **Detailed Component Design:**
   - AuthService (authentication & session management)
   - SessionStore (Memory, Redis, Database)
   - UserRepository (user persistence)
   - UserIsolationManager (environment isolation)
   - AuditLogger (security logging)
   - MultiUserConfig (configuration loader)
8. Security Considerations
9. Scalability & Performance
10. Migration Paths
11. Configuration Examples (YAML, environment variables)
12. Monitoring & Observability
13. Testing Strategy
14. Deployment Examples (Docker Compose, Kubernetes)

**Best For:** Architects, senior developers, technical design review

---

#### [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md) - Step-by-Step Integration
**Contains:** Developer-focused integration instructions

**Key Sections:**
1. Overview
2. Prerequisites (dependencies)
3. **7-Step Integration Process:**
   - Step 1: Create Database Helper (SQLite)
   - Step 2: Create Multi-User Service Container
   - Step 3: Modify Main Entry Point
   - Step 4: Update App Creation
   - Step 5: Update Login Route
   - Step 6: Add User Management API
   - Step 7: Register Routes
4. **Database Schema:**
   - Users table
   - Sessions table
   - Audit events table
   - Indexes
5. Example Usage (CLI, API examples with curl)
6. Testing (unit tests, integration tests)
7. Migration (single-user → multi-user)
8. Troubleshooting

**Best For:** Developers implementing the multi-user system

---

#### [SERVER_ARCHITECTURE_ANALYSIS.md](SERVER_ARCHITECTURE_ANALYSIS.md) - Current System Analysis
**Contains:** Deep dive into current architecture and limitations

**Key Sections:**
1. Executive Summary
2. Server Entry Points & Startup
3. Existing Session/State Management
4. Process Management (parent-child model)
5. WebSocket & IPC Communication
6. File System Access Patterns
7. Authentication & Authorization (detailed)
8. VS Code Module Integration
9. **Architecture Constraints for Multi-User Design**
10. Structural Changes Needed
11. Detailed Component Breakdown
12. Communication Flow Examples
13. Design Recommendations
14. Deployment Topology Options
15. Key Files Reference

**Best For:** Understanding current system, identifying constraints

---

#### [ARCHITECTURE_DIAGRAMS.md](ARCHITECTURE_DIAGRAMS.md) - Visual Diagrams
**Contains:** Visual architecture diagrams

**Diagrams:**
1. Process Architecture
2. Request Flow (HTTP)
3. WebSocket Upgrade Flow
4. Session Management (EditorSessionManager)
5. Authentication & Authorization Flow
6. File System Structure
7. State Persistence Model
8. Communication Mechanisms
9. Multi-User Architecture (proposed)
10. Startup Sequence
11. Request Timing & Order

**Best For:** Visual learners, presentations, onboarding

---

### Multi-User Services Implementation

All multi-user services are fully implemented in TypeScript and ready for integration:

#### Type System - `src/node/services/types.ts` (400+ lines)
- Complete type definitions for all services
- User, Session, Environment, Container types
- Resource limits and quotas
- Configuration interfaces
- Audit events and metrics
- API response types

#### Authentication - `src/node/services/auth/AuthService.ts` (350+ lines)
- User authentication with Argon2 password hashing
- Session creation and management
- Login/logout with audit logging
- Password strength validation
- Token generation (JWT-ready)
- Session limits per user

#### User Persistence - `src/node/services/auth/UserRepository.ts` (200+ lines)
- Memory and Database implementations
- User CRUD operations
- SQLite, PostgreSQL, MySQL support
- Username/email uniqueness validation

#### Session Storage - `src/node/services/session/SessionStore.ts` (400+ lines)
- **Three storage backends:**
  - MemorySessionStore (development/single instance)
  - RedisSessionStore (production/distributed)
  - DatabaseSessionStore (persistent storage)
- Session expiration and cleanup
- User session tracking
- Factory pattern for easy switching

#### User Isolation - `src/node/services/isolation/UserIsolationManager.ts` (300+ lines)
- DirectoryIsolationStrategy (Phase 1 ready)
- Per-user directory structure
- Storage quota enforcement
- Resource usage tracking
- ContainerIsolationStrategy (Phase 2 placeholder)

#### Audit Logging - `src/node/services/audit/AuditLogger.ts` (300+ lines)
- FileAuditLogger (rotating daily logs)
- DatabaseAuditLogger (queryable audit trail)
- CompositeAuditLogger (multiple backends)
- Security event tracking
- Queryable audit trail

#### Configuration - `src/node/services/config/MultiUserConfig.ts` (250+ lines)
- YAML/JSON configuration loader
- Environment variable overrides
- Configuration validation
- Initial admin user creation
- Default configuration values

---

### Multi-User Use Cases

#### Single-User Mode (Default)
```bash
# No changes needed - works exactly as before
code-server
```

**Use Case:** Personal development, single developer, simple deployment

#### Multi-User Mode - Small Team (5-20 users)
```bash
# Directory-based isolation with SQLite
code-server --multi-user-config=.code-server.yaml
```

**Features:**
- User authentication with database
- Directory-based isolation
- In-memory session store
- Audit logging
- Admin API

**Use Case:** Small teams, internal deployments, development/staging environments

#### Multi-User Mode - Production (20+ users)
```bash
# Container-based isolation with Redis + PostgreSQL
docker-compose -f docker-compose.multi-user.yml up -d
```

**Features:**
- Container-per-user isolation
- Redis session store (distributed)
- PostgreSQL user database
- Load balancing support
- Horizontal scaling
- Container pool management

**Use Case:** Production SaaS, cloud deployments, large teams

#### Multi-User Mode - Enterprise (100+ users)
```bash
# Kubernetes deployment with OAuth/SAML
helm install code-server ./helm-chart --values enterprise-values.yaml
```

**Features:**
- Kubernetes orchestration
- OAuth/SAML integration
- Advanced RBAC
- Usage analytics
- Admin dashboard UI
- Multi-region support
- Auto-scaling

**Use Case:** Enterprise, 100+ users, multi-region deployments

---

### Migration Path

#### From Single-User to Multi-User

1. **Backup existing data**
   ```bash
   cp -r ~/.local/share/code-server ~/.local/share/code-server.backup
   ```

2. **Create multi-user configuration**
   ```bash
   cat > .code-server.yaml <<EOF
   deployment-mode: multi
   multi-user:
     auth:
       provider: database
       database:
         type: sqlite
         path: /var/lib/code-server/users.db
   EOF
   ```

3. **Set admin credentials**
   ```bash
   export ADMIN_USERNAME=admin
   export ADMIN_PASSWORD=SecurePassword123!
   ```

4. **Start server**
   ```bash
   code-server --multi-user-config=.code-server.yaml
   ```

5. **Migrate existing data to admin user** (optional)
   ```bash
   sudo cp -r ~/.local/share/code-server/* /var/lib/code-server/users/$(admin-user-id)/data/
   ```

**See:** [IMPLEMENTATION_GUIDE.md#8-migration](IMPLEMENTATION_GUIDE.md#8-migration) for complete migration guide

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
