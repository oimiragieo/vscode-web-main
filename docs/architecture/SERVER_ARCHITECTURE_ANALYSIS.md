# VSCode Web IDE - Server Architecture Analysis

## Multi-User Session Management Design Reference

**Analysis Date:** 2025-11-15  
**Scope:** Server entry points, session handling, process management, WebSocket/IPC, file system, auth/authorization

---

## 1. EXECUTIVE SUMMARY

The VSCode Web IDE is a single-instance, single-user remote IDE server with:

- **No native multi-user support** (single password-based auth)
- **No distributed/clustered deployment** (single process model)
- **Parent-child process model** for hot reloading
- **EditorSessionManager** for multiple workspace sessions within a single user context
- **Socket-based IPC** for inter-process communication
- **WebSocket** for real-time client-server communication
- **File-based state persistence** (no database)

**Key Finding:** Current architecture is fundamentally single-user. Multi-user support requires architectural changes at the authentication, session, and state management layers.

---

## 2. SERVER ENTRY POINTS & STARTUP

### 2.1 Entry Point Hierarchy

```
npm entry (out/node/entry.js)
  ↓ entry.ts
  ├─ ParentProcess (if not spawned)
  │   └─ spawn child via cp.fork()
  │   └─ Handshake & IPC message passing
  │   └─ Hot reload on SIGUSR1/SIGUSR2
  │
  └─ ChildProcess (if CODE_SERVER_PARENT_PID env set)
      └─ Handshake with parent
      └─ runCodeServer() → app startup
      └─ preventExit() to control shutdown
```

### 2.2 Main Server Startup Flow

**File: `/src/node/main.ts`**

```typescript
runCodeServer(args: DefaultedArgs)
  ├─ createApp(args) → Express + HTTP/S server
  │   ├─ Create Express router
  │   ├─ Add compression middleware
  │   ├─ Listen on host:port or unix socket
  │   └─ Create EditorSessionManager & session server
  │
  ├─ register(app, args) → Mount all routes
  │   ├─ Initialize Heart (heartbeat/idle detection)
  │   ├─ Add common middleware
  │   ├─ Mount domain/path proxies
  │   ├─ Mount auth routes (/login, /logout)
  │   ├─ Mount vscode routes (main IDE)
  │   └─ Mount health check endpoint
  │
  └─ Return { server, dispose } for shutdown
```

### 2.3 Key Startup Configuration

**Recognized via `src/node/cli.ts`:**

- `--host` / `--port` (HTTP binding)
- `--socket` / `--socket-mode` (Unix socket)
- `--auth` (none | password)
- `--password` / `--hashed-password` (single password)
- `--session-socket` (separate session manager socket)
- `--user-data-dir` (workspace + settings storage)
- `--extensions-dir` (VS Code extensions)
- `--cert` / `--cert-key` (HTTPS)
- `--idle-timeout-seconds` (auto-shutdown)
- `--disable-proxy` (disable path/domain proxies)

---

## 3. EXISTING SESSION/STATE MANAGEMENT

### 3.1 EditorSessionManager (Current Multi-Workspace Support)

**File: `/src/node/vscodeSocket.ts`**

Manages multiple VS Code editor instances for different workspaces:

```typescript
class EditorSessionManager {
  private entries = new Map<string, EditorSessionEntry>()

  addSession(entry: EditorSessionEntry): void
  deleteSession(socketPath: string): void
  getCandidatesForFile(filePath: string): EditorSessionEntry[]
  getConnectedSocketPath(filePath: string): Promise<string | undefined>
}

interface EditorSessionEntry {
  workspace: {
    id: string
    folders: { uri: { path: string } }[]
  }
  socketPath: string // IPC socket for this workspace's editor
}
```

**Purpose:** Route file operations to the correct workspace's editor instance.

**Limitations:**

- ❌ No user isolation (single user can have multiple workspaces)
- ❌ No persistence across restarts
- ❌ In-memory Map only
- ❌ Matches by file path prefix only

### 3.2 Session Management API

**Separate HTTP server on `--session-socket`:**

```
GET  /session?filePath=<path> → { socketPath }
POST /add-session              → { entry }
POST /delete-session           → { socketPath }
```

This allows multiple code-server instances to coordinate workspace sessions.

### 3.3 Authentication & Authorization

**File: `/src/node/http.ts` & `/src/node/routes/login.ts`**

