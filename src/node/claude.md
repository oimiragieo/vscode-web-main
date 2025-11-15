# src/node/ - Backend Server Implementation

## Overview

This directory contains the core backend/server-side implementation of the VSCode Web IDE. It handles HTTP/WebSocket communication, authentication, VS Code integration, session management, and all server-side operations.

## Directory Structure

```
src/node/
├── routes/              # HTTP route handlers (see routes/claude.md)
├── services/            # Multi-user services (NEW)
│   ├── types.ts        # TypeScript type definitions
│   ├── auth/           # Authentication & user management
│   │   ├── AuthService.ts
│   │   └── UserRepository.ts
│   ├── session/        # Session storage
│   │   └── SessionStore.ts
│   ├── isolation/      # User environment isolation
│   │   └── UserIsolationManager.ts
│   ├── audit/          # Security audit logging
│   │   └── AuditLogger.ts
│   ├── config/         # Multi-user configuration
│   │   └── MultiUserConfig.ts
│   └── MultiUserService.ts  # Service container
├── entry.ts            # Application entry point
├── main.ts             # Server orchestration
├── app.ts              # Express app factory
├── cli.ts              # CLI argument parsing
├── http.ts             # HTTP utilities and middleware
├── wsRouter.ts         # WebSocket routing system
├── vscodeSocket.ts     # Editor session management
├── proxy.ts            # HTTP proxy for port forwarding
├── socket.ts           # TLS socket proxy
├── heart.ts            # Activity heartbeat tracking
├── update.ts           # Update checking service
├── settings.ts         # Settings persistence
├── wrapper.ts          # Process lifecycle management
├── util.ts             # Node-specific utilities
└── constants.ts        # Application constants
```

---

## Core Entry Points

### entry.ts

**Purpose:** Main application entry point and mode dispatcher

**Location:** `src/node/entry.ts:1`

**Responsibilities:**

- Parse command-line arguments
- Determine execution mode
- Route to appropriate handler
- Handle IPC communication

**Execution Modes:**

1. **Server Mode** (default)
   - Starts web server
   - Serves VS Code IDE
   - Handles HTTP/WebSocket requests

2. **CLI Mode**
   - Extension management
   - `--install-extension`
   - `--uninstall-extension`
   - `--list-extensions`

3. **Child Process Mode**
   - Spawned by parent instance
   - Handles specific workspace
   - IPC with parent

4. **Existing Instance Mode**
   - Opens files in running instance
   - Uses IPC communication
   - Returns immediately

**Flow:**

```typescript
async function entry() {
  const args = await parseArgs()

  if (isChildProcess) {
    // Child mode: spawned instance
    return runChildServer(args)
  }

  if (hasExistingInstance && shouldUseExisting) {
    // Open in existing instance
    return openInExistingInstance(args)
  }

  if (isCLICommand) {
    // CLI mode: extension management
    return runCodeCli(args)
  }

  // Server mode: start web server
  return runCodeServer(args)
}
```

**Extension Point:** Add custom execution modes or command handlers

---

### main.ts

**Purpose:** Core server orchestration and initialization

**Location:** `src/node/main.ts:1`

**Key Functions:**

#### `runCodeServer(args: DefaultedArgs): Promise<void>`

Main server initialization and startup.

**Steps:**

1. Create Express application
2. Register routes and middleware
3. Set up authentication
4. Configure VS Code integration
5. Start HTTP/HTTPS server
6. Set up idle timeout (if configured)
7. Handle graceful shutdown

**Code Flow:**

```typescript
async function runCodeServer(args: DefaultedArgs): Promise<void> {
  // 1. Create app
  const app = await createApp(args)

  // 2. Register routes
  await registerRoutes(app, args)

  // 3. Start server
  const server = await app.listen()

  // 4. Set up services
  const updater = new UpdateProvider()
  const heart = new Heart()

  // 5. Handle shutdown
  process.on("SIGTERM", async () => {
    await server.close()
    await cleanup()
  })

  logger.info(`Server listening on ${server.address()}`)
}
```

**Related:** `src/node/app.ts`, `src/node/routes/index.ts`

---

#### `runCodeCli(args: DefaultedArgs): Promise<void>`

Handles VS Code CLI operations.

**Supported Operations:**

- Install extensions
- Uninstall extensions
- List installed extensions
- Locate extensions
- Enable proposed APIs

**Implementation:**

```typescript
async function runCodeCli(args: DefaultedArgs): Promise<void> {
  const vscode = await loadVSCode()

  if (args["install-extension"]) {
    for (const ext of args["install-extension"]) {
      await vscode.installExtension(ext)
      logger.info(`Installed ${ext}`)
    }
  }

  if (args["uninstall-extension"]) {
    for (const ext of args["uninstall-extension"]) {
      await vscode.uninstallExtension(ext)
      logger.info(`Uninstalled ${ext}`)
    }
  }

  if (args["list-extensions"]) {
    const extensions = await vscode.listExtensions()
    extensions.forEach((ext) => console.log(ext.id))
  }
}
```

