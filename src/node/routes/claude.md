# src/node/routes/ - HTTP Route Handlers

## Overview

This directory contains all HTTP and WebSocket route handlers for the application. Each file typically handles a specific feature or endpoint group (login, health checks, proxying, VS Code integration, etc.).

## Directory Structure

```
src/node/routes/
├── index.ts          # Central route registration
├── vscode.ts         # VS Code IDE integration
├── login.ts          # Authentication handlers
├── logout.ts         # Session termination
├── health.ts         # Health check endpoints
├── update.ts         # Update notification
├── pathProxy.ts      # Port forwarding (relative paths)
├── domainProxy.ts    # Domain-based proxying
└── errors.ts         # Error handling middleware
```

---

## Files

### index.ts

**Purpose:** Central route registration and middleware setup

**Location:** `src/node/routes/index.ts:1`

**Exports:** `register(app: App, args: DefaultedArgs): Promise<void>`

**Responsibilities:**

1. Register common middleware
2. Set up static file serving
3. Register all route handlers
4. Configure error handling

**Middleware Stack:**

```typescript
export const register = async (app: App, args: DefaultedArgs) => {
  // 1. Common middleware (runs on all requests)
  const common: express.RequestHandler = (req, _, next) => {
    heart.beat() // Update activity heartbeat
    req.args = args // Inject CLI args
    req.heart = heart // Inject heartbeat tracker
    req.settings = settings // Inject settings provider
    req.updater = updater // Inject update checker
    next()
  }

  app.router.use(common)
  app.wsRouter.use(common)

  // 2. Cookie parser
  app.router.use(cookieParser())

  // 3. Static assets
  app.router.use(
    "/_static",
    express.static(rootPath, {
      cacheControl: commit !== "development",
      maxAge: commit !== "development" ? "1y" : 0,
    }),
  )

  // 4. Health checks
  app.router.use("/healthz", health.router)
  app.wsRouter.use("/healthz", health.wsRouter.router)

  // 5. Authentication routes
  if (args.auth === AuthType.Password) {
    app.router.use("/login", login.router)
    app.router.use("/logout", logout.router)
  }

  // 6. Update notifications
  app.router.use("/update", update.router)

  // 7. Proxy routes
  app.router.all("/proxy/:port/*", pathProxy.proxy)
  app.wsRouter.ws("/proxy/:port/*", pathProxy.wsProxy)

  // 8. VS Code routes (main IDE)
  app.router.use("/", vscode.router)
  app.wsRouter.use("/", vscode.wsRouter.router)

  // 9. Error handling (must be last)
  app.router.use(errorHandler)
  app.wsRouter.use(wsErrorHandler)
}
```

**Execution Order:**

1. Common middleware
2. Cookie parsing
3. Static files
4. Feature routes (health, login, update, proxy)
5. VS Code (catch-all)
6. Error handlers

**Extension Point:** Add custom routes before VS Code catch-all

---

### vscode.ts

**Purpose:** VS Code IDE integration and serving

**Location:** `src/node/routes/vscode.ts:1`

**Key Features:**

- Lazy-loads VS Code server module
- Handles workspace/folder opening
- Generates PWA manifest
- Serves favicons
- Tracks last opened workspace

**Routes:**

#### `GET /manifest.json`

Generates Progressive Web App manifest.

**Response:**