**Current Model:**

- ✅ Single password for all users
- ✅ Cookie-based sessions (`CookieKeys.Session`)
- ✅ Argon2 password hashing
- ✅ Rate limiting (2/min, 12/hour on login)
- ❌ **NO per-user credentials**
- ❌ **NO role-based access control**
- ❌ **NO token-based auth** (only cookies)

**Auth Flow:**

```
POST /login { password }
  ↓ validatePassword()
  ↓ setcookie("coder.sid", hashedPassword)
  ↓ Authenticated for all subsequent requests
```

**Checking Auth:**

```typescript
authenticated(req: Request): Promise<boolean>
  ├─ Get cookie from req.cookies["coder.sid"]
  ├─ Compare with stored hashed password
  └─ Return boolean
```

### 3.4 Settings Persistence

**File: `/src/node/settings.ts`**

```typescript
class SettingsProvider<T> {
  async read(): Promise<T> // Read from JSON file
  async write(settings: Partial<T>): Promise<void> // Write + merge
}

interface CoderSettings {
  query?: ParsedQs // Last opened workspace/folder
  update?: {
    // Update check cache
    checked: number
    version: string
  }
}
```

**Storage:** `<user-data-dir>/coder.json`

**⚠️ Current Limitations:**

- Single global settings file (not per-user)
- Last opened workspace shared across sessions
- No fine-grained per-user settings

### 3.5 State Management Summary

| Component          | Type       | Storage              | Scope                      |
| ------------------ | ---------- | -------------------- | -------------------------- |
| Password           | Memory     | Env/Config           | App-wide (single password) |
| User session       | Cookie     | Browser              | Per-connection             |
| Workspace sessions | Memory Map | EditorSessionManager | Current instance only      |
| Editor settings    | File       | `coder.json`         | App-wide                   |
| Heartbeat          | File       | `heartbeat`          | Idle detection             |
| Certificates       | File       | `data/`              | HTTPS certs                |
| Extensions         | Directory  | `extensions-dir/`    | VS Code extensions         |

---

## 4. PROCESS MANAGEMENT

### 4.1 Parent-Child Process Model

**File: `/src/node/wrapper.ts`**

```
ParentProcess (npm entry)
├─ Fork child process
├─ Listen for messages
│  └─ type: "relaunch" → reload child on update
│  └─ type: "handshake" → pass args to child
├─ Handle signals
│  └─ SIGUSR1/SIGUSR2 → trigger relaunch
└─ Logging (stdout/stderr to rotating files)

ChildProcess (actual server)
├─ Handshake with parent
├─ Receive args via IPC message
├─ runCodeServer() → start listening
├─ preventExit() → ignore process.exit() calls
└─ Can request relaunch from parent
```

**Message Protocol:**

```typescript
// Child to Parent
type ChildMessage = { type: "handshake" } | { type: "relaunch"; version: string }

// Parent to Child
type ParentMessage = { type: "handshake"; args: DefaultedArgs }
```

### 4.2 CLI Process Spawning

**File: `/src/node/main.ts`**

For VS Code CLI operations (install extensions, etc.):

```typescript
runCodeCli(args) {
  // 1. Set CODE_SERVER_PARENT_PID env var
  process.env.CODE_SERVER_PARENT_PID = process.pid.toString()

  // 2. Import VS Code server module dynamically
  const mod = await eval(`import("/path/to/vscode/out/server-main.js")`)

  // 3. Call spawnCli() which exits on its own
  await mod.spawnCli(args)
}
```

**Spawning Patterns:**

- ❌ `cp.spawn()` for opening browser (see `/src/node/util.ts`)
- ❌ No background worker processes
- ❌ No job queue
- ❌ No process pooling

### 4.3 Socket Proxy for TLS

**File: `/src/node/socket.ts`**

```typescript
class SocketProxyProvider {
  async createProxy(socket: TLSSocket | Duplex): Promise<Socket>
  // Spawns proxy server on demand for TLS socket forwarding
  // Allows passing TLS sockets to child processes
}
```

Used in WebSocket upgrade to forward secure connections.

---

## 5. WEBSOCKET & IPC COMMUNICATION

### 5.1 WebSocket Setup

**File: `/src/node/wsRouter.ts`**

