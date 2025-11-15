# VSCode Web IDE - Comprehensive Architecture Report
**Analysis Date:** November 15, 2025  
**Codebase:** code-server (VS Code Web IDE)  
**Total Source Files:** 39 TypeScript files  
**Repository:** /home/user/vscode-web-main

---

## EXECUTIVE SUMMARY

This is a **remote IDE server** that runs VS Code in the browser with:
- **Backend:** Node.js with Express.js serving the web interface
- **Frontend:** VS Code bundled as a web-based editor
- **Architecture:** Single-process, single-user (default), with process forking for hot reload
- **Authentication:** Password-based (default) or no auth
- **Deployment:** Docker-ready with multi-stage builds

**Key Characteristics:**
- Lightweight and self-contained
- Single password authentication (no per-user auth)
- File-based state persistence
- Event-driven architecture with custom Emitter
- Built-in compression, proxy, and WebSocket support

---

## 1. OVERALL ARCHITECTURE & STRUCTURE

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Browser / Client                          │
│              (HTML + ServiceWorker + JS)                     │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP/HTTPS + WebSocket
                         │
┌────────────────────────┴────────────────────────────────────┐
│              Node.js Server (entry.js)                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Express Router (Main HTTP/WS Handler)                 │   │
│  │ ├─ Compression middleware                            │   │
│  │ ├─ Cookie parser                                     │   │
│  │ ├─ Static file serving (src/browser)                 │   │
│  │ └─ Route handlers                                    │   │
│  └──────────────────────────────────────────────────────┘   │
│                          │                                   │
│  ┌───────┬───────┬───────┼───────┬──────────┬────────┐      │
│  │       │       │       │       │          │        │      │
│  v       v       v       v       v          v        v      │
│ Login  Logout  Health  Proxy  Update  Domain  VSCode │      │
│ Route  Route  Check   Routes  Routes   Proxy  Handler│      │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ VS Code Server (Lazy-Loaded ESM Module)              │   │
│  │ ├─ File operations                                   │   │
│  │ ├─ Terminal support                                 │   │
│  │ ├─ Extension management                             │   │
│  │ └─ Language Server Protocol (LSP)                   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Support Services                                     │   │
│  │ ├─ Heart (Idle timeout monitor)                      │   │
│  │ ├─ EditorSessionManager (Workspace tracking)         │   │
│  │ ├─ SocketProxyProvider (TLS socket wrapping)         │   │
│  │ ├─ SettingsProvider (JSON file storage)              │   │
│  │ ├─ UpdateProvider (Version checks)                   │   │
│  │ └─ Logger (@coder/logger)                            │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
          │
          ├─ File System (user-data-dir, extensions-dir)
          ├─ Git Config (for version tracking)
          └─ Environment Variables (security, paths)