**Related:** `src/node/routes/vscode.ts`

---

#### `openInExistingInstance(args: DefaultedArgs): Promise<void>`

Opens files in running instance via IPC.

**Use Case:** User runs `code-server file.txt` when server is already running

**Flow:**

1. Connect to existing instance via socket
2. Send file paths via IPC
3. Wait for acknowledgment
4. Exit

**Benefits:**

- Fast file opening
- No duplicate servers
- Seamless user experience

---

### app.ts

**Purpose:** Express application factory and HTTP server creation

**Location:** `src/node/app.ts:1`

**Key Functions:**

#### `createApp(args: DefaultedArgs): Promise<App>`

Creates and configures Express application.

**Returns:**

```typescript
interface App {
  router: express.Express // HTTP router
  wsRouter: WsRouter // WebSocket router
  listen(): Promise<Server> // Start server
}
```

**Configuration:**

```typescript
async function createApp(args: DefaultedArgs): Promise<App> {
  const app = express()

  // 1. Middleware
  app.use(compression())
  app.use(cookieParser())
  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))

  // 2. WebSocket router
  const wsRouter = new WsRouter()

  // 3. Editor session manager
  const sessionManager = new EditorSessionManager()

  // 4. TLS setup (if configured)
  const server = args.cert ? https.createServer(tlsOptions, app) : http.createServer(app)

  // 5. WebSocket upgrade handler
  server.on("upgrade", (req, socket, head) => {
    wsRouter.handleUpgrade(req, socket, head)
  })

  return { router: app, wsRouter, listen: () => server.listen(args.port) }
}
```

**Security Features:**

- HTTPS support (TLS/SSL)
- Cookie parsing
- Body parsing with size limits
- Compression for performance

**Related:** `src/node/wsRouter.ts`, `src/node/vscodeSocket.ts`

---

## HTTP & WebSocket

### http.ts

**Purpose:** HTTP utilities, middleware, and authentication

**Location:** `src/node/http.ts:1`

**Key Functions:**

#### `authenticated(req: express.Request): Promise<boolean>`

Checks if request is authenticated.

**Returns:** `true` if authenticated, `false` otherwise

**Checks:**

```typescript
async function authenticated(req: express.Request): Promise<boolean> {
  // 1. Check if auth is disabled
  if (req.args.auth === AuthType.None) {
    return true
  }

  // 2. Check session cookie
  const sessionToken = req.cookies[CookieKeys.Session]
  if (!sessionToken) {
    return false
  }

  // 3. Validate password
  return await isPasswordValid(sessionToken, req.args)
}
```

**Usage:**

```typescript
if (await authenticated(req)) {
  // Proceed
} else {
  res.redirect("/login")
}
```

---

#### `ensureAuthenticated: express.RequestHandler`

Middleware that enforces authentication.

**Behavior:**

- Checks authentication
- Throws `HttpError` if not authenticated
- Allows request to proceed if authenticated

**Usage:**

```typescript
app.get("/api/data", ensureAuthenticated, async (req, res) => {
  // User is authenticated
  res.json(data)
})
```

---

#### `redirect(req: express.Request, to: string): express.Response`

Creates redirect response with proper base path handling.

**Features:**

- Handles base path prefixes
- Preserves query parameters
- Relative path resolution

**Usage:**

```typescript
redirect(req, "/login?to=/workspace")
```

---

#### `replaceTemplates(content: string, variables: Record<string, any>): string`

Replaces `{{VARIABLE}}` placeholders in HTML templates.

**Variables:**

```typescript
replaceTemplates(html, {
  BASE: "/base",
  CS_STATIC_BASE: "/_static",
  ERROR: "Invalid credentials",
  I18N_LOGIN: "Sign In",
  OPTIONS: JSON.stringify({ theme: "dark" }),
})
```

**Pattern:** `{{VARIABLE_NAME}}`

**Usage:**

```html
<h1>{{I18N_TITLE}}</h1>
<p class="error">{{ERROR}}</p>
<script>
  const config = {{OPTIONS}};
</script>
```

---

#### `relativeRoot(req: express.Request): string`

Calculates relative path to root based on request path.

**Examples:**

```typescript
relativeRoot("/foo/bar") // '../..'
relativeRoot("/api") // '..'
relativeRoot("/") // '.'
```

**Use Case:** Generating relative asset paths in templates

---

### wsRouter.ts

**Purpose:** Express-compatible WebSocket routing system

**Location:** `src/node/wsRouter.ts:1`

**Problem:** Express doesn't natively support WebSocket routing

**Solution:** Custom router that mimics Express API for WebSockets

**Features:**

- Route-based WebSocket handling
- Middleware support
- Path parameter extraction
- Express-compatible API

**Interface:**

```typescript
class WsRouter {
  ws(path: string, ...handlers: WsHandler[]): void
  use(path: string, router: WsRouter): void
  use(middleware: WsMiddleware): void
  handleUpgrade(req, socket, head): void
}
```