```typescript
// Upgrade handler on HTTP server
server.on("upgrade", (req, socket, head) => {
  // Route upgrade to Express WebSocket handlers
})

// WebSocket Router (custom Express integration)
class WebsocketRouter {
  ws(route, ...handlers): void
  // Registers WebSocket handler
}
```

### 5.2 WebSocket Routing

**File: `/src/node/routes/index.ts` & `vscode.ts`**

```
WebSocket connections to /vscode and / routes
  ↓
ensureAuthenticated() - validate cookie
  ↓
ensureVSCodeLoaded() - lazy load VS Code module
  ↓
vscodeServer.handleUpgrade() - VS Code handles socket
  ↓
socket.resume() - start piping data
```

**VS Code Integration:**

```typescript
vscodeServer.handleUpgrade(req, wrappedSocket)
// VS Code's native WebSocket handling for:
// - Terminal I/O
// - File operations
// - Extension communication
```

### 5.3 IPC Mechanisms

| Mechanism                          | Purpose                           | Files                             |
| ---------------------------------- | --------------------------------- | --------------------------------- |
| `process.send()` / `on("message")` | Parent-child handshake & relaunch | `wrapper.ts`                      |
| Unix sockets (IPC path)            | Session manager coordination      | `vscodeSocket.ts`                 |
| WebSocket (HTTP upgrade)           | Client-server real-time data      | `wsRouter.ts`, `routes/vscode.ts` |
| HTTP (path proxy)                  | Forwarding requests               | `routes/pathProxy.ts`             |
| HTTP (domain proxy)                | Multi-tenant domain forwarding    | `routes/domainProxy.ts`           |

---

## 6. FILE SYSTEM ACCESS PATTERNS

### 6.1 Key Directories

```
$HOME/.local/share/code-server/          (data dir)
├── coder.json                           (global settings)
├── heartbeat                            (idle detection)
├── coder-logs/                          (rotating logs)
│   ├── code-server-stdout.log
│   └── code-server-stderr.log
├── <hostname>.crt / .key                (HTTPS certs)
├── serve-web-key-half                   (WebSocket security key)
└── tls-proxy/                           (TLS socket proxy)

--user-data-dir (default ~/.config/code-server/)
├── settings.json                        (VS Code user settings)
├── keybindings.json                     (VS Code keybindings)
├── extensions/                          (installed extensions)
└── workspaceStorage/                    (workspace metadata)

--extensions-dir (default ~/.config/code-server/extensions/)
└── [extension-id]/                      (individual extensions)
```

### 6.2 File Access Control

**Current Model:**

- ✅ Process user owns all files
- ✅ No per-user file isolation
- ✅ All authenticated users access same files
- ❌ No file-level ACLs
- ❌ No user-specific directories

### 6.3 Settings Operations

```typescript
// Async file operations used throughout
const settings = new SettingsProvider<CoderSettings>(path.join(args["user-data-dir"], "coder.json"))

// Shallow merge semantics
await settings.write({ query: { folder: "/path" } })
// Reads current → merges → writes back
```

---

## 7. AUTHENTICATION & AUTHORIZATION (Detailed)

### 7.1 Current Auth System

**Single-password model:**

```typescript
// Config: password, hashed-password, or auth=none
switch (args.auth) {
  case AuthType.Password:
  // Validate password on login
  // Compare with hashed-password from args
  // Set cookie

  case AuthType.None:
  // Skip auth entirely
}
```

**Password Methods:**

1. **PLAIN_TEXT** - Plaintext password in config (legacy)
2. **ARGON2** - Modern Argon2 hashing
3. **SHA256** - Legacy SHA256 (deprecated)

### 7.2 Request Authentication Middleware

```typescript
ensureAuthenticated(req, res, next) {
  const cookieValid = await authenticated(req)
  if (!cookieValid) throw HttpError(401)
  next()
}
```

**Applied to:**

- All `/vscode` routes (IDE access)
- All WebSocket routes
- Most API endpoints (except `/login`, `/health`)

### 7.3 Missing Authorization Features

❌ **NO per-user features:**

- User identification in logs
- Per-user file isolation
- Per-user extensions
- Per-user settings
- Role-based access (admin, user, viewer)
- Per-resource permissions

❌ **NO token-based auth:**

- No JWT / bearer tokens
- No API keys for programmatic access
- No session expiration (only idle timeout)

❌ **NO audit trail:**

- No login/logout event logging
- No action audit logs
- No failed attempt tracking (except rate limit)