```

### 1.2 Directory Structure

```
src/
├── node/                          # Backend code
│   ├── entry.ts                   # Main entry point
│   ├── main.ts                    # Server initialization
│   ├── app.ts                     # Express app creation
│   ├── cli.ts                     # CLI argument parsing
│   ├── wrapper.ts                 # Process management (parent/child)
│   ├── http.ts                    # HTTP utilities & middleware
│   ├── heart.ts                   # Idle timeout detection
│   ├── socket.ts                  # TLS socket proxy
│   ├── wsRouter.ts                # WebSocket routing
│   ├── vscodeSocket.ts            # Editor session management
│   ├── proxy.ts                   # HTTP proxy handler
│   ├── settings.ts                # Persistent settings store
│   ├── update.ts                  # Version check provider
│   ├── constants.ts               # Build constants
│   ├── util.ts                    # Helper functions
│   │
│   ├── routes/                    # HTTP request handlers
│   │   ├── index.ts               # Route registration
│   │   ├── login.ts               # Authentication
│   │   ├── logout.ts              # Session cleanup
│   │   ├── health.ts              # Health check
│   │   ├── vscode.ts              # Main IDE interface
│   │   ├── pathProxy.ts           # /proxy/:port routing
│   │   ├── domainProxy.ts         # Multi-domain routing
│   │   ├── update.ts              # Update API
│   │   └── errors.ts              # Error handling
│   │
│   ├── services/                  # Business logic (multi-user ready)
│   │   ├── types.ts               # Type definitions
│   │   ├── auth/
│   │   │   ├── AuthService.ts     # User auth logic
│   │   │   └── UserRepository.ts  # User data access
│   │   ├── session/
│   │   │   └── SessionStore.ts    # Session persistence
│   │   ├── isolation/
│   │   │   └── UserIsolationManager.ts
│   │   ├── audit/
│   │   │   └── AuditLogger.ts     # Security logging
│   │   ├── config/
│   │   │   └── MultiUserConfig.ts
│   │   └── i18n/
│   │       ├── index.ts
│   │       └── locales/            # Translation files
│   │
│   └── i18n/
│       └── locales/
│
├── browser/                       # Frontend code
│   ├── serviceWorker.ts           # PWA support
│   ├── pages/
│   │   ├── login.html / modern-login.html
│   │   ├── error.html
│   │   ├── login.css / modern-login.css
│   │   ├── error.css
│   │   ├── global.css
│   │   └── design-system.css      # Design tokens
│   └── media/
│       ├── favicon.ico
│       ├── pwa-icon-*.png
│       └── templates.png
│
└── common/                        # Shared utilities
    ├── emitter.ts                 # Event emitter
    ├── http.ts                    # HTTP constants
    └── util.ts                    # String utilities

ci/
├── build/
│   ├── build-code-server.sh       # TypeScript compilation
│   ├── build-vscode.sh            # VS Code bundling
│   ├── build-release.sh           # Release packaging
│   └── npm-postinstall.sh         # Installation hook
├── dev/
│   ├── watch.ts                   # Dev mode with hot reload
│   ├── test-e2e.sh
│   ├── test-unit.sh
│   ├── test-integration.sh
│   └── postinstall.sh             # Submodule initialization

test/
├── unit/
├── integration/
├── e2e/
└── utils/
    ├── helpers.ts
    └── httpserver.ts

Configuration Files:
├── package.json                   # Dependencies & scripts
├── tsconfig.json                  # TypeScript config
├── eslint.config.mjs              # Linting
├── docker-compose.yml             # Compose setup
├── Dockerfile.optimized           # Multi-stage build
├── .env.example                   # Config template
└── flake.nix                       # Nix shell setup
```

---

## 2. MAIN ENTRY POINTS & BOOTSTRAP PROCESS

### 2.1 Entry Point Flow

**File:** `/src/node/entry.ts`

```
npm start / node out/node/entry.js
    │
    v
entry() async function
    │
    ├─ isChild(wrapper) ?
    │   │ YES: Child process
    │   │     ├─ handshake() → get args from parent
    │   │     ├─ runCodeServer(args)
    │   │     └─ preventExit() → wrapper controls lifecycle
    │   │
    │   └─ NO: Parent process
    │       ├─ parse(argv) → CLI args
    │       ├─ readConfigFile() → config.yaml
    │       ├─ setDefaults() → merge CLI + config
    │       │
    │       ├─ shouldSpawnCliProcess(args) ?
    │       │   YES → runCodeCli() → extension mgmt, etc
    │       │   NO → continue
    │       │
    │       ├─ shouldOpenInExistingInstance(args) ?
    │       │   YES → openInExistingInstance()
    │       │   NO → continue
    │       │
    │       └─ wrapper.start(args)
    │           └─ Fork child process
    │           └─ Pass handshake
    │           └─ Monitor signals (SIGUSR1, SIGUSR2 for reload)
    │
    └─ Catch errors → logger.error() → wrapper.exit()