**Usage:**

```typescript
const wsRouter = new WsRouter()

// Route with path parameters
wsRouter.ws("/api/chat/:roomId", async (req: WsRequest) => {
  const { roomId } = req.params

  wss.handleUpgrade(req, req.ws, req.head, (ws) => {
    ws.send(`Welcome to room ${roomId}`)
    req.ws.resume()
  })
})

// Nested routers
const apiRouter = new WsRouter()
apiRouter.ws("/chat", handler)
wsRouter.use("/api", apiRouter)

// Middleware
wsRouter.use(async (req, res, next) => {
  if (await authenticated(req)) {
    next()
  } else {
    req.ws.close()
  }
})
```

**Key Concepts:**

1. **Socket Pausing:** Pauses socket to prevent data loss during route matching
2. **Path Matching:** Uses path-to-regexp for route matching
3. **Request Augmentation:** Adds `ws`, `head`, `params` to request object

**Related:** `src/node/routes/vscode.ts` (WebSocket handlers)

---

## VS Code Integration

### vscodeSocket.ts

**Purpose:** Editor session management and workspace tracking

**Location:** `src/node/vscodeSocket.ts:1`

**Problem:** Multiple browser tabs may need separate VS Code instances

**Solution:** Track workspace → socket mappings

**Classes:**

#### `EditorSessionManager`

Manages VS Code editor sessions.

**Features:**

- Tracks workspace → socket mappings
- Connection verification
- Session cleanup
- Multi-workspace support

**Interface:**

```typescript
class EditorSessionManager {
  getSocketPath(workspace: string): string | undefined
  addSession(workspace: string, socketPath: string): void
  removeSession(workspace: string): void
  verifyConnection(socketPath: string): Promise<boolean>
  getAllSessions(): Map<string, string>
}
```

**Usage:**

```typescript
const manager = new EditorSessionManager()

// Register session
manager.addSession("/home/user/project", "/tmp/vscode-socket-123")

// Get socket for workspace
const socketPath = manager.getSocketPath("/home/user/project")

// Verify connection still alive
if (await manager.verifyConnection(socketPath)) {
  // Reuse existing session
} else {
  // Create new session
}
```

---

#### `EditorSessionManagerClient`

Client for communicating with session manager.

**Use Case:** Child processes query parent for existing sessions

**Methods:**

- `getSession(workspace)` - Get socket path for workspace
- `addSession(workspace, socket)` - Register new session
- `removeSession(workspace)` - Remove session

**IPC Communication:**

```typescript
const client = new EditorSessionManagerClient()

// Check for existing session
const existing = await client.getSession("/home/user/project")
if (existing) {
  // Reuse existing editor
} else {
  // Start new editor
}
```

---

## Proxying & Networking

### proxy.ts

**Purpose:** HTTP proxy for port forwarding

**Location:** `src/node/proxy.ts:1`

**Use Case:** Proxy requests to services running on different ports

**Example:** User runs dev server on port 3000, proxy makes it available at `/proxy/3000/`

**Features:**

- Port forwarding
- WebSocket proxying
- Error handling
- Base path rewriting

**Usage:**

```typescript
import { proxy, wsProxy } from "./src/node/proxy"

// HTTP proxy
app.all("/proxy/:port/*", proxy)

// WebSocket proxy
wsRouter.ws("/proxy/:port/*", wsProxy)
```

**Request Flow:**

```
Client: GET /proxy/3000/api/data
  ↓
Proxy: GET http://localhost:3000/api/data
  ↓
Dev Server: Returns data
  ↓
Proxy: Returns to client
```

**Path Rewriting:**

```typescript
// Remove /proxy/:port prefix
const targetPath = req.url.replace(/^\/proxy\/\d+/, "")

// Proxy to localhost:port
const target = `http://localhost:${port}${targetPath}`
```

**Related:** `src/node/routes/pathProxy.ts`

---

### socket.ts

**Purpose:** TLS socket proxy for child processes

**Location:** `src/node/socket.ts:1`

**Use Case:** Parent process handles TLS, forwards to child via Unix socket

**Architecture:**

```
Client (HTTPS) → Parent Process (TLS termination)
                      ↓ (Unix socket)
                 Child Process (HTTP)
```

**Benefits:**

- Centralized TLS handling
- Child processes don't need certificates
- Simplified certificate management

**Interface:**

```typescript
class SocketProxyProvider {
  constructor(socketPath: string)
  proxy(socket: net.Socket): void
  stop(): Promise<void>
}
```

**Usage:**

```typescript
const provider = new SocketProxyProvider("/tmp/vscode-socket")