### 7.4 Security Measures

✅ **Implemented:**

- Argon2 password hashing (strong)
- Rate limiting on login (2/min, 12/hour)
- Timing-safe password comparison
- Origin validation on WebSockets
- HTTPS support
- CSRF protection via origin header
- Cookie secure flag (when HTTPS)
- HttpOnly flag on session cookie

⚠️ **Partially Implemented:**

- Content Security Policy (basic)
- Security headers (missing some)

❌ **NOT Implemented:**

- CSRF tokens (relies only on origin header)
- Explicit session timeout
- Concurrent session limiting
- IP-based access control
- OAuth/OpenID Connect
- LDAP/Active Directory integration

---

## 8. VS CODE MODULE INTEGRATION

### 8.1 Dynamic Module Loading

**File: `/src/node/routes/vscode.ts`**

```typescript
async function loadVSCode(req): Promise<IVSCodeServerAPI> {
  // Dynamically import VS Code's server module
  const modPath = path.join(vsRootPath, "out/server-main.js")
  const mod = await eval(`import("${modPath}")`)

  // Call VS Code's createServer()
  return mod.loadCodeWithNls().then((m) => m.createServer(null, { ...args, "without-connection-token": true }))
}
```

**Global Cache:**

```typescript
let vscodeServerPromise: Promise<IVSCodeServerAPI> | undefined
let vscodeServer: IVSCodeServerAPI | undefined

// Lazy-loaded on first access, cached for life of server
```

### 8.2 VS Code API Interface

```typescript
interface IVSCodeServerAPI {
  handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void>
  handleUpgrade(req: IncomingMessage, socket: Socket): void
  handleServerError(err: Error): void
  dispose(): void
}
```

**Routing:**

- HTTP requests → `vscodeServer.handleRequest()`
- WebSocket upgrades → `vscodeServer.handleUpgrade()`
- Shutdown → `vscodeServer.dispose()`

### 8.3 Current Limitations

❌ **One VS Code instance per server**

- Cannot run multiple workspaces in parallel
- Session manager routes to multiple _sockets_ not processes
- All workspace processing serialized

---

## 9. ARCHITECTURE CONSTRAINTS FOR MULTI-USER DESIGN

### 9.1 Single-Instance Bottlenecks

1. **One HTTP Server**
   - Single `app.listen(port)`
   - Cannot scale horizontally without reverse proxy + session affinity
   - No load balancing within process

2. **One VS Code Module**
   - Loaded once globally
   - Shared state between all requests
   - Not thread-safe (Node.js is single-threaded, but)

3. **Single Password**
   - No user identification
   - No per-user audit trail
   - No per-user quotas/limits

4. **Shared File System**
   - All users access same `--user-data-dir`
   - All users access same `--extensions-dir`
   - No file-level isolation

5. **Cookie-Based Sessions**
   - No token format = no metadata
   - No session store (stateless)
   - Difficult to revoke sessions

### 9.2 Structural Changes Needed for Multi-User

**To support multiple users:**

1. **Authentication Layer**
   - Replace single password with user database
   - Implement token-based auth (JWT/session tokens)
   - Add per-user credentials

2. **Session Management**
   - Create session store (Redis/database)
   - Track active sessions per user
   - Implement session expiration & revocation

3. **File Isolation**
   - Create per-user data directories
   - Implement file ACLs
   - Sandboxed file access

4. **State Persistence**
   - Move from file-based to database-backed state
   - Store user preferences per-user
   - Track per-user activity logs

5. **Process Management**
   - Consider separate workspace processes per user
   - Or: implement request queue with rate limiting
   - Add resource quotas per user

6. **Authorization**
   - Implement role-based access control (RBAC)
   - Add resource-level permissions
   - Support org/team hierarchies

---

## 10. DETAILED COMPONENT BREAKDOWN

### 10.1 HTTP Server Setup

**File: `/src/node/app.ts`**

```typescript
createApp(args): Promise<App> {
  const router = express()
  router.use(compression())

  // Create HTTP or HTTPS server
  const server = args.cert
    ? httpolyglot.createServer({ cert, key }, router)
    : http.createServer(router)

  // Listen on port or Unix socket
  await listen(server, args)

  // Create WebSocket router
  const wsRouter = express()
  handleUpgrade(wsRouter, server)

  // Create separate session manager server
  const editorSessionManager = new EditorSessionManager()
  const editorSessionManagerServer =
    await makeEditorSessionManagerServer(args["session-socket"], editorSessionManager)

  return { router, wsRouter, server, editorSessionManagerServer, dispose }
}
```