```

### 2.2 Server Initialization (`runCodeServer`)

**File:** `/src/node/main.ts`

1. **Create Express App** → `createApp(args)`
   - Setup Express router with compression
   - Create HTTP/S server (httpolyglot for both)
   - Initialize WebSocket handler
   - Create EditorSessionManager server on separate socket

2. **Register Routes** → `register(app, args)`
   - Initialize Heart (idle detector)
   - Mount common middleware (heart.beat, settings, updater)
   - Mount HTTPS redirect
   - Mount security.txt, robots.txt
   - Mount domain/path proxies
   - Mount static files (/_static)
   - Mount health check (/healthz)
   - Mount auth routes (/login, /logout)
   - Mount update route (/update)
   - Mount main IDE route (/ and /vscode)

3. **Start Server** → `listen(server, args)`
   - Bind to host:port OR unix socket
   - Handle errors
   - Chmod socket if needed

### 2.3 CLI Argument Processing

**File:** `/src/node/cli.ts`

Defined arguments:
- `--auth` (password | none)
- `--password`, `--hashed-password` (Argon2)
- `--host`, `--port`, `--bind-addr`
- `--socket`, `--socket-mode` (Unix socket alternative)
- `--cert`, `--cert-key` (HTTPS)
- `--session-socket` (separate session manager)
- `--user-data-dir`, `--extensions-dir`
- `--proxy-domain`, `--disable-proxy`, `--skip-auth-preflight`
- `--idle-timeout-seconds`
- `--locale`, `--app-name`, `--welcome-text`
- `--enable` (experimental features)
- `--open` (auto-open in browser)
- `--disable-telemetry`, `--disable-update-check`

---

## 3. CORE SYSTEMS & RESPONSIBILITIES

### 3.1 Express Router System (Main HTTP Handler)

**File:** `/src/node/app.ts` + `/src/node/routes/index.ts`

**Components:**
- `router`: Express app for standard HTTP requests
- `wsRouter`: Express app mounted on WebSocket upgrade
- `server`: HTTP/S server (httpolyglot handles both)
- `editorSessionManagerServer`: Separate HTTP server for session APIs

**Key Middleware (in order):**

| Middleware | Purpose |
|-----------|---------|
| `compression()` | Gzip compression for responses |
| `cookieParser()` | Parse/set cookies |
| `common()` | Attach args, heart, settings, updater to req |
| HTTPS check | Redirect HTTP→HTTPS if TLS enabled |
| Security routes | robots.txt, security.txt |
| Domain proxy | Cross-domain proxy with origin validation |
| Path proxy | /proxy/:port/:path routing |
| Static files | /_static (src/browser) |
| Health check | /healthz endpoint |
| Auth routes | /login, /logout |
| Update route | /update (version check) |
| Main IDE | / (vscode route) |

### 3.2 Request Processing Pipeline

**All requests flow through:**

```
Browser HTTP Request
    │
    v
Express Middleware Chain
    ├─ compression()
    ├─ cookieParser()
    ├─ common() → inject req.args, req.heart, req.settings, req.updater
    ├─ HTTPS redirect check
    ├─ Route matching
    │
    └─ Matched Handler
        ├─ Check authentication (cookie validation)
        ├─ Check authorization (if needed)
        ├─ Process request
        └─ Send response
```

### 3.3 WebSocket Handling

**File:** `/src/node/wsRouter.ts`

```typescript
interface WebsocketRequest extends express.Request {
  ws: stream.Duplex      // The socket
  head: Buffer           // Initial data
}

handleUpgrade(app, server)
  ├─ Listen to "upgrade" events on HTTP server
  ├─ Pause socket
  ├─ Inject ws, head into request
  ├─ Route through Express app
  └─ Delegate to WebSocket.Server or close

WebsocketRouter.ws(route, ...handlers)
  └─ Mark request as handled
  └─ Call WebSocket handlers
```

**VS Code uses WebSocket for:**
- Real-time code changes
- Terminal output
- Language server communication
- File sync

### 3.4 Route Handlers

| Route | File | Purpose | Auth |
|-------|------|---------|------|
| GET / | vscode.ts | Main IDE interface | ✓ Required |
| POST /login | login.ts | Authenticate user | ✗ Public |
| POST /logout | logout.ts | Clear session | ✓ Required |
| GET /healthz | health.ts | Health check | ✗ Public |
| GET /update | update.ts | Check new version | ✓ Required |
| GET/POST /proxy/:port/* | pathProxy.ts | Route to service on port | ✓ Required |
| GET /absproxy/:port/* | pathProxy.ts | Route (no path rewrite) | ✓ Required |
| * (others) | domainProxy.ts | Multi-domain proxy | ✓ Required |
| WS / | vscode.ts | WebSocket to VS Code | ✓ Required |

### 3.5 Core Services

#### A. Heart (Idle Timeout Detection)

**File:** `/src/node/heart.ts`

```typescript
class Heart {
  lastHeartbeat: number
  heartbeatInterval = 60000  // 60 seconds
  state: "alive" | "expired" | "unknown"
  