server.on("connection", (socket) => {
  provider.proxy(socket)
})
```

---

## Services

### heart.ts

**Purpose:** Activity heartbeat tracking and idle timeout

**Location:** `src/node/heart.ts:1`

**Use Case:** Shut down server after period of inactivity

**Features:**

- File-based heartbeat indicator
- Connection counting
- Idle timeout support
- State change events

**States:**

1. **Alive** - Recent activity
2. **Expired** - No activity for timeout period
3. **Unknown** - Heartbeat file doesn't exist

**Interface:**

```typescript
class Heart {
  beat(): void
  alive(): boolean
  addConnection(): void
  removeConnection(): void
  onStateChange: Event<State>
}
```

**Usage:**

```typescript
const heart = new Heart("/tmp/code-server-heartbeat", 30000)

// Every request
app.use((req, res, next) => {
  heart.beat()
  next()
})

// Monitor connections
server.on("connection", () => heart.addConnection())
server.on("close", () => heart.removeConnection())

// Handle idle timeout
heart.onStateChange((state) => {
  if (state === State.Expired && heart.connectionCount === 0) {
    logger.info("Idle timeout reached, shutting down")
    process.exit(0)
  }
})
```

**Heartbeat File:**

```
/tmp/code-server-heartbeat
Content: timestamp of last activity
```

---

### update.ts

**Purpose:** GitHub-based update checking

**Location:** `src/node/update.ts:1`

**Features:**

- Checks GitHub releases for updates
- Semantic version comparison
- 24-hour caching
- Proxy support
- Settings persistence

**Interface:**

```typescript
class UpdateProvider {
  constructor(
    private currentVersion: string,
    private githubRepo: string
  )

  async checkForUpdates(): Promise<Update | undefined>
  async getLatestVersion(): Promise<string>
  isUpdateAvailable(): boolean
}

interface Update {
  version: string
  url: string
  notes: string
}
```

**Usage:**

```typescript
const updater = new UpdateProvider("4.10.0", "coder/code-server")

const update = await updater.checkForUpdates()
if (update) {
  logger.info(`Update available: ${update.version}`)
  logger.info(`Download: ${update.url}`)
}
```

**Caching:**

- Checks GitHub at most once per 24 hours
- Cached in settings file
- Prevents rate limiting

**Related:** `src/node/routes/update.ts`, `src/node/settings.ts`

---

### settings.ts

**Purpose:** JSON-based settings persistence

**Location:** `src/node/settings.ts:1`

**Use Case:** Store non-critical settings (last update check, query params, etc.)

**Features:**

- Type-safe settings
- File-based storage
- Shallow merge on writes
- Error-tolerant reads
- Atomic writes

**Interface:**

```typescript
class SettingsProvider<T> {
  constructor(settingsPath: string)

  async read(): Promise<T>
  async write(settings: Partial<T>): Promise<void>
}
```

**Usage:**

```typescript
interface AppSettings {
  lastUpdateCheck?: number
  queryParams?: Record<string, string>
  dismissedNotifications?: string[]
}

const settings = new SettingsProvider<AppSettings>("/config/settings.json")

// Read settings
const data = await settings.read()
console.log(data.lastUpdateCheck)

// Write settings (merges)
await settings.write({
  lastUpdateCheck: Date.now(),
})
```

**Storage Format:**

```json
{
  "lastUpdateCheck": 1620000000000,
  "queryParams": {
    "workspace": "/home/user/project"
  },
  "dismissedNotifications": ["update-4.10.0"]
}
```

**Error Handling:**

- File doesn't exist → returns `{}`
- Invalid JSON → returns `{}`
- Write errors → throws exception

---

## Process Management

### wrapper.ts

**Purpose:** Process lifecycle management and graceful shutdown

**Location:** `src/node/wrapper.ts:1`

**Features:**

- Parent/child process communication
- Graceful shutdown handling
- Signal handling (SIGTERM, SIGINT)
- `process.exit()` prevention
- Handshake protocol for IPC

**Architecture:**

```
Parent Process
    ↓ spawn
Child Process (wrapper)
    ↓ calls
Main Application
```

**Prevents:**

- Abrupt process termination
- Data loss on shutdown
- Incomplete cleanup

**Signal Handling:**

```typescript
process.on("SIGTERM", async () => {
  logger.info("Received SIGTERM, shutting down gracefully")

  // 1. Stop accepting new connections
  await server.close()

  // 2. Clean up resources
  await pluginManager.destroyAll()
  await sessionManager.cleanup()

  // 3. Exit cleanly
  process.exit(0)
})
```

**IPC Handshake:**

```typescript
// Child sends ready signal
process.send({ type: "ready", pid: process.pid })

