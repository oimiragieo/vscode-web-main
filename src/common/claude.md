# src/common/ - Shared Utilities

## Overview

This directory contains utilities and types shared between client and server code. These are pure functions and classes with no dependencies on Node.js or browser-specific APIs, making them usable in any environment.

## Directory Structure

```
src/common/
├── emitter.ts    # Event emitter system
├── http.ts       # HTTP constants and types
└── util.ts       # General utility functions
```

---

## Files

### emitter.ts
**Purpose:** Type-safe event emitter with async support

**Location:** `src/common/emitter.ts`

**Key Classes:**

#### `Emitter<T>`
Generic event emitter for creating event systems.

**Features:**
- Type-safe events (TypeScript generics)
- Async callback support
- Automatic error handling
- Disposable subscriptions
- Promise-based emission

**Interface:**
```typescript
class Emitter<T> {
  // Subscribe to events
  get event(): Event<T>

  // Emit an event to all listeners
  async emit(value: T): Promise<void>

  // Dispose of all listeners
  dispose(): void
}
```

**Usage Example:**
```typescript
// Create an emitter for user events
const userEmitter = new Emitter<{ id: string, action: string }>()

// Subscribe to events
const disposable = userEmitter.event(async (data) => {
  console.log(`User ${data.id} performed ${data.action}`)
})

// Emit events
await userEmitter.emit({ id: '123', action: 'login' })

// Cleanup
disposable.dispose()
```

**Key Features:**

1. **Type Safety:** TypeScript generics ensure type-safe event data
2. **Async Support:** All callbacks are async and awaited
3. **Error Handling:** Errors in callbacks are caught and logged
4. **Disposable Pattern:** Follows VS Code's disposable pattern
5. **Multiple Subscribers:** Supports multiple listeners per event

**Error Handling:**
- Callback errors are caught automatically
- Errors are logged via logger
- Other callbacks continue executing

**Use Cases:**
- Plugin lifecycle events
- Request/response events
- State change notifications
- Inter-component communication
- Decoupled event systems

**Extension Point:** Use for custom plugin events, service notifications, state management

---

### http.ts
**Purpose:** HTTP constants, types, and error handling

**Location:** `src/common/http.ts`

**Exports:**

#### `HttpCode` Enum
Standard HTTP status codes.

**Common Codes:**
```typescript
enum HttpCode {
  Ok = 200,
  Created = 201,
  NoContent = 204,
  MovedPermanently = 301,
  Found = 302,
  BadRequest = 400,
  Unauthorized = 401,
  Forbidden = 403,
  NotFound = 404,
  Conflict = 409,
  TooManyRequests = 429,
  InternalServerError = 500,
  BadGateway = 502,
  ServiceUnavailable = 503,
  // ... more codes
}
```

**Usage:**
```typescript
res.status(HttpCode.NotFound).json({ error: 'Not found' })
```

---

#### `HttpError` Class
Custom error class for HTTP errors with status codes.

**Features:**
- Extends built-in `Error`
- Includes HTTP status code
- Optional error details
- Stack trace support

**Interface:**
```typescript
class HttpError extends Error {
  constructor(
    message: string,
    public readonly statusCode: HttpCode,
    public readonly details?: any
  )
}
```

**Usage:**
```typescript
// Throw HTTP error
throw new HttpError('User not found', HttpCode.NotFound)

// With details
throw new HttpError(
  'Validation failed',
  HttpCode.BadRequest,
  { field: 'email', error: 'Invalid format' }
)

// Catch and handle
try {
  await someOperation()
} catch (error) {
  if (error instanceof HttpError) {
    res.status(error.statusCode).json({
      error: error.message,
      details: error.details
    })
  }
}
```

**Benefits:**
- Consistent error handling
- Type-safe status codes
- Simplified error responses
- Better debugging with stack traces

---

#### Cookie Constants
Standard cookie key names.

**Constants:**
```typescript
export enum CookieKeys {
  Session = 'code-server-session',
  CSRF = 'code-server-csrf'
}
```

**Usage:**
```typescript
// Set session cookie
res.cookie(CookieKeys.Session, sessionToken, {
  httpOnly: true,
  secure: true,
  sameSite: 'lax'
})

// Read session cookie
const session = req.cookies[CookieKeys.Session]
```

**Benefits:**
- Centralized cookie naming
- Prevents typos
- Easy to change cookie names

---

### util.ts
**Purpose:** General utility functions

**Location:** `src/common/util.ts`