  beat()          // Called on each request (async, not awaited)
  alive()         // Check if recently active
  dispose()       // Clear timers on shutdown
  onChange        // Event: subscribe to state changes
}
```

**Purpose:**
- Track idle periods
- Trigger auto-shutdown via `--idle-timeout-seconds`
- Detect active connections

#### B. EditorSessionManager (Workspace Coordination)

**File:** `/src/node/vscodeSocket.ts`

```typescript
class EditorSessionManager {
  entries: Map<socketPath, EditorSessionEntry>
  
  addSession(entry)              // Register workspace
  deleteSession(socketPath)      // Unregister workspace
  getCandidatesForFile(filePath) // Find matching workspace
  getConnectedSocketPath(filePath) // Get socket path
}

interface EditorSessionEntry {
  workspace: {
    id: string
    folders: { uri: { path: string } }[]
  }
  socketPath: string  // Unix socket to workspace's editor
}
```

**Purpose:**
- Manage multiple VS Code editor instances per user
- Route file operations to correct workspace
- Exposed via separate HTTP API

#### C. SettingsProvider (Persistent Store)

**File:** `/src/node/settings.ts`

```typescript
class SettingsProvider<T> {
  settingsPath: string
  
  read()        // Load JSON file
  write()       // Save + merge with existing
}

// Stored in: user-data-dir/coder.json
interface CoderSettings {
  query?: ParsedQs        // Last opened folder/workspace
  update?: {
    checked: number
    version: string
  }
}
```

**Purpose:**
- Persist user preferences
- Track last opened folders
- Store update check results

#### D. UpdateProvider (Version Management)

**File:** `/src/node/update.ts`

```typescript
class UpdateProvider {
  latestUrl = "https://api.github.com/repos/coder/code-server/releases/latest"
  updateInterval = 86400000  // 24 hours
  
  getUpdate(force?)        // Check for newer version
  isLatestVersion()        // Compare with current
}
```

**Purpose:**
- Check for code-server updates
- Notify user of new versions
- Cache results

#### E. SocketProxyProvider (TLS Socket Wrapping)

**File:** `/src/node/socket.ts`

```typescript
class SocketProxyProvider {
  proxyPipe: string  // Unix socket path
  proxyTimeout = 5000
  
  createProxy(socket)           // Wrap TLS socket
  startProxyServer()            // Start Unix socket server
  findFreeSocketPath(basePath)  // Find available path
}
```

**Purpose:**
- Wrap TLS sockets for child processes (can't pass TLS sockets via IPC)
- Enable VS Code to use HTTPS connections
- Tunneling for WebSocket upgrades

### 3.6 Process Management (Parent/Child Model)

**File:** `/src/node/wrapper.ts`

```typescript
abstract class Process {
  onDispose: Event<NodeJS.Signals | undefined>
  
  preventExit()
  exit(error?)
  dispose()
}

class ParentProcess extends Process {
  start(args)        // Fork child
  on(event, handler) // Listen for IPC messages
  send(message)      // Send to child
}