// Parent acknowledges
parentProcess.on("message", (msg) => {
  if (msg.type === "ack") {
    // Start accepting requests
  }
})
```

---

## Utilities

### util.ts

**Purpose:** Node-specific utility functions

**Location:** `src/node/util.ts:1`

**Functions:**

#### `getFirstString(value: string | string[] | undefined): string | undefined`

Extracts first string from query parameter.

**Usage:**

```typescript
// req.query.workspace could be string or string[]
const workspace = getFirstString(req.query.workspace)
```

---

#### `normalize(path: string): string`

Normalizes file system paths.

**Platform-aware:** Handles Windows and Unix paths

---

#### `isDirectory(path: string): Promise<boolean>`

Checks if path is a directory.

---

#### `ensureDirectory(path: string): Promise<void>`

Creates directory if it doesn't exist (recursive).

---

### constants.ts

**Purpose:** Application-wide constants

**Location:** `src/node/constants.ts:1`

**Constants:**

```typescript
export const DEFAULT_PORT = 8080
export const DEFAULT_HOST = "127.0.0.1"
export const SESSION_COOKIE_NAME = "code-server-session"
export const CSRF_COOKIE_NAME = "code-server-csrf"
export const HEARTBEAT_INTERVAL = 60000
export const UPDATE_CHECK_INTERVAL = 86400000
```

---

## CLI Arguments

### cli.ts

**Purpose:** Command-line argument parsing and validation

**Location:** `src/node/cli.ts:1`

**Exports:**

```typescript
interface Args {
  // Server
  "bind-addr"?: string
  port?: number
  host?: string
  socket?: string

  // Authentication
  auth?: "password" | "none"
  password?: string
  "hashed-password"?: string

  // HTTPS
  cert?: string
  "cert-key"?: string

  // Paths
  "user-data-dir"?: string
  "extensions-dir"?: string

  // Features
  "disable-telemetry"?: boolean
  "disable-update-check"?: boolean

  // VS Code args
  _: string[] // Positional args passed to VS Code
}
```

**Parsing:**

```typescript
import { parse } from "./src/node/cli"

const args = await parse(process.argv.slice(2))
```

**Validation:**

- Port range (1-65535)
- Path existence
- Mutually exclusive options
- Required dependencies

---

## Extension Integration Points

### Custom Routes

Add routes via plugin system:

```typescript
async init(context: PluginContext): Promise<void> {
  const { app } = context

  app.get('/api/my-feature', async (req, res) => {
    res.json({ data: 'Hello' })
  })
}
```

### Custom Authentication

Replace or extend authentication:

```typescript
app.use(async (req, res, next) => {
  // Custom auth logic
  req.isAuthenticated = await customAuthCheck(req)
  next()
})
```

### Session Management

Access session manager:

```typescript
const sessionManager = context.services.get("sessionManager")
const sessions = sessionManager.getAllSessions()
```

---

## Best Practices

### Error Handling

```typescript
app.get("/api/data", async (req, res, next) => {
  try {
    const data = await fetchData()
    res.json(data)
  } catch (error) {
    next(error) // Pass to error handler
  }
})
```

### Authentication

```typescript
app.get("/api/secure", ensureAuthenticated, async (req, res) => {
  // User is authenticated
})
```

### Logging

```typescript
logger.info("Server started", { port, host })
logger.error("Failed to connect", { error: error.message })
```

---

## Related Files

- **Routes:** `src/node/routes/` (see routes/claude.md)
- **Core Systems:** `src/core/` (see core/claude.md)
- **Common Utilities:** `src/common/` (see common/claude.md)

---

## Multi-User Services (NEW)

The VSCode Web IDE now supports multi-user deployment through a comprehensive service architecture located in `src/node/services/`.

### Overview

The multi-user system enables:

- **Two deployment modes:** Single-user (default) and Multi-user (opt-in)
- **Complete user isolation:** Separate filesystems, settings, extensions per user
- **Production-ready security:** User authentication, session management, audit logging
- **Resource management:** Quotas, limits, and usage tracking per user
- **Scalability:** Support for horizontal scaling with load balancing

**Documentation:** See [MULTI_USER_README.md](../../MULTI_USER_README.md) for complete overview

---

### services/types.ts

**Purpose:** TypeScript type definitions for all multi-user services

**Location:** `src/node/services/types.ts:1`

**Key Types:**

- `DeploymentMode` - Single or Multi deployment mode
- `User` - User entity with authentication data
- `Session` - User session with expiration
- `UserEnvironment` - Isolated user environment
- `ResourceLimits` - Per-user resource quotas
- `AuditEvent` - Security audit event
- `MultiUserConfig` - Complete configuration

**Lines:** 400+

**Usage:**

```typescript
import { User, Session, DeploymentMode } from "../services/types"
```

---

### services/auth/AuthService.ts

**Purpose:** User authentication and session management

**Location:** `src/node/services/auth/AuthService.ts:1`

**Responsibilities:**

- User creation, update, deletion
- Password hashing with Argon2
- Login/logout with audit logging
- Session creation and validation
- Token generation (JWT-ready)
- Password strength validation
- Session limits per user

**Key Methods:**

```typescript
class AuthService {
  // User management
  async createUser(input: CreateUserInput): Promise<User>
  async updateUser(userId: string, updates: UpdateUserInput): Promise<User>
  async deleteUser(userId: string): Promise<void>
  async getUserById(userId: string): Promise<User | null>
  async getUserByUsername(username: string): Promise<User | null>