### 10.2 Route Registration

**File: `/src/node/routes/index.ts`**

```
/ or /vscode
├─ GET  /                     - Load IDE or redirect
├─ GET  /manifest.json        - PWA manifest
├─ POST /mint-key             - WebSocket security key
├─ *    .*                    - Delegate to vscodeServer.handleRequest()
└─ ws   /.*                   - WebSocket upgrade → vscodeServer.handleUpgrade()

/login
└─ GET|POST / - Login form & auth

/logout
└─ GET / - Clear session cookie

/healthz
└─ GET / - Health check

/proxy/:port
└─ * - Path proxy to running services

/absproxy/:port
└─ * - Absolute path proxy

/update
└─ * - Update check endpoint
```

### 10.3 Middleware Chain

```
Request → compression()
  → cookieParser()
  → common middleware (inject req.args, req.heart, req.settings)
  → authentication (if needed)
  → specific route handler
  → error handler
```

### 10.4 Heartbeat System

**File: `/src/node/heart.ts`**

```typescript
class Heart {
  public async beat(): Promise<void>
  // Call on every request (except /healthz)
  // Check if any active connections exist
  // Update heartbeat file
  // Emit state change if idle

  onChange(listener: (state) => void)
  // Listen for state changes: "alive" | "expired" | "unknown"

  // Used for idle-timeout: if no connections for 60s + idle-timeout-seconds
  // → trigger wrapper.exit()
}
```

---

## 11. COMMUNICATION FLOW EXAMPLES

### 11.1 User Loads IDE (HTTP Flow)

```
Browser GET /
  ↓ (redirect if auth required)
Browser POST /login { password }
  ↓ (validate password)
  ↓ Set-Cookie: coder.sid=<hashedPassword>
  ↓ Redirect to /
Browser GET / (with cookie)
  ↓ authenticated() middleware
  ↓ ensureVSCodeLoaded() - load module (once)
  ↓ render HTML with VS Code client code
Browser loads /_static/src/browser/* (JS, CSS)
  ↓ Client-side JS bundles
  ↓ Establishes WebSocket to /
```

### 11.2 IDE Operation (WebSocket Flow)

```
Browser upgrades to WebSocket at /
  ↓ handleUpgrade() in wsRouter
  ↓ ensureAuthenticated()
  ↓ ensureVSCodeLoaded()
  ↓ vscodeServer.handleUpgrade()
  ↓ VS Code handles:
    - File operations
    - Terminal I/O
    - Extension communication
  ↓ Responses sent back via same WebSocket
```

### 11.3 Multiple Workspaces (EditorSession Flow)

```
EditorSessionManagerClient.getConnectedSocketPath(filePath)
  ↓ POST /session?filePath=...
  ↓ EditorSessionManager.getCandidatesForFile()
  ↓ Try connecting to each candidate socket
  ↓ Return first connected socket path

// Allows same user to:
// - Have IDE window 1 → workspace A
// - Have IDE window 2 → workspace B
// - File operations route to correct instance
```

---

## 12. DESIGN RECOMMENDATIONS FOR MULTI-USER SESSION MANAGEMENT

### 12.1 Minimum Viable Multi-User Architecture

**Layer 1: User Authentication**

```typescript
interface User {
  id: string
  username: string
  email: string
  passwordHash: string // Argon2
  createdAt: Date
  lastLogin: Date
}

// Store in: SQLite / PostgreSQL / etc.
```

**Layer 2: Session Management**

```typescript
interface Session {
  id: string (token)
  userId: string
  createdAt: Date
  expiresAt: Date
  ipAddress: string
  userAgent: string
}

// Store in: Redis / database with TTL
```

**Layer 3: Request Context**

```typescript
// In Express middleware:
interface AuthenticatedRequest extends Request {
  user: User
  session: Session
  permissions: string[] // ["read", "write", "admin"]
}
```

**Layer 4: File Isolation**

```
--user-data-dir/
├── users/
│   ├── user1/
│   │   ├── settings.json
│   │   ├── extensions/
│   │   └── workspaces/
│   └── user2/
│       └── [similar structure]
```