class ChildProcess extends Process {
  handshake()        // Receive args from parent
  onMessage()        // Subscribe to parent messages
}
```

**Message Types:**
- `ParentHandshakeMessage`: Parent sends args to child
- `ChildHandshakeMessage`: Child confirms ready
- `RelaunchMessage`: Trigger reload

**Use Cases:**
- Hot reload (SIGUSR1/SIGUSR2)
- Graceful shutdown
- IPC communication

### 3.7 Authentication & Authorization

**File:** `/src/node/http.ts` + `/src/node/routes/login.ts`

```typescript
authenticated(req)        // Check if session cookie valid
ensureAuthenticated(req)  // Throw if not authenticated
ensureOrigin(req)         // Verify Origin header
```

**Cookie Details:**
- Name: `code-server-session`
- Value: Hash of password (not plain)
- Secure: If HTTPS
- HttpOnly: Prevents JS access

**Auth Middleware Checks:**
- Cookie exists
- Cookie value matches password hash
- Origin header valid (for WebSocket)

---

## 4. BUILD CONFIGURATION & BUNDLING

### 4.1 Build Scripts

**Location:** `/ci/build/`

| Script | Purpose |
|--------|---------|
| `build-code-server.sh` | TypeScript → JavaScript |
| `build-vscode.sh` | Compile VS Code web server |
| `build-release.sh` | Package for distribution |
| `clean.sh` | Remove build artifacts |
| `build-packages.sh` | Create platform-specific packages |

### 4.2 TypeScript Build

**File:** `tsconfig.json`

```json
{
  "target": "es6",
  "lib": ["es2020", "dom", "dom.iterable"],
  "module": "commonjs",
  "outDir": "./out",
  "incremental": true,
  "tsBuildInfoFile": "./.cache/tsbuildinfo"
}
```

**Build Steps:**
1. `npm run build:vscode` → Compile VS Code
2. `npm run build` → `tsc` compiles src/ to out/
3. Add shebang to entry.js
4. Make entry.js executable

### 4.3 Output Structure

```
out/
├── node/
│   ├── entry.js        # Main entry point (#!/usr/bin/env node)
│   ├── main.js
│   ├── app.js
│   ├── cli.js
│   ├── routes/
│   ├── services/
│   └── ...
├── common/
└── browser/

lib/vscode/
├── out-vscode/         # VS Code web server output
└── out/server-main.js  # Loaded dynamically for CLI
```

### 4.4 VS Code Integration

**Dynamic Loading:**
- VS Code is loaded as ESM module via `eval(import(...))`
- Lazy-loaded on first request to `/` or `/vscode`
- Cached in memory after first load
- Provides:
  - `loadCodeWithNls()` → Load with translations
  - `createServer()` → Create VS Code HTTP server
  - `spawnCli()` → Run CLI operations

### 4.5 Docker Build

**Multi-Stage Dockerfile.optimized:**

```dockerfile
# Stage 1: Builder
FROM node:22-alpine
RUN npm ci --only=production
COPY src ./src
COPY ci ./ci
RUN npm run build:vscode && npm run build

# Stage 2: Runtime
FROM node:22-alpine
COPY --from=builder /app/out ./out
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/node_modules ./node_modules
USER coder:coder
EXPOSE 8080
HEALTHCHECK CMD curl -f http://localhost:8080/healthz
CMD ["node", "out/node/entry.js", "--bind-addr", "0.0.0.0:8080"]
```

---

## 5. DEPENDENCIES & THEIR SIZES

### 5.1 Core Dependencies

**File:** `package.json`

| Package | Version | Purpose | Size* |
|---------|---------|---------|-------|
| @coder/logger | ^3.0.1 | Structured logging | ~50KB |
| express | ^5.0.1 | HTTP framework | ~250KB |
| compression | ^1.7.4 | Gzip middleware | ~50KB |
| cookie-parser | ^1.4.6 | Cookie parsing | ~40KB |
| http-proxy | ^1.18.1 | HTTP/WS proxy | ~100KB |
| httpolyglot | ^0.1.2 | HTTP/HTTPS selector | ~10KB |
| ws | ^8.14.2 | WebSocket library | ~120KB |
| argon2 | ^0.31.1 | Password hashing | ~200KB |
| pem | ^1.14.8 | Certificate generation | ~50KB |
| semver | ^7.5.4 | Version parsing | ~40KB |
| js-yaml | ^4.1.0 | YAML parsing | ~80KB |
| rotating-file-stream | ^3.1.1 | Log rotation | ~50KB |
| i18next | ^25.3.0 | Internationalization | ~200KB |
| proxy-agent | ^6.3.1 | HTTP proxy support | ~60KB |

*Approximate unpacked sizes

**Dev Dependencies:**
- `typescript` ^5.6.2
- `@types/node` 22.x
- Various ESLint packages
- Prettier

### 5.2 Dependency Count

```
Total Dependencies: ~14
Total Size: ~1.2 MB (production)
Total Size: ~500 MB (with devDeps & node_modules)
```

### 5.3 VS Code Bundle

```
lib/vscode-reh-web-linux-x64/
├── out/                    # Compiled VS Code (~50MB minified)
├── package.json
├── extensions/             # Built-in extensions
└── remote/                 # Remote server support
```

---

## 6. SERVICE ARCHITECTURE & DEPENDENCY INJECTION

### 6.1 Service Types (Multi-User Ready)

**File:** `/src/node/services/types.ts`

Defines interfaces for:

**User Management:**
```typescript
interface User {
  id: string (UUID)
  username: string
  email: string
  passwordHash: string (Argon2)
  roles: UserRole[]
  createdAt, updatedAt, lastLogin: Date
  isActive: boolean
  metadata: Record<string, any>
}