**Functions:**

#### `plural(count: number, singular: string, plural?: string): string`
Returns singular or plural form based on count.

**Signature:**
```typescript
function plural(count: number, singular: string, plural?: string): string
```

**Behavior:**
- If count is 1, returns singular
- Otherwise returns plural (or singular + 's' if not provided)

**Usage:**
```typescript
plural(1, 'file')          // 'file'
plural(5, 'file')          // 'files'
plural(2, 'box', 'boxes')  // 'boxes'
plural(1, 'box', 'boxes')  // 'box'

// In messages
console.log(`Found ${count} ${plural(count, 'error')}`)
// "Found 1 error" or "Found 5 errors"
```

**Use Cases:**
- Log messages
- User-facing text
- Error messages
- Statistics display

---

#### `generateUuid(): string`
Generates a random UUID v4.

**Signature:**
```typescript
function generateUuid(): string
```

**Returns:** UUID string in format `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`

**Usage:**
```typescript
const id = generateUuid()
// "550e8400-e29b-41d4-a716-446655440000"

// Use for unique identifiers
const sessionId = generateUuid()
const requestId = generateUuid()
const userId = generateUuid()
```

**Implementation:** Uses `crypto.randomUUID()` or fallback

**Use Cases:**
- Session IDs
- Request tracking IDs
- Unique resource identifiers
- Correlation IDs
- CSRF tokens (may use crypto.randomBytes instead)

---

#### `normalize(path: string, keepTrailing = false): string`
Normalizes URL paths.

**Signature:**
```typescript
function normalize(path: string, keepTrailing?: boolean): string
```

**Behavior:**
- Removes duplicate slashes
- Ensures leading slash
- Optionally keeps trailing slash
- Handles empty paths

**Usage:**
```typescript
normalize('/path//to///file')       // '/path/to/file'
normalize('path/to/file')           // '/path/to/file'
normalize('/path/to/dir/', true)    // '/path/to/dir/'
normalize('/path/to/dir/', false)   // '/path/to/dir'
normalize('')                        // '/'
```

**Use Cases:**
- URL path construction
- Route normalization
- Path comparison
- Base path handling

---

#### `logError(logger: Logger, error: Error | unknown): void`
Logs errors consistently.

**Signature:**
```typescript
function logError(logger: Logger, error: Error | unknown): void
```

**Behavior:**
- Extracts error message
- Logs stack trace if available
- Handles non-Error objects
- Consistent formatting

**Usage:**
```typescript
try {
  await riskyOperation()
} catch (error) {
  logError(logger, error)
}
```

**Benefits:**
- Consistent error logging
- Always includes stack trace
- Handles any error type
- Single source of truth for error formatting

---

## Design Patterns

### Event-Driven Architecture

The `Emitter` class enables decoupled communication:

```typescript
// Service A emits events
class DataService {
  private changeEmitter = new Emitter<DataChange>()
  public onChange = this.changeEmitter.event

  async updateData(data: any) {
    // ... update logic
    await this.changeEmitter.emit({ type: 'update', data })
  }
}

// Service B listens to events
class CacheService {
  constructor(dataService: DataService) {
    dataService.onChange(async (change) => {
      await this.invalidateCache(change.data)
    })
  }
}
```

**Benefits:**
- Loose coupling between components
- Easy to add new listeners
- Type-safe event data
- No circular dependencies

---

### Error Handling

Consistent error handling with `HttpError`:

```typescript
// In route handler
app.get('/api/user/:id', async (req, res, next) => {
  try {
    const user = await userService.getUser(req.params.id)
    if (!user) {
      throw new HttpError('User not found', HttpCode.NotFound)
    }
    res.json(user)
  } catch (error) {
    next(error)  // Pass to error handler
  }
})

// Global error handler
app.use((error, req, res, next) => {
  if (error instanceof HttpError) {
    res.status(error.statusCode).json({
      error: error.message,
      details: error.details
    })
  } else {
    logError(logger, error)
    res.status(500).json({ error: 'Internal server error' })
  }
})
```

---

## Type Definitions

### Event<T>
Function type for event subscriptions.

```typescript
type Event<T> = (callback: Callback<T>) => Disposable

type Callback<T> = (value: T) => void | Promise<void>

interface Disposable {
  dispose(): void
}
```

**Usage Pattern:**
```typescript
const emitter = new Emitter<string>()
const event: Event<string> = emitter.event

const subscription = event((message) => {
  console.log(message)
})

// Later...
subscription.dispose()
```