  // Authentication
  async authenticateUser(username: string, password: string): Promise<User | null>
  async login(username: string, password: string, metadata: SessionMetadata): Promise<LoginResponse>
  async logout(sessionToken: string, metadata?: Partial<SessionMetadata>): Promise<void>

  // Session management
  async createSession(input: CreateSessionInput): Promise<Session>
  async validateSession(sessionToken: string): Promise<Session | null>
  async refreshSession(sessionToken: string): Promise<Session>
  async revokeSession(sessionToken: string): Promise<void>
  async revokeUserSessions(userId: string): Promise<void>
  async getActiveSessions(userId: string): Promise<Session[]>
}
```

**Lines:** 350+

**Security Features:**

- Argon2 password hashing
- Password complexity validation
- Session expiration
- Rate limiting integration
- Audit logging for all events

---

### services/auth/UserRepository.ts

**Purpose:** User data persistence layer

**Location:** `src/node/services/auth/UserRepository.ts:1`

**Implementations:**

1. **MemoryUserRepository** - In-memory storage for development
2. **DatabaseUserRepository** - Database storage for production (SQLite, PostgreSQL, MySQL)

**Key Methods:**

```typescript
interface UserRepository {
  create(user: User): Promise<User>
  findById(id: string): Promise<User | null>
  findByUsername(username: string): Promise<User | null>
  findByEmail(email: string): Promise<User | null>
  findAll(options?: { limit?: number; offset?: number }): Promise<User[]>
  update(id: string, updates: Partial<User>): Promise<User>
  delete(id: string): Promise<void>
  count(): Promise<number>
}
```

**Lines:** 200+

**Features:**

- Multiple backend support
- Username/email uniqueness validation
- Pagination support
- Automatic indexing (database mode)

---

### services/session/SessionStore.ts

**Purpose:** Session storage with multiple backend support

**Location:** `src/node/services/session/SessionStore.ts:1`

**Implementations:**

1. **MemorySessionStore** - In-memory with automatic cleanup (development/single-instance)
2. **RedisSessionStore** - Redis backend for distributed deployments
3. **DatabaseSessionStore** - Database backend for persistent sessions

**Key Methods:**

```typescript
interface SessionStore {
  // CRUD operations
  set(sessionId: string, session: Session, ttl?: number): Promise<void>
  get(sessionId: string): Promise<Session | null>
  delete(sessionId: string): Promise<void>
  exists(sessionId: string): Promise<boolean>

  // Query operations
  getUserSessions(userId: string): Promise<Session[]>
  getAllActiveSessions(): Promise<Session[]>

  // Bulk operations
  deleteUserSessions(userId: string): Promise<number>
  deleteExpiredSessions(): Promise<number>

  // Statistics
  getSessionCount(): Promise<number>
  getUserSessionCount(userId: string): Promise<number>
}
```

**Lines:** 400+

**Features:**

- TTL-based expiration
- Automatic cleanup
- Factory pattern for easy switching
- User session tracking

**Usage:**

```typescript
// Development (in-memory)
const sessionStore = new MemorySessionStore()

// Production (Redis)
const sessionStore = new RedisSessionStore(redisClient)

// Production (Database)
const sessionStore = new DatabaseSessionStore(dbConnection)
```

---

### services/isolation/UserIsolationManager.ts

**Purpose:** User environment isolation and resource management

**Location:** `src/node/services/isolation/UserIsolationManager.ts:1`

**Strategies:**

1. **DirectoryIsolationStrategy** - OS-level directory isolation (Phase 1 ready)
2. **ContainerIsolationStrategy** - Container-based isolation (Phase 2 placeholder)

**Key Methods:**

```typescript
interface IsolationStrategy {
  // User environment setup
  initializeUserEnvironment(userId: string): Promise<UserEnvironment>
  destroyUserEnvironment(userId: string): Promise<void>

  // Resource access
  getUserDataPath(userId: string): string
  getUserSettingsPath(userId: string): string
  getUserExtensionsPath(userId: string): string
  getUserWorkspacesPath(userId: string): string
  getUserLogsPath(userId: string): string

  // Resource management
  enforceStorageQuota(userId: string): Promise<void>
  getResourceUsage(userId: string): Promise<ResourceUsage>
  checkQuota(userId: string, resource: ResourceType): Promise<QuotaStatus>

  // Cleanup
  cleanupIdleResources(idleThresholdMinutes: number): Promise<number>
}
```

**Lines:** 300+

**Features:**

- Per-user directory structure
- Storage quota enforcement
- Resource usage tracking
- Idle resource cleanup
- Default settings initialization

**Directory Structure (per user):**

```
/var/lib/code-server/users/
└── {user-id}/
    ├── data/           # User data files
    ├── settings/       # VS Code settings
    ├── extensions/     # User extensions
    ├── workspaces/     # User workspaces
    └── logs/           # User logs