```json
{
  "name": "code-server",
  "short_name": "code-server",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#1e1e1e",
  "theme_color": "#007acc",
  "icons": [
    {
      "src": "/_static/src/browser/media/pwa-icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/_static/src/browser/media/pwa-icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

**Use Case:** Enables "Add to Home Screen" on mobile devices

---

#### `GET /favicon.ico`

Serves favicon (legacy ICO format).

---

#### `GET /favicon.svg`

Serves modern SVG favicon.

---

#### `GET /favicon-dark-support.svg`

Serves dark mode-aware SVG favicon.

---

#### `GET /` and `GET /vscode/*`

Main VS Code IDE interface.

**Flow:**

```typescript
async function handleVSCodeRequest(req, res) {
  // 1. Check authentication
  if (!(await authenticated(req))) {
    return redirect(req, res, "/login")
  }

  // 2. Lazy-load VS Code
  const vscode = await ensureVSCodeLoaded(req)

  // 3. Track last opened workspace
  if (req.query.workspace || req.query.folder) {
    await trackLastOpened(req.query)
  }

  // 4. Delegate to VS Code server
  await vscode.handleRequest(req, res)
}
```

**VS Code Loading:**

```typescript
async function loadVSCode(req: express.Request): Promise<IVSCodeServerAPI> {
  // Dynamic import of VS Code's server-main.js
  const modPath = path.join(vsRootPath, "out/server-main.js")
  const mod = await eval(`import("${modPath}")`)
  const serverModule = await mod.loadCodeWithNls()

  return serverModule.createServer(null, {
    ...(await toCodeArgs(req.args)),
    "accept-server-license-terms": true,
    "without-connection-token": true,
  })
}
```

**VS Code Server API:**

```typescript
interface IVSCodeServerAPI {
  handleRequest(req: express.Request, res: express.Response): Promise<void>
  handleUpgrade(req: express.Request, socket: net.Socket): void
  handleServerError(err: Error): void
  dispose(): void
}
```

**WebSocket Handler:**

```typescript
wsRouter.ws("/", async (req: WebsocketRequest) => {
  const vscode = await ensureVSCodeLoaded(req)
  vscode.handleUpgrade(req, req.ws)
  req.ws.resume()
})
```

**Extension Point:** Intercept VS Code requests for custom IDE modifications

---

### login.ts

**Purpose:** Authentication and login page

**Location:** `src/node/routes/login.ts:1`

**Features:**

- Login page rendering
- Password validation
- Session cookie creation
- Rate limiting
- I18n support
- Failed login tracking

**Routes:**

#### `GET /login`

Serves login page with i18n support.

**Template Variables:**

```typescript
{
  BASE: relativeRoot(req),
  CS_STATIC_BASE: '/_static',
  I18N_TITLE: 'Sign In - code-server',
  I18N_USERNAME: 'Username',
  I18N_PASSWORD: 'Password',
  I18N_LOGIN: 'Sign In',
  I18N_ERROR: 'Error',
  ERROR: req.query.error || ''
}
```

**Query Parameters:**

- `error` - Error message to display
- `to` - Redirect target after successful login

**Pages:**

- Modern design: `src/browser/pages/modern-login.html`
- Legacy design: `src/browser/pages/login.html`

---

#### `POST /login`

Handles login form submission.

**Request Body:**

```typescript
{
  password: string
  _csrf?: string
}
```

**Flow:**

```typescript
async function handleLogin(req, res) {
  // 1. Rate limiting (2/min, 12/hour)
  if (!rateLimit.check(req.ip)) {
    return res.redirect("/login?error=Too+many+attempts")
  }

  // 2. CSRF validation
  if (!csrf.validateToken(req.body._csrf)) {
    return res.redirect("/login?error=Invalid+token")
  }

  // 3. Password validation
  const isValid = await validatePassword(req.body.password, req.args)

  if (!isValid) {
    failedLogins.track(req.ip)
    return res.redirect("/login?error=Invalid+password")
  }

  // 4. Create session
  const sessionToken = generateSessionToken()
  res.cookie(CookieKeys.Session, sessionToken, {
    httpOnly: true,
    secure: req.secure,
    sameSite: "lax",
    maxAge: 86400000, // 24 hours
  })

  // 5. Redirect to target
  const to = req.query.to || "/"
  res.redirect(to)
}
```

**Password Validation:**

```typescript
async function validatePassword(password: string, args: DefaultedArgs): Promise<boolean> {
  // Argon2 hashing (modern)
  if (args["hashed-password"]) {
    return await argon2.verify(args["hashed-password"], password)
  }

  // SHA256 (legacy)
  if (args.password?.startsWith("sha256:")) {
    const hash = crypto.createHash("sha256").update(password).digest("hex")
    return args.password === `sha256:${hash}`
  }

  // Plaintext (development only)
  return password === args.password
}
```

**Rate Limiting:**

```typescript
const loginRateLimiter = new RateLimiter({
  maxRequests: 2,
  windowMs: 60000, // 2 attempts per minute
})

const globalRateLimiter = new RateLimiter({
  maxRequests: 12,
  windowMs: 3600000, // 12 attempts per hour
})
```

**Extension Point:** Add OAuth, SAML, or other authentication methods

---

### logout.ts

**Purpose:** Session termination

**Location:** `src/node/routes/logout.ts:1`

**Routes:**

#### `GET /logout` and `POST /logout`

Terminates user session.

**Flow:**

```typescript
function handleLogout(req, res) {
  // 1. Clear session cookie
  res.clearCookie(CookieKeys.Session)

  // 2. Clear CSRF token
  res.clearCookie(CookieKeys.CSRF)

  // 3. Redirect to login
  res.redirect("/login")
}
```

**Features:**

- Supports GET and POST methods
- Clears all authentication cookies
- Redirects to login page

**Extension Point:** Add logout hooks for custom session cleanup

---

### health.ts

**Purpose:** Health check and readiness endpoints

**Location:** `src/node/routes/health.ts:1`

**Routes:**

#### `GET /healthz`

Basic health check.

**Response:**

```json
{
  "status": "ok",
  "timestamp": 1620000000000
}
```

**HTTP Status:** Always 200 OK (unless server is down)

**Use Case:** Load balancer health checks, monitoring systems

---

#### `GET /healthz/ready`

Readiness check (more comprehensive).

**Response:**

```json
{
  "status": "ready",
  "checks": {
    "vscode": "ok",
    "plugins": "ok",
    "database": "ok"
  }
}
```

**Checks:**

- VS Code server loaded
- Plugin health status
- External service connections

**HTTP Status:**

- 200 OK if ready
- 503 Service Unavailable if not ready

---

#### `WS /healthz`

WebSocket health check.

**Flow:**

```typescript
wsRouter.ws("/healthz", async (req: WebsocketRequest) => {
  wss.handleUpgrade(req, req.ws, req.head, (ws) => {
    ws.send(JSON.stringify({ status: "ok" }))
    ws.close()
    req.ws.resume()
  })
})
```

**Use Case:** Verify WebSocket connectivity

---

### update.ts

**Purpose:** Update notification endpoint

**Location:** `src/node/routes/update.ts:1`

**Routes:**

#### `GET /update`

Checks for available updates.

**Response (update available):**

```json
{
  "isLatest": false,
  "latest": {
    "version": "4.11.0",
    "url": "https://github.com/coder/code-server/releases/tag/v4.11.0",
    "notes": "Release notes..."
  },
  "current": "4.10.0"
}
```

**Response (up to date):**

```json
{
  "isLatest": true,
  "current": "4.10.0"
}
```

**Caching:**

- Checks GitHub at most once per 24 hours
- Cached in settings file
- Bypassed if `?force=true` query parameter

**Features:**

- Semantic version comparison
- GitHub API integration
- Proxy support
- Settings persistence

**Extension Point:** Add custom update sources or notification channels

---

### pathProxy.ts

**Purpose:** Port forwarding with relative paths

**Location:** `src/node/routes/pathProxy.ts:1`

**Routes:**

#### `ALL /proxy/:port/*`

Proxies HTTP requests to local port.

**Example:**

```
Client: GET /proxy/3000/api/data
  ↓
Proxy: GET http://localhost:3000/api/data
  ↓
Local Server: Returns response
```

**Features:**

- Supports all HTTP methods
- WebSocket proxying
- Error handling
- Base path rewriting

**Path Rewriting:**

```typescript
// Remove /proxy/:port prefix
const targetPath = req.url.replace(/^\/proxy\/\d+/, "")

// Forward to localhost
const targetUrl = `http://localhost:${port}${targetPath}`
```

**Error Handling:**

```typescript
proxy.on("error", (err, req, res) => {
  if (err.code === "ECONNREFUSED") {
    res.status(502).json({
      error: "Service unavailable",
      port: port,
    })
  } else {
    res.status(500).json({ error: err.message })
  }
})
```

---

#### `WS /proxy/:port/*`

Proxies WebSocket connections to local port.

**Example:**

```
Client: WS /proxy/3000/ws
  ↓
Proxy: WS http://localhost:3000/ws
```

**Implementation:**

```typescript
wsRouter.ws("/proxy/:port/*", async (req: WebsocketRequest) => {
  const { port } = req.params
  const target = `ws://localhost:${port}${req.path}`

  const client = new WebSocket(target)

  wss.handleUpgrade(req, req.ws, req.head, (ws) => {
    // Bidirectional piping
    ws.on("message", (data) => client.send(data))
    client.on("message", (data) => ws.send(data))

    ws.on("close", () => client.close())
    client.on("close", () => ws.close())

    req.ws.resume()
  })
})
```

**Use Case:** VS Code's port forwarding feature

---

### domainProxy.ts

**Purpose:** Domain-based proxying for multi-tenant setups

**Location:** `src/node/routes/domainProxy.ts:1`

**Use Case:** Route requests based on subdomain

**Example:**

```
user1.code-server.com → workspace1
user2.code-server.com → workspace2
```

**Features:**

- Subdomain extraction
- Workspace mapping
- Custom routing logic
- Multi-tenant support

**Implementation:**

```typescript
app.use(async (req, res, next) => {
  const subdomain = extractSubdomain(req.hostname)

  if (subdomain) {
    const workspace = await getWorkspaceForSubdomain(subdomain)
    req.workspace = workspace
  }

  next()
})
```

**Extension Point:** Multi-tenant IDE deployments

---

### errors.ts

**Purpose:** Error handling middleware

**Location:** `src/node/routes/errors.ts:1`

**Error Handler:**

```typescript
export const errorHandler: express.ErrorRequestHandler = (err, req, res, next) => {
  // 1. Log error
  logError(logger, err)

  // 2. Handle HttpError
  if (err instanceof HttpError) {
    return res.status(err.statusCode).json({
      error: err.message,
      details: err.details,
    })
  }

  // 3. Handle validation errors
  if (err.name === "ValidationError") {
    return res.status(400).json({
      error: "Validation failed",
      details: err.details,
    })
  }

  // 4. Handle authentication errors
  if (err.message.includes("Unauthorized")) {
    return res.status(401).json({
      error: "Unauthorized",
    })
  }

  // 5. Default error response
  res.status(500).json({
    error: "Internal server error",
  })
}
```

**WebSocket Error Handler:**

```typescript
export const wsErrorHandler = (err, req: WebsocketRequest, next) => {
  logError(logger, err)

  if (req.ws) {
    req.ws.close(1011, err.message) // Internal error code
  }
}
```

**Error Page Rendering:**

```typescript
function renderErrorPage(res, statusCode, message) {
  const html = fs.readFileSync("src/browser/pages/error.html", "utf-8")

  const rendered = replaceTemplates(html, {
    ERROR_CODE: statusCode,
    ERROR_MESSAGE: message,
    BASE: "/",
    CS_STATIC_BASE: "/_static",
  })

  res.status(statusCode).send(rendered)
}
```

---

## Extension Integration Patterns

### Adding Custom Routes

**Before VS Code (specific routes):**

```typescript
// In routes/index.ts
app.router.use("/api/custom", customRouter) // Add before vscode.router
```

**Route Module Structure:**

```typescript
// routes/custom.ts
import express from "express"

export const router = express.Router()

router.get("/data", async (req, res) => {
  res.json({ message: "Custom route" })
})

router.post("/action", ensureAuthenticated, async (req, res) => {
  // Handle action
  res.json({ success: true })
})
```

---

### Custom Authentication

**Replace login handler:**

```typescript
// routes/oauth-login.ts
export const router = express.Router()

router.get("/oauth/callback", async (req, res) => {
  const { code } = req.query

  // Exchange code for token
  const token = await oauthProvider.exchangeCode(code)

  // Validate token
  const user = await oauthProvider.validateToken(token)

  // Create session
  req.session.user = user

  res.redirect("/")
})
```

---

### Proxy Customization

**Custom proxy logic:**

```typescript
router.all("/proxy/:service/*", async (req, res) => {
  const { service } = req.params

  // Map service to URL
  const serviceUrl = await getServiceUrl(service)

  // Forward request
  const response = await fetch(serviceUrl + req.path, {
    method: req.method,
    headers: req.headers,
    body: req.body,
  })

  res.status(response.status).send(await response.text())
})
```

---

## Best Practices

### Route Organization

1. **Group related routes** in same file
2. **Export router** from each module
3. **Use middleware** for common logic
4. **Register in index.ts** in correct order

### Error Handling

1. **Always use try-catch** in async routes
2. **Pass errors to next()** for centralized handling
3. **Use HttpError** for expected errors
4. **Log all errors** for debugging

### Security

1. **Validate input** on all POST/PUT routes
2. **Sanitize output** before rendering HTML
3. **Use CSRF protection** on state-changing operations
4. **Apply rate limiting** on authentication endpoints
5. **Require authentication** for sensitive routes

### Performance

1. **Cache static responses** when appropriate
2. **Use streaming** for large responses
3. **Implement timeouts** on external requests
4. **Monitor slow routes** and optimize

---

## Testing Routes

### Unit Tests

```typescript
describe("Login Route", () => {
  it("should render login page", async () => {
    const response = await request(app).get("/login")
    expect(response.status).toBe(200)
    expect(response.text).toContain("Sign In")
  })

  it("should validate password", async () => {
    const response = await request(app).post("/login").send({ password: "wrong" })

    expect(response.status).toBe(302)
    expect(response.header.location).toContain("error=")
  })
})
```

### Integration Tests

```typescript
describe("VS Code Route", () => {
  it("should require authentication", async () => {
    const response = await request(app).get("/")
    expect(response.status).toBe(302)
    expect(response.header.location).toBe("/login")
  })

  it("should serve IDE when authenticated", async () => {
    const response = await request(app).get("/").set("Cookie", validSessionCookie)

    expect(response.status).toBe(200)
    expect(response.text).toContain("vscode")
  })
})
```

---

## Related Files

- **Route Registration:** `src/node/routes/index.ts`
- **Middleware:** `src/node/http.ts`
- **Templates:** `src/browser/pages/`
- **Core Systems:** `src/core/`

---

## Future Enhancements

- [ ] GraphQL API endpoint
- [ ] Server-Sent Events (SSE) support
- [ ] Advanced caching with Redis
- [ ] API versioning
- [ ] OpenAPI/Swagger documentation
- [ ] Rate limiting per user
- [ ] Advanced analytics endpoints
- [ ] Admin dashboard routes
