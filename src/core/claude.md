# src/core/ - Plugin System, Security & Configuration

## Overview

This directory contains the core infrastructure for extending the IDE through plugins, securing the application, and managing configuration. These are foundational systems that other parts of the application depend on.

## Directory Structure

```
src/core/
├── plugin.ts      # Plugin system architecture
├── security.ts    # Security utilities (CSRF, validation, headers)
└── config.ts      # Configuration management
```

---

## Files

### plugin.ts

**Purpose:** Modern plugin architecture for extending server capabilities

**Location:** `src/core/plugin.ts`

#### Core Interfaces

##### `PluginMetadata`

Describes plugin information and dependencies.

```typescript
interface PluginMetadata {
  name: string // Unique plugin identifier
  version: string // Semantic version (e.g., "1.0.0")
  description?: string // Human-readable description
  author?: string // Plugin author
  dependencies?: string[] // Other plugins this depends on
}
```

**Usage:**

```typescript
metadata: PluginMetadata = {
  name: "database-viewer",
  version: "1.0.0",
  description: "PostgreSQL database viewer",
  author: "Your Name",
  dependencies: ["authentication"],
}
```

---

##### `PluginContext`

Dependency injection container passed to plugins during initialization.

```typescript
interface PluginContext {
  app: Express // Main HTTP router
  wsRouter: Express // WebSocket router
  config: any // Application configuration
  logger: Logger // Logger instance
  events: EventEmitter // Event bus for inter-plugin communication
  services: Map<string, any> // Service registry for sharing functionality
}
```

**Provides Access To:**

- **HTTP Routing:** Register new routes on `app`
- **WebSocket Routing:** Handle WebSocket connections via `wsRouter`
- **Configuration:** Access app settings via `config`
- **Logging:** Use `logger` for consistent logging
- **Events:** Emit and listen to events via `events`
- **Services:** Share services with other plugins via `services` registry

**Usage:**

```typescript
async init(context: PluginContext): Promise<void> {
  const { app, logger, services, events } = context

  // Register route
  app.get('/api/my-plugin', (req, res) => {
    res.json({ status: 'ok' })
  })

  // Register service
  services.set('my-service', new MyService())

  // Listen to events
  events.on('user:login', (user) => {
    logger.info(`User ${user.id} logged in`)
  })
}
```

---

##### `IPlugin`

Base interface all plugins must implement.

```typescript
interface IPlugin {
  metadata: PluginMetadata
  init(context: PluginContext): Promise<void>
  destroy(): Promise<void>
  healthCheck?(): Promise<boolean>
}
```

**Lifecycle Methods:**

1. **`init(context)`** - Called when plugin is registered
   - Perform initialization
   - Register routes
   - Set up services
   - Subscribe to events

2. **`destroy()`** - Called on shutdown or unload
   - Clean up resources
   - Close connections
   - Unsubscribe from events
   - Stop timers/intervals

3. **`healthCheck()`** (Optional) - Called periodically
   - Return `true` if healthy
   - Return `false` if unhealthy
   - Used for monitoring

**Example Implementation:**

```typescript
export class MyPlugin implements IPlugin {
  metadata: PluginMetadata = {
    name: "my-plugin",
    version: "1.0.0",
  }

  private cleanup?: () => void

  async init(context: PluginContext): Promise<void> {
    const { app, events } = context

    app.get("/api/my-plugin", (req, res) => {
      res.json({ message: "Hello from plugin" })
    })

    const listener = events.on("some-event", this.handleEvent)
    this.cleanup = () => listener.dispose()
  }

  async destroy(): Promise<void> {
    this.cleanup?.()
  }

  async healthCheck(): Promise<boolean> {
    return true
  }
}
```

---

#### BasePlugin Class

Abstract base class providing common plugin functionality.

```typescript
abstract class BasePlugin implements IPlugin {
  abstract metadata: PluginMetadata
  abstract init(context: PluginContext): Promise<void>

  async destroy(): Promise<void> {
    // Default: no cleanup needed
  }

  async healthCheck(): Promise<boolean> {
    return true
  }
}
```

**Benefits:**

- Default implementations for optional methods
- Consistent structure
- Easier to extend

**Usage:**

```typescript
export class MyPlugin extends BasePlugin {
  metadata = { name: "my-plugin", version: "1.0.0" }

  async init(context: PluginContext): Promise<void> {
    // Only implement what you need
  }
}
```

---

#### PluginManager

Manages plugin lifecycle, dependencies, and health.

**Methods:**

##### `registerPlugin(plugin: IPlugin): Promise<void>`

Registers and initializes a plugin.

**Features:**

- Validates plugin metadata
- Checks dependencies
- Calls init() method
- Emits 'plugin:registered' event
- Tracks registered plugins