```

---

### services/audit/AuditLogger.ts

**Purpose:** Security audit logging

**Location:** `src/node/services/audit/AuditLogger.ts:1`

**Implementations:**

1. **FileAuditLogger** - File-based logging with daily rotation
2. **DatabaseAuditLogger** - Database-backed queryable audit trail
3. **CompositeAuditLogger** - Multiple backends simultaneously

**Key Methods:**

```typescript
interface AuditLogger {
  log(event: AuditEvent): Promise<void>
  query(filter: AuditEventFilter): Promise<AuditEvent[]>
  close(): Promise<void>
}
```

**Lines:** 300+

**Logged Events:**

- User login/logout (success/failure)
- User creation/update/deletion
- Session creation/expiration/revocation
- Resource access/modification
- Quota exceeded
- Security violations
- Admin actions

**Features:**

- Daily log rotation (file mode)
- Queryable audit trail (database mode)
- Event filtering and pagination
- Timestamp-based queries
- User activity tracking

**Usage:**

```typescript
// File-based logging
const auditLogger = new FileAuditLogger({
  logDir: "/var/log/code-server/audit",
  rotateDaily: true,
})

// Database logging
const auditLogger = new DatabaseAuditLogger(dbConnection)

// Both simultaneously
const auditLogger = new CompositeAuditLogger([fileLogger, dbLogger])
```

---

### services/config/MultiUserConfig.ts

**Purpose:** Multi-user configuration loading and validation

**Location:** `src/node/services/config/MultiUserConfig.ts:1`

**Responsibilities:**

- Load configuration from YAML/JSON files
- Apply environment variable overrides
- Validate configuration
- Create initial admin user
- Provide default values

**Key Methods:**

```typescript
class MultiUserConfigLoader {
  static async load(args: CodeServerArgs): Promise<MultiUserConfig | null>
  static async createInitialAdmin(authService: AuthService, config: AdminConfig): Promise<void>
}
```

**Lines:** 250+

**Configuration Sources (priority order):**

1. Environment variables (highest priority)
2. Configuration file (YAML/JSON)
3. Default values (lowest priority)

**Example Configuration:**

```yaml
deployment-mode: multi

multi-user:
  auth:
    provider: database
    database:
      type: sqlite
      path: /var/lib/code-server/users.db
    session:
      store: redis
      ttl: 86400

  isolation:
    strategy: directory
    base-path: /var/lib/code-server/users

  limits:
    max-sessions-per-user: 5
    storage-quota-mb: 5000

  features:
    audit-logging: true
```

**Environment Variable Overrides:**

```bash
CODE_SERVER_DEPLOYMENT_MODE=multi
CODE_SERVER_DB_TYPE=postgres
CODE_SERVER_DB_HOST=localhost
CODE_SERVER_SESSION_STORE=redis
CODE_SERVER_REDIS_HOST=localhost
ADMIN_USERNAME=admin
ADMIN_PASSWORD=SecurePassword123!
```

---

### services/MultiUserService.ts

**Purpose:** Service container and orchestration

**Location:** `src/node/services/MultiUserService.ts:1`

**Responsibilities:**

- Initialize all multi-user services
- Manage service lifecycle
- Provide unified service interface
- Handle cleanup

**Key Methods:**

```typescript
class MultiUserService {
  public authService: AuthService
  public sessionStore: SessionStore
  public userRepository: UserRepository
  public isolationStrategy: IsolationStrategy
  public auditLogger: AuditLogger

  static async create(config: MultiUserConfig): Promise<MultiUserService>
  async close(): Promise<void>
}
```

**Usage:**

```typescript
// In main.ts
const multiUserConfig = await MultiUserConfigLoader.load(args)
if (multiUserConfig) {
  const multiUserService = await MultiUserService.create(multiUserConfig)

  // Create initial admin user
  await MultiUserConfigLoader.createInitialAdmin(multiUserService.authService, {
    username: "admin",
    email: "admin@example.com",
    password: "SecurePassword123!",
  })

  // Pass to app
  const { server } = await createApp(args, multiUserService)
}
```

---

### Integration with Main Server

**Modified Files:**

1. `src/node/main.ts` - Load multi-user config, create services
2. `src/node/app.ts` - Inject multi-user service into requests
3. `src/node/routes/login.ts` - Use multi-user auth for login
4. `src/node/routes/users.ts` - New user management API (to be created)

**Request Flow (Multi-User Mode):**

```
HTTP Request
    ↓
Express Middleware
    ↓
Multi-User Service Injection (req.multiUser)
    ↓
Authentication Middleware
    ↓
Route Handler (with user context)
    ↓
Response
```

---

### Database Schema

Multi-user mode requires the following database tables:

**Users Table:**

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  roles TEXT NOT NULL,  -- JSON array
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  metadata TEXT NOT NULL DEFAULT '{}'
);
```

**Sessions Table:**

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_activity TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  user_agent TEXT NOT NULL,
  container_id TEXT,
  process_id INTEGER,
  metadata TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

**Audit Events Table:**