---

## Extension Integration Points

### Custom Event Systems

Create custom event emitters for plugin communication:

```typescript
// In plugin
export class MyPlugin extends BasePlugin {
  private fileChangeEmitter = new Emitter<FileChange>()
  public onFileChange = this.fileChangeEmitter.event

  async init(context: PluginContext): Promise<void> {
    // Expose event to other plugins
    context.services.set('fileChangeEvent', this.onFileChange)
  }

  private async notifyFileChange(file: string): Promise<void> {
    await this.fileChangeEmitter.emit({ file, timestamp: Date.now() })
  }
}

// In another plugin
export class CachePlugin extends BasePlugin {
  async init(context: PluginContext): Promise<void> {
    const fileChangeEvent = context.services.get('fileChangeEvent')

    fileChangeEvent(async (change) => {
      await this.invalidateCache(change.file)
    })
  }
}
```

---

### Custom HTTP Errors

Extend HttpError for domain-specific errors:

```typescript
class ValidationError extends HttpError {
  constructor(field: string, message: string) {
    super(`Validation failed for ${field}`, HttpCode.BadRequest, {
      field,
      message
    })
  }
}

class AuthenticationError extends HttpError {
  constructor(reason: string) {
    super('Authentication failed', HttpCode.Unauthorized, { reason })
  }
}

// Usage
if (!email.includes('@')) {
  throw new ValidationError('email', 'Must be valid email')
}
```

---

### Utility Function Extensions

Add domain-specific utilities:

```typescript
// In your plugin utilities
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`
}

export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout

  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn(...args), delay)
  }
}
```

---

## Best Practices

### Event Emitters

1. **Always dispose:** Clean up event subscriptions in destroy()
2. **Type safety:** Use TypeScript generics for event data
3. **Error handling:** Wrap callbacks in try-catch
4. **Async operations:** Use async callbacks when needed
5. **Memory leaks:** Dispose of subscriptions when no longer needed

### Error Handling

1. **Use HttpError:** For HTTP-related errors
2. **Include context:** Add details object for debugging
3. **Consistent logging:** Use logError() for all errors
4. **User-friendly messages:** Clear, actionable error messages
5. **Stack traces:** Always preserve stack traces

### Utilities

1. **Pure functions:** Keep utilities side-effect free
2. **Single responsibility:** One function, one purpose
3. **Test coverage:** Unit test all utilities
4. **Documentation:** JSDoc comments for public functions
5. **Type safety:** Strong TypeScript types

---

## Testing

### Unit Tests

Located in `test/unit/common/`

**Test Coverage:**
- Emitter subscription/emission
- Error handling in callbacks
- Disposable cleanup
- HttpError construction
- Utility functions (plural, normalize, etc.)

**Example Test:**
```typescript
describe('Emitter', () => {
  it('should emit events to subscribers', async () => {
    const emitter = new Emitter<string>()
    let received: string | undefined

    emitter.event((value) => {
      received = value
    })

    await emitter.emit('test')
    expect(received).toBe('test')
  })

  it('should handle errors in callbacks', async () => {
    const emitter = new Emitter<string>()

    emitter.event(() => {
      throw new Error('Test error')
    })

    // Should not throw
    await expect(emitter.emit('test')).resolves.toBeUndefined()
  })
})
```

---

## Related Files

### Server-Side Usage
- **HTTP Module:** `src/node/http.ts` (extends common/http.ts)
- **Route Handlers:** All routes use HttpError
- **Services:** All services use Emitter for events

### Client-Side Usage
- **Service Worker:** May use utilities
- **Configuration:** Uses shared types

---

## Performance Considerations

### Event Emitters

1. **Listener Limits:** Consider limiting number of listeners
2. **Memory:** Dispose of unused subscriptions
3. **Async Performance:** Await all callbacks (serial execution)
4. **Error Impact:** One error doesn't stop other callbacks

### Utilities

1. **UUID Generation:** Uses crypto API (efficient)
2. **Path Normalization:** Regex-based (fast)
3. **String Operations:** Minimal allocations

---

## Future Enhancements

- [ ] Add retry utility function
- [ ] Add throttle/debounce utilities
- [ ] Extend HttpError with more error types
- [ ] Add validation utilities
- [ ] Add date/time formatting utilities
- [ ] Add deep merge utility
- [ ] Add async retry with backoff
- [ ] Add circuit breaker pattern