**Usage:**

```typescript
const manager = new PluginManager(context)
await manager.registerPlugin(new MyPlugin())
```

**Errors:**

- Throws if plugin name is duplicate
- Throws if dependencies are missing
- Throws if init() fails

---

##### `unregisterPlugin(name: string): Promise<void>`

Unregisters and destroys a plugin.

**Features:**

- Calls destroy() method
- Removes from registry
- Emits 'plugin:unregistered' event

**Usage:**

```typescript
await manager.unregisterPlugin("my-plugin")
```

---

##### `getPlugin(name: string): IPlugin | undefined`

Retrieves a registered plugin by name.

**Usage:**

```typescript
const plugin = manager.getPlugin("database-viewer")
if (plugin) {
  // Use plugin
}
```

---

##### `getAllPlugins(): IPlugin[]`

Returns array of all registered plugins.

**Usage:**

```typescript
const plugins = manager.getAllPlugins()
console.log(`${plugins.length} plugins loaded`)
```

---

##### `healthCheck(): Promise<Map<string, boolean>>`

Checks health of all plugins.

**Returns:** Map of plugin name → health status

**Usage:**

```typescript
const health = await manager.healthCheck()
for (const [name, isHealthy] of health) {
  console.log(`${name}: ${isHealthy ? "OK" : "UNHEALTHY"}`)
}
```

**Behavior:**

- Calls healthCheck() on each plugin
- Plugins without healthCheck() are considered healthy
- Errors are caught and logged

---

##### `destroyAll(): Promise<void>`

Destroys all registered plugins.

**Usage:**

```typescript
// On server shutdown
await manager.destroyAll()
```

**Behavior:**

- Calls destroy() on each plugin
- Errors are caught and logged
- Clears plugin registry

---

#### Plugin Events

**Emitted Events:**

1. **`plugin:registered`**

   ```typescript
   events.emit("plugin:registered", {
     name: plugin.metadata.name,
     version: plugin.metadata.version,
   })
   ```

2. **`plugin:unregistered`**
   ```typescript
   events.emit("plugin:unregistered", {
     name: pluginName,
   })
   ```

**Listening to Events:**

```typescript
context.events.on("plugin:registered", ({ name, version }) => {
  logger.info(`Plugin loaded: ${name}@${version}`)
})
```

---

### security.ts

**Purpose:** Security utilities for CSRF protection, input validation, and secure headers

**Location:** `src/core/security.ts`

#### CSRFProtection Class

Protects against Cross-Site Request Forgery attacks.

**Features:**

- Cryptographically secure token generation
- One-time use tokens
- 1-hour expiration
- Automatic cleanup of expired tokens

**Methods:**

##### `generateToken(): string`

Generates a new CSRF token.

**Returns:** 32-character hex string

**Usage:**

```typescript
const csrf = new CSRFProtection()
const token = csrf.generateToken()

// Store in session or cookie
req.session.csrfToken = token
```

**Implementation:**

```typescript
generateToken(): string {
  const token = crypto.randomBytes(16).toString('hex')
  this.tokens.set(token, Date.now() + 3600000) // 1 hour
  return token
}
```

---

##### `validateToken(token: string): boolean`

Validates and consumes a CSRF token.

**Returns:** `true` if valid, `false` otherwise

**Behavior:**

- Checks if token exists
- Checks if not expired
- Removes token (one-time use)
- Returns validation result

**Usage:**

```typescript
// In POST/PUT/DELETE handler
const token = req.body._csrf || req.headers["x-csrf-token"]
if (!csrf.validateToken(token)) {
  throw new HttpError("Invalid CSRF token", HttpCode.Forbidden)
}
```

---

##### `cleanup(): void`

Removes expired tokens from memory.

**Automatic Cleanup:**

```typescript
// Called periodically
setInterval(() => csrf.cleanup(), 60000) // Every minute
```

---

##### Middleware Functions

**`generateToken()` Middleware:**

```typescript
app.use(csrf.generateToken())
// Adds req.csrfToken and res.locals.csrfToken
```

**`validateToken()` Middleware:**

```typescript
app.post("/api/data", csrf.validateToken(), (req, res) => {
  // Token already validated
})
```

---

#### Security Headers

##### `securityHeaders(): express.RequestHandler`

Adds comprehensive security headers to responses.

**Headers Set:**

1. **Content-Security-Policy**
   - Prevents XSS attacks
   - Controls resource loading
   - Restricts inline scripts

2. **X-Frame-Options: SAMEORIGIN**
   - Prevents clickjacking
   - Disallows embedding in iframes from other origins

3. **X-Content-Type-Options: nosniff**
   - Prevents MIME type sniffing
   - Enforces declared content types