### 12.2 Session Affinity for Horizontal Scaling

```
Load Balancer (sticky sessions by user ID)
  ├─ Instance 1: user1, user3
  ├─ Instance 2: user2, user5
  └─ Instance 3: user4

// Each user's requests always route to same instance
// Maintains in-memory state per user
```

### 12.3 Shared State for Distributed Scenarios

```
Redis (distributed session store)
├─ sessions:*  (Session data, TTL-based)
├─ users:*     (User info cache)
├─ workspaces:*  (Workspace assignments)
└─ locks:*     (Distributed locks for file ops)
```

### 12.4 Per-User Resource Limits

```typescript
interface UserQuota {
  maxSessions: number
  maxExtensions: number
  maxStorageMB: number
  maxConcurrentConnections: number
}

// Enforce in middleware:
if (userSessions.length >= quota.maxSessions) {
  throw new HttpError(429, "Session limit reached")
}
```

---

## 13. KEY FILES REFERENCE

| File                        | Purpose                    | LOC  |
| --------------------------- | -------------------------- | ---- |
| `src/node/entry.ts`         | Process entry point        | 67   |
| `src/node/main.ts`          | Server startup             | 245  |
| `src/node/app.ts`           | Express app setup          | 135  |
| `src/node/wrapper.ts`       | Parent-child process model | 398  |
| `src/node/cli.ts`           | CLI argument parsing       | 600+ |
| `src/node/http.ts`          | Auth middleware            | 420  |
| `src/node/wsRouter.ts`      | WebSocket routing          | 69   |
| `src/node/socket.ts`        | TLS socket proxy           | 107  |
| `src/node/vscodeSocket.ts`  | Session manager            | 206  |
| `src/node/heart.ts`         | Heartbeat/idle detection   | 82   |
| `src/node/settings.ts`      | Settings persistence       | 57   |
| `src/node/routes/index.ts`  | Route registration         | 186  |
| `src/node/routes/vscode.ts` | VS Code integration        | 260  |
| `src/node/routes/login.ts`  | Auth routes                | 124  |

**Total Backend LOC:** ~4,360 TypeScript lines

---

## 14. DEPLOYMENT TOPOLOGY OPTIONS

### 14.1 Current (Single Instance)

```
Browser → code-server:3000 → /ide
```

### 14.2 Reverse Proxy Multi-Instance (Session Affinity)

```
Browser → nginx (sticky sessions) →
  ├─ code-server:3001 (user1, user3)
  ├─ code-server:3002 (user2)
  └─ code-server:3003 (user4, user5)
```

### 14.3 Distributed (Shared Session Store)

```
Browser → load-balancer (any backend) →
  ├─ code-server:3001 ↘
  ├─ code-server:3002 → Redis (shared sessions)
  └─ code-server:3003 ↙
```

### 14.4 Kubernetes (Stateless)

```
Ingress → Service →
  ├─ Pod (code-server)
  ├─ Pod (code-server)
  └─ Pod (code-server)

Shared: ConfigMap (users), Secret (passwords), PVC (files)
```

---

## 15. CONCLUSION & RECOMMENDATIONS

### Key Takeaways

1. **Current State:** Single-user, single-instance architecture with no built-in multi-user support
2. **Scaling Limitation:** Cannot serve multiple users simultaneously (would require horizontal scaling + session affinity)
3. **Session Support:** Has workspace-session management, but not user-session management
4. **Process Model:** Parent-child for hot reload, not for multi-user

### For Multi-User Implementation

**Priority 1 (Authentication):**

- Replace single password with user database
- Implement token-based sessions (JWT or session store)
- Add per-user credentials

**Priority 2 (State):**

- Store sessions in Redis/database (not in-memory)
- Create per-user data directories
- Implement user-specific settings

**Priority 3 (Authorization):**

- Add role-based access control
- Implement resource-level permissions
- Add audit logging

**Priority 4 (Scalability):**

- Design for session affinity (load balancer sticky sessions)
- Or implement shared session store for stateless deployment
- Consider per-user process pools for heavy workloads

### Effort Estimate

- **Authentication redesign:** 2-3 days
- **Session management:** 2 days
- **File isolation & per-user setup:** 2-3 days
- **Authorization & RBAC:** 1-2 days
- **Testing & hardening:** 2-3 days

**Total:** ~10-14 days for production-ready multi-user system