enum UserRole { Admin = "admin", User = "user", Viewer = "viewer" }
```

**Session Management:**
```typescript
interface Session {
  id: string
  userId: string
  createdAt, expiresAt, lastActivity: Date
  ipAddress: string
  userAgent: string
  containerId?: string (for container mode)
  processId?: number (for process mode)
  metadata: Record<string, any>
}
```

**Resource Management:**
```typescript
interface ResourceLimits {
  maxStorageMB: number
  maxSessions: number
  maxConcurrentConnections: number
  maxMemoryMB?: number
  maxCPUPercent?: number
  maxExtensions?: number
  maxWorkspaces?: number
}

interface ResourceUsage {
  userId: string
  timestamp: Date
  storage: { used, limit }
  sessions: { active, limit }
  connections: { current, limit }
  cpu?, memory?
}
```

### 6.2 Service Implementations

**Authentication Service** (`/src/node/services/auth/AuthService.ts`)

```typescript
class AuthService {
  async createUser(input: CreateUserInput): Promise<User>
  async authenticateUser(username, password): Promise<User>
  async createSession(userId, metadata): Promise<Session>
  async validateSession(sessionId): Promise<Session>
  async logout(sessionId): Promise<void>
  async updatePassword(userId, newPassword): Promise<void>
}
```

**Session Store** (`/src/node/services/session/SessionStore.ts`)

```typescript
interface SessionStore {
  // CRUD
  set(sessionId, session, ttl?): Promise<void>
  get(sessionId): Promise<Session | null>
  delete(sessionId): Promise<void>
  exists(sessionId): Promise<boolean>
  
  // Query
  getUserSessions(userId): Promise<Session[]>
  getAllActiveSessions(): Promise<Session[]>
  
  // Cleanup
  deleteUserSessions(userId): Promise<number>
  deleteExpiredSessions(): Promise<number>
  
  // Stats
  getSessionCount(): Promise<number>
  getUserSessionCount(userId): Promise<number>
}

// Implementations:
class MemorySessionStore        // For dev/single-instance
class RedisSessionStore         // For distributed
class DatabaseSessionStore      // For persistence
```

**User Isolation** (`/src/node/services/isolation/UserIsolationManager.ts`)

```typescript
interface IsolationStrategy {
  initializeUserEnvironment(userId): Promise<UserEnvironment>
  destroyUserEnvironment(userId): Promise<void>
  
  getUserDataPath(userId): string
  getUserSettingsPath(userId): string
  getUserExtensionsPath(userId): string
  getUserWorkspacesPath(userId): string
  getUserLogsPath(userId): string
  
  enforceStorageQuota(userId): Promise<void>
  getResourceUsage(userId): Promise<ResourceUsage>
  checkQuota(userId, resource): Promise<QuotaStatus>
  
  cleanupIdleResources(idleThresholdMinutes): Promise<number>
}

