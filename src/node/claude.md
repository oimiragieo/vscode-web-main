# src/node/ - Backend Server Implementation

## Overview

This directory contains the core backend/server-side implementation of the VSCode Web IDE. It handles HTTP/WebSocket communication, authentication, VS Code integration, session management, and all server-side operations.

## Directory Structure

```
src/node/
├── routes/              # HTTP route handlers (see routes/claude.md)
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
  process.on('SIGTERM', async () => {
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

  if (args['install-extension']) {
    for (const ext of args['install-extension']) {
      await vscode.installExtension(ext)
      logger.info(`Installed ${ext}`)
    }
  }

  if (args['uninstall-extension']) {
    for (const ext of args['uninstall-extension']) {
      await vscode.uninstallExtension(ext)
      logger.info(`Uninstalled ${ext}`)
    }
  }

  if (args['list-extensions']) {
    const extensions = await vscode.listExtensions()
    extensions.forEach(ext => console.log(ext.id))
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
  router: express.Express         // HTTP router
  wsRouter: WsRouter              // WebSocket router
  listen(): Promise<Server>       // Start server
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
  const server = args.cert
    ? https.createServer(tlsOptions, app)
    : http.createServer(app)

  // 5. WebSocket upgrade handler
  server.on('upgrade', (req, socket, head) => {
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
  res.redirect('/login')
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
app.get('/api/data', ensureAuthenticated, async (req, res) => {
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
redirect(req, '/login?to=/workspace')
```

---

#### `replaceTemplates(content: string, variables: Record<string, any>): string`
Replaces `{{VARIABLE}}` placeholders in HTML templates.

**Variables:**
```typescript
replaceTemplates(html, {
  BASE: '/base',
  CS_STATIC_BASE: '/_static',
  ERROR: 'Invalid credentials',
  I18N_LOGIN: 'Sign In',
  OPTIONS: JSON.stringify({ theme: 'dark' })
})
```

**Pattern:** `{{VARIABLE_NAME}}`

**Usage:**
```html
<h1>{{I18N_TITLE}}</h1>
<p class="error">{{ERROR}}</p>
<script>const config = {{OPTIONS}};</script>
```

---

#### `relativeRoot(req: express.Request): string`
Calculates relative path to root based on request path.

**Examples:**
```typescript
relativeRoot('/foo/bar')      // '../..'
relativeRoot('/api')          // '..'
relativeRoot('/')             // '.'
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
wsRouter.ws('/api/chat/:roomId', async (req: WsRequest) => {
  const { roomId } = req.params

  wss.handleUpgrade(req, req.ws, req.head, (ws) => {
    ws.send(`Welcome to room ${roomId}`)
    req.ws.resume()
  })
})

// Nested routers
const apiRouter = new WsRouter()
apiRouter.ws('/chat', handler)
wsRouter.use('/api', apiRouter)

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
manager.addSession('/home/user/project', '/tmp/vscode-socket-123')

// Get socket for workspace
const socketPath = manager.getSocketPath('/home/user/project')

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
const existing = await client.getSession('/home/user/project')
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
import { proxy, wsProxy } from './src/node/proxy'

// HTTP proxy
app.all('/proxy/:port/*', proxy)

// WebSocket proxy
wsRouter.ws('/proxy/:port/*', wsProxy)
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
const targetPath = req.url.replace(/^\/proxy\/\d+/, '')

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
const provider = new SocketProxyProvider('/tmp/vscode-socket')

server.on('connection', (socket) => {
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
const heart = new Heart('/tmp/code-server-heartbeat', 30000)

// Every request
app.use((req, res, next) => {
  heart.beat()
  next()
})

// Monitor connections
server.on('connection', () => heart.addConnection())
server.on('close', () => heart.removeConnection())

// Handle idle timeout
heart.onStateChange((state) => {
  if (state === State.Expired && heart.connectionCount === 0) {
    logger.info('Idle timeout reached, shutting down')
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
const updater = new UpdateProvider('4.10.0', 'coder/code-server')

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

const settings = new SettingsProvider<AppSettings>('/config/settings.json')

// Read settings
const data = await settings.read()
console.log(data.lastUpdateCheck)

// Write settings (merges)
await settings.write({
  lastUpdateCheck: Date.now()
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
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully')

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
process.send({ type: 'ready', pid: process.pid })

// Parent acknowledges
parentProcess.on('message', (msg) => {
  if (msg.type === 'ack') {
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
export const DEFAULT_HOST = '127.0.0.1'
export const SESSION_COOKIE_NAME = 'code-server-session'
export const CSRF_COOKIE_NAME = 'code-server-csrf'
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
  'bind-addr'?: string
  port?: number
  host?: string
  socket?: string

  // Authentication
  auth?: 'password' | 'none'
  password?: string
  'hashed-password'?: string

  // HTTPS
  cert?: string
  'cert-key'?: string

  // Paths
  'user-data-dir'?: string
  'extensions-dir'?: string

  // Features
  'disable-telemetry'?: boolean
  'disable-update-check'?: boolean

  // VS Code args
  _: string[]  // Positional args passed to VS Code
}
```

**Parsing:**
```typescript
import { parse } from './src/node/cli'

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
const sessionManager = context.services.get('sessionManager')
const sessions = sessionManager.getAllSessions()
```

---

## Best Practices

### Error Handling
```typescript
app.get('/api/data', async (req, res, next) => {
  try {
    const data = await fetchData()
    res.json(data)
  } catch (error) {
    next(error)  // Pass to error handler
  }
})
```

### Authentication
```typescript
app.get('/api/secure', ensureAuthenticated, async (req, res) => {
  // User is authenticated
})
```

### Logging
```typescript
logger.info('Server started', { port, host })
logger.error('Failed to connect', { error: error.message })
```

---

## Related Files

- **Routes:** `src/node/routes/` (see routes/claude.md)
- **Core Systems:** `src/core/` (see core/claude.md)
- **Common Utilities:** `src/common/` (see common/claude.md)

---

## Future Enhancements

- [ ] Cluster mode support
- [ ] Redis session storage
- [ ] Advanced load balancing
- [ ] Metrics collection
- [ ] Distributed tracing
- [ ] gRPC support
- [ ] GraphQL API
- [ ] Advanced caching