4. **X-XSS-Protection: 1; mode=block**
   - Enables browser XSS filtering
   - Blocks detected XSS attacks

5. **Referrer-Policy: strict-origin-when-cross-origin**
   - Controls referrer information
   - Protects user privacy

6. **Permissions-Policy**
   - Disables unnecessary browser features
   - Reduces attack surface

**Usage:**

```typescript
import { securityHeaders } from "./src/core/security"

app.use(securityHeaders())
```

**Customization:**

```typescript
app.use((req, res, next) => {
  securityHeaders()(req, res, () => {})
  // Add custom headers
  res.setHeader("Custom-Security-Header", "value")
  next()
})
```

---

##### `hsts(maxAge: number, options?: HSTSOptions): express.RequestHandler`

Adds HTTP Strict Transport Security header.

**Parameters:**

- `maxAge` - Seconds to cache HTTPS requirement
- `options.includeSubDomains` - Apply to subdomains
- `options.preload` - Enable HSTS preloading

**Usage:**

```typescript
import { hsts } from "./src/core/security"

// 1 year HSTS with subdomains
app.use(hsts(31536000, { includeSubDomains: true, preload: true }))
```

**Header Example:**

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

---

#### Input Validation

##### `validateInput(value: any, rules: ValidationRules): ValidationResult`

Validates user input against rules.

**Validation Rules:**

```typescript
interface ValidationRules {
  required?: boolean
  type?: "string" | "number" | "boolean" | "array" | "object"
  minLength?: number
  maxLength?: number
  min?: number
  max?: number
  pattern?: RegExp
  enum?: any[]
  custom?: (value: any) => boolean
  email?: boolean
  url?: boolean
}
```

**Returns:**

```typescript
interface ValidationResult {
  valid: boolean
  error?: string
}
```

**Usage:**

```typescript
const result = validateInput(req.body.email, {
  required: true,
  type: "string",
  email: true,
})

if (!result.valid) {
  return res.status(400).json({ error: result.error })
}
```

**Examples:**

```typescript
// Email validation
validateInput("user@example.com", { email: true })
// { valid: true }

// Length validation
validateInput("short", { minLength: 10 })
// { valid: false, error: 'Must be at least 10 characters' }

// Pattern validation
validateInput("abc123", { pattern: /^[a-z]+$/ })
// { valid: false, error: 'Does not match required pattern' }

// Enum validation
validateInput("admin", { enum: ["user", "admin", "guest"] })
// { valid: true }

// Custom validation
validateInput(42, {
  custom: (v) => v % 2 === 0,
})
// { valid: true }
```

---

##### `sanitizeHTML(input: string): string`

Escapes HTML special characters to prevent XSS.

**Escapes:**

- `<` → `&lt;`
- `>` → `&gt;`
- `&` → `&amp;`
- `"` → `&quot;`
- `'` → `&#x27;`
- `/` → `&#x2F;`

**Usage:**

```typescript
const userInput = '<script>alert("XSS")</script>'
const safe = sanitizeHTML(userInput)
// '&lt;script&gt;alert(&quot;XSS&quot;)&lt;&#x2F;script&gt;'

res.send(`<div>${safe}</div>`)
```

---

##### `sanitizeObject(obj: any): any`

Recursively sanitizes all strings in an object.

**Usage:**

```typescript
const userInput = {
  name: "<script>alert(1)</script>",
  bio: "Hello <b>world</b>",
  nested: {
    field: "<img src=x onerror=alert(1)>",
  },
}

const safe = sanitizeObject(userInput)
// All HTML is escaped
```

---

#### Rate Limiting

##### `RateLimiter` Class

In-memory rate limiter for preventing abuse.

**Features:**

- Token bucket algorithm
- Per-IP or per-user limiting
- Configurable limits and windows
- Automatic cleanup

**Configuration:**

```typescript
interface RateLimitConfig {
  maxRequests: number // Max requests per window
  windowMs: number // Time window in milliseconds
  keyGenerator?: (req) => string // Custom key function
}
```

**Usage:**

```typescript
import { RateLimiter } from "./src/core/security"

const limiter = new RateLimiter({
  maxRequests: 100,
  windowMs: 60000, // 100 requests per minute
})

app.use("/api/", limiter.middleware())
```

**Custom Key Generation:**

```typescript
const limiter = new RateLimiter({
  maxRequests: 10,
  windowMs: 60000,
  keyGenerator: (req) => req.user?.id || req.ip,
})
```