// Implementations:
class DirectoryIsolationStrategy  // Per-user directories
class ContainerIsolationStrategy  // Per-user containers
class ProcessIsolationStrategy    // Per-user processes
```

**Audit Logging** (`/src/node/services/audit/AuditLogger.ts`)

```typescript
interface AuditLogger {
  log(event: AuditEvent): Promise<void>
  query(filter: AuditEventFilter): Promise<AuditEvent[]>
  close(): Promise<void>
}

interface AuditEvent {
  id: string
  timestamp: Date
  eventType: AuditEventType
  userId?: string
  ipAddress: string
  userAgent: string
  status: "success" | "failure" | "error"
  metadata: Record<string, any>
}

enum AuditEventType {
  UserLogin, UserLogout, UserCreated, UserUpdated, UserDeleted,
  SessionCreated, SessionExpired, SessionRevoked,
  ResourceAccessed, ResourceModified, ResourceDeleted,
  ContainerStarted, ContainerStopped, ContainerError,
  SecurityViolation, SuspiciousActivity,
  // ... more
}
```

### 6.3 Dependency Injection Pattern

**Current Model (Single-User):**

```typescript
// routes/index.ts → register()
const settings = new SettingsProvider<CoderSettings>(...)
const updater = new UpdateProvider(url, settings)
const heart = new Heart(path, isActiveFn)

// Injected into req via middleware
const common: express.RequestHandler = (req, _, next) => {
  req.args = args
  req.heart = heart
  req.settings = settings
  req.updater = updater
  next()
}
```

**Multi-User Ready Pattern (Proposed):**

```typescript
// Service container
class ServiceContainer {
  private authService: AuthService
  private sessionStore: SessionStore
  private auditLogger: AuditLogger
  private isolationManager: IsolationStrategy
  
  constructor(config: MultiUserConfig) {
    this.sessionStore = createSessionStore(config.session)
    this.authService = new AuthService(userRepo, this.sessionStore, this.auditLogger)
    this.isolationManager = createIsolationStrategy(config.isolation)
  }
  
  getAuthService() { return this.authService }
  getSessionStore() { return this.sessionStore }
  // ...
}

// Usage in middleware
app.use((req, res, next) => {
  req.services = serviceContainer
  next()
})