```sql
CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  event_type TEXT NOT NULL,
  user_id TEXT,
  username TEXT,
  ip_address TEXT NOT NULL,
  user_agent TEXT NOT NULL,
  status TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  error TEXT
);
```

---

### API Endpoints (Multi-User Mode)

**User Management:**

- `GET /api/users/me` - Get current user info
- `GET /api/users` - List all users (admin only)
- `POST /api/users` - Create new user (admin only)
- `PUT /api/users/:userId` - Update user (admin only)
- `DELETE /api/users/:userId` - Delete user (admin only)

**Session Management:**

- `GET /api/users/me/sessions` - List active sessions
- `DELETE /api/users/me/sessions/:sessionId` - Revoke session

**Resource Management:**

- `GET /api/users/me/usage` - Get resource usage

**See:** [IMPLEMENTATION_GUIDE.md](../../IMPLEMENTATION_GUIDE.md) for complete API documentation

---

### Configuration Examples

**Development (SQLite + Memory):**

```yaml
deployment-mode: multi
multi-user:
  auth:
    provider: database
    database:
      type: sqlite
      path: /tmp/code-server-users.db
    session:
      store: memory
```

**Production (PostgreSQL + Redis):**

```yaml
deployment-mode: multi
multi-user:
  auth:
    provider: database
    database:
      type: postgres
      host: postgres.internal
      database: code_server
    session:
      store: redis
      redis:
        host: redis.internal
```

**See:** [MULTI_USER_ARCHITECTURE_DESIGN.md](../../MULTI_USER_ARCHITECTURE_DESIGN.md) for complete configuration reference

---

### Testing Multi-User Services

**Unit Tests:**

```typescript
import { AuthService } from "../services/auth/AuthService"
import { MemoryUserRepository } from "../services/auth/UserRepository"
import { MemorySessionStore } from "../services/session/SessionStore"

describe("Multi-User System", () => {
  let authService: AuthService

  beforeEach(() => {
    const userRepo = new MemoryUserRepository()
    const sessionStore = new MemorySessionStore()
    authService = new AuthService(userRepo, sessionStore)
  })

  it("should create a user", async () => {
    const user = await authService.createUser({
      username: "testuser",
      email: "test@example.com",
      password: "Password123!",
    })
    expect(user.username).toBe("testuser")
  })
})
```

---

### Performance Considerations

**Single-User Mode:**

- No overhead - services not loaded
- Same performance as before
- Backward compatible

**Multi-User Mode:**

- Database queries for authentication
- Session store lookups
- Resource usage tracking
- Minimal overhead (<10ms per request)

**Optimizations:**

- Session caching
- Database connection pooling
- Lazy loading of user environments
- Background cleanup tasks

---

### Security Best Practices

1. **Always use HTTPS in production**
2. **Use strong passwords** (enforced by default)
3. **Enable audit logging** for compliance
4. **Set appropriate resource quotas** to prevent abuse
5. **Use Redis or database session store** for distributed deployments
6. **Rotate admin passwords** after initial setup
7. **Monitor audit logs** for suspicious activity
8. **Keep dependencies updated** (especially Argon2, database drivers)

---

### Troubleshooting

**Issue: "Database locked" (SQLite)**

- Solution: Use PostgreSQL for concurrent writes or ensure single-threaded access

**Issue: "Session not found" after restart**

- Solution: Use Redis or database session store for persistence

**Issue: "Storage quota exceeded"**

- Solution: Increase quota or clean up user files

**Issue: "Permission denied" on user directories**

- Solution: Check directory permissions (should be 0700)

**See:** [IMPLEMENTATION_GUIDE.md#9-troubleshooting](../../IMPLEMENTATION_GUIDE.md#9-troubleshooting) for complete troubleshooting guide

---

### Documentation

**Comprehensive Documentation:**

- [MULTI_USER_README.md](../../MULTI_USER_README.md) - Overview and quick start
- [MULTI_USER_ARCHITECTURE_DESIGN.md](../../MULTI_USER_ARCHITECTURE_DESIGN.md) - Complete architecture (70+ pages)
- [IMPLEMENTATION_GUIDE.md](../../IMPLEMENTATION_GUIDE.md) - Step-by-step integration
- [SERVER_ARCHITECTURE_ANALYSIS.md](../../SERVER_ARCHITECTURE_ANALYSIS.md) - Current system analysis
- [ARCHITECTURE_DIAGRAMS.md](../../ARCHITECTURE_DIAGRAMS.md) - Visual diagrams

---

## Future Enhancements

- [x] Multi-user support (Phase 1 complete)
- [ ] Container-based isolation (Phase 2)
- [ ] OAuth/SAML integration (Phase 3)
- [ ] Admin dashboard UI (Phase 3)
- [ ] Usage analytics (Phase 3)
- [ ] Cluster mode support
- [ ] Advanced load balancing
- [ ] Metrics collection
- [ ] Distributed tracing
- [ ] gRPC support
- [ ] GraphQL API
- [ ] Advanced caching