**Response Headers:**

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 85
X-RateLimit-Reset: 1620000000000
```

**When Limit Exceeded:**

```
HTTP/1.1 429 Too Many Requests
Retry-After: 30
{
  "error": "Too many requests, please try again later"
}
```

---

### config.ts

**Purpose:** Type-safe configuration management system

**Location:** `src/core/config.ts`

#### ConfigManager Class

Manages application configuration with validation.

**Features:**

- Type-safe configuration
- Schema validation
- Default values
- Multiple sources (file, env, args)
- Hot reloading support
- Merge strategies

**Configuration Sources (Priority Order):**

1. Command-line arguments (highest)
2. Environment variables
3. Configuration file
4. Default values (lowest)

**Interface:**

```typescript
interface ConfigSchema<T> {
  defaults: T
  validators?: {
    [K in keyof T]?: (value: T[K]) => boolean | string
  }
  required?: Array<keyof T>
}
```

**Usage:**

```typescript
interface AppConfig {
  port: number
  host: string
  logLevel: string
  features: {
    authentication: boolean
    telemetry: boolean
  }
}

const schema: ConfigSchema<AppConfig> = {
  defaults: {
    port: 8080,
    host: "127.0.0.1",
    logLevel: "info",
    features: {
      authentication: true,
      telemetry: false,
    },
  },
  validators: {
    port: (v) => (v > 0 && v < 65536) || "Port must be 1-65535",
    logLevel: (v) => ["debug", "info", "warn", "error"].includes(v),
  },
  required: ["port", "host"],
}

const config = new ConfigManager(schema)
await config.load("/path/to/config.yaml")
```

**Methods:**

##### `load(path: string): Promise<void>`

Loads configuration from file.

**Supported Formats:**

- YAML (.yaml, .yml)
- JSON (.json)

---

##### `get<K extends keyof T>(key: K): T[K]`

Gets configuration value.

```typescript
const port = config.get("port")
const authEnabled = config.get("features").authentication
```

---

##### `set<K extends keyof T>(key: K, value: T[K]): void`

Sets configuration value with validation.

```typescript
config.set("port", 3000)
config.set("logLevel", "debug")
```

---

##### `merge(partial: Partial<T>): void`

Merges partial configuration.

```typescript
config.merge({
  port: 3000,
  features: { telemetry: true },
})
```

---

##### `validate(): boolean`

Validates entire configuration.

```typescript
if (!config.validate()) {
  throw new Error("Invalid configuration")
}
```

---

## Extension Integration Points

### Creating Plugins

**Template:**

```typescript
import { BasePlugin, PluginContext, PluginMetadata } from "./src/core/plugin"

export class MyPlugin extends BasePlugin {
  metadata: PluginMetadata = {
    name: "my-plugin",
    version: "1.0.0",
    description: "My awesome plugin",
    dependencies: [],
  }

  async init(context: PluginContext): Promise<void> {
    const { app, logger, services, events } = context

    // 1. Register HTTP routes
    app.get("/api/my-plugin", (req, res) => {
      res.json({ message: "Hello" })
    })

    // 2. Register services
    const myService = new MyService()
    services.set("my-service", myService)

    // 3. Listen to events
    events.on("user:login", (user) => {
      logger.info(`User logged in: ${user.id}`)
    })

    logger.info("MyPlugin initialized")
  }

  async destroy(): Promise<void> {
    // Cleanup resources
  }

  async healthCheck(): Promise<boolean> {
    return true
  }
}
```

### Security Best Practices

1. **Always validate input:**

   ```typescript
   const { valid, error } = validateInput(req.body.email, {
     required: true,
     email: true,
   })
   ```

2. **Sanitize output:**

   ```typescript
   const safe = sanitizeHTML(userInput)
   res.send(`<div>${safe}</div>`)
   ```

3. **Use CSRF protection:**

   ```typescript
   app.use(csrf.generateToken())
   app.post("/api/data", csrf.validateToken(), handler)
   ```

4. **Apply security headers:**

   ```typescript
   app.use(securityHeaders())
   app.use(hsts(31536000))
   ```

5. **Rate limit endpoints:**
   ```typescript
   const limiter = new RateLimiter({ maxRequests: 100, windowMs: 60000 })
   app.use("/api/", limiter.middleware())
   ```

---

## Related Files

- **Plugin Registration:** `src/node/main.ts` (server startup)
- **Route Integration:** `src/node/routes/index.ts`
- **HTTP Utilities:** `src/node/http.ts`
- **Common Types:** `src/common/http.ts`

---

## Future Enhancements

- [ ] Plugin hot reloading
- [ ] Plugin marketplace integration
- [ ] Signed plugin verification
- [ ] Sandboxed plugin execution
- [ ] Plugin configuration UI
- [ ] Advanced rate limiting (Redis backend)
- [ ] WAF integration
- [ ] Audit logging
- [ ] Secret management
- [ ] Advanced RBAC system