// In routes
router.post('/login', async (req, res) => {
  const user = await req.services.getAuthService().authenticateUser(...)
})
```

---

## 7. KEY FILES & THEIR ROLES

### 7.1 Entry Point & Process Management

| File | Lines | Role |
|------|-------|------|
| `entry.ts` | 67 | CLI entry, parent/child branching |
| `wrapper.ts` | 200+ | Process lifecycle, IPC |
| `main.ts` | 246 | Server initialization, route registration |
| `app.ts` | 100 | Express app creation |

### 7.2 HTTP Routing

| File | Lines | Role |
|------|-------|------|
| `routes/index.ts` | 250+ | Route registration, middleware |
| `http.ts` | 250+ | Auth utilities, template replacement |
| `wsRouter.ts` | 69 | WebSocket upgrade handler |

### 7.3 Route Handlers

| File | Lines | Role |
|------|-------|------|
| `routes/vscode.ts` | 300+ | Main IDE interface, VS Code loading |
| `routes/login.ts` | 200+ | Authentication |
| `routes/logout.ts` | 30 | Session cleanup |
| `routes/pathProxy.ts` | 78 | Service routing |
| `routes/domainProxy.ts` | 100+ | Multi-domain proxy |

### 7.4 Support Services

| File | Lines | Role |
|------|-------|------|
| `heart.ts` | 83 | Idle detection |
| `vscodeSocket.ts` | 150+ | Workspace management |
| `socket.ts` | 120+ | TLS proxy |
| `settings.ts` | 57 | Preferences store |
| `update.ts` | 100+ | Version check |

### 7.5 CLI & Config

| File | Lines | Role |
|------|-------|------|
| `cli.ts` | 400+ | Argument parsing |
| `constants.ts` | 49 | Build info |
| `util.ts` | 300+ | Helpers (certs, paths, etc) |

### 7.6 Common/Shared

| File | Lines | Role |
|------|-------|------|
| `common/emitter.ts` | 62 | Event emitter |
| `common/http.ts` | 30 | HTTP constants |
| `common/util.ts` | 36 | String utilities |

---

## 8. EXISTING PERFORMANCE OPTIMIZATIONS

### 8.1 Current Optimizations

**Compression:**
- `compression()` middleware for Gzip responses
- Cache-control headers for static files

**Caching:**
- Lazy-load VS Code module (cached on first request)
- Settings file caching
- Update check caching (24-hour TTL)

**Resource Limits:**
- `--idle-timeout-seconds` (auto-shutdown on inactivity)
- `maxSessions` limits per user (types defined)
- `maxConcurrentConnections` limits

**Connection Pooling:**
- Reuses HTTP server connections
- WebSocket persistence

**Socket Optimization:**
- Unix socket support (lower latency than TCP)
- TLS socket proxying for child processes

### 8.2 Missing Optimizations

**Code-Level:**
- ❌ No HTTP response caching headers (Cache-Control)
- ❌ No bundle minification configuration
- ❌ No lazy-loading routes
- ❌ No request deduplication
- ❌ No database query optimization (no DB yet)
- ❌ No connection pooling for external APIs

**Infrastructure:**
- ❌ No metrics collection (Prometheus, StatsD)
- ❌ No performance monitoring
- ❌ No profiling hooks
- ❌ No memory leak detection
- ❌ No request logging/tracing

**Deployment:**
- ❌ No horizontal scaling support
- ❌ No caching layer (Redis, Memcached)
- ❌ No CDN integration
- ❌ No service worker caching strategy

---

## 9. AREAS FOR OPTIMIZATION

### 9.1 High-Priority Performance Optimizations

1. **Bundle Size & Code Splitting**
   - VS Code bundle is ~50MB+
   - Minify production builds
   - Tree-shake unused code
   - Lazy-load less-used extensions

2. **Request Handling**
   - Add HTTP response caching
   - Implement request deduplication
   - Cache frequently-accessed static files
   - Add service worker caching

3. **Memory Management**
   - Monitor heap usage
   - Implement session cleanup
   - Periodically clear caches

4. **WebSocket Optimization**
   - Message compression
   - Connection multiplexing
   - Backpressure handling

### 9.2 Medium-Priority Improvements

1. **Multi-User Scaling**
   - Implement SessionStore (Redis/DB)
   - Add UserIsolationStrategy
   - Container-based user isolation
   - Resource quotas per user

2. **Monitoring & Metrics**
   - Add Prometheus metrics endpoint
   - Track request latency
   - Monitor CPU/memory usage
   - Error rate tracking

3. **Security Hardening**
   - Add CSRF token validation
   - Implement rate limiting
   - Add IP-based access control
   - Request validation middleware

4. **Features**
   - Multi-user support
   - OAuth/SAML authentication
   - Database persistence
   - Audit logging to database

---

## 10. SUMMARY TABLE

| Aspect | Status | Details |
|--------|--------|---------|
| **Architecture** | Single-user, single-process | Ready for multi-user changes |
| **Backend** | Node.js + Express | Solid, extensible |
| **Frontend** | VS Code web | Full IDE capability |
| **Auth** | Password-based | Cookie sessions |
| **Build** | TypeScript + VS Code bundling | Complex, multi-step |
| **Deployment** | Docker-ready | Multi-stage optimized builds |
| **Testing** | 60% coverage target | Unit + E2E tests |
| **Monitoring** | None | Types defined for metrics |
| **Performance** | Good basic | Room for optimization |
| **Security** | Adequate | Multi-user features needed |

---

## CONCLUSION

The VSCode Web IDE is a **well-structured, single-user remote IDE** with solid fundamentals:

✅ **Strengths:**
- Clean separation of concerns
- Event-driven architecture
- Extensible service layer
- Docker-ready deployment
- Type-safe TypeScript

🔧 **Opportunities:**
- Multi-user support (types already defined)
- Performance monitoring
- Advanced caching strategies
- Horizontal scaling support
- Enhanced security features

The codebase is **production-ready for single-user deployments** and provides a solid foundation for **multi-user and enterprise features**.

