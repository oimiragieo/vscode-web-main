# Comprehensive Resource Management Analysis - VSCode Web Codebase

## Executive Summary

This analysis identifies critical resource management issues in the VSCode web codebase spanning memory leaks, CPU optimization opportunities, I/O inefficiencies, and process management problems. The findings reveal several patterns that could impact performance and stability under load.

---

## 1. MEMORY MANAGEMENT ISSUES

### 1.1 Event Listener Memory Leak - Emitter Class

**File**: `/home/user/vscode-web-main/src/common/emitter.ts`

**Issue**: Event listeners are properly cleaned up with a `dispose()` method, but there's a critical issue in event emission:

```typescript
// Lines 41-56
public async emit(value: T): Promise<void> {
  let resolve: () => void
  const promise = new Promise<void>((r) => (resolve = r))

  await Promise.all(
    this.listeners.map(async (cb) => {
      try {
        await cb(value, promise)
      } catch (error: any) {
        logger.error(error.message)  // Silent error handling
      }
    }),
  )

  resolve!()
}
```

**Problems**:

- If a listener throws an error, it's silently logged but not properly tracked
- The `resolve!()` can fail with non-null assertion errors if resolve is never set
- No timeout mechanism for hanging listeners blocking other listeners

**Risk**: High - Can cause memory buildup in error scenarios

**Recommendation**:

```typescript
public async emit(value: T): Promise<void> {
  let resolve: () => void
  let reject: (error: Error) => void
  const promise = new Promise<void>((r, rej) => {
    resolve = r
    reject = rej
  })

  const timeout = setTimeout(() => {
    reject(new Error('Event emission timeout'))
  }, 30000) // 30 second timeout

  await Promise.allSettled(
    this.listeners.map(async (cb) => {
      try {
        await cb(value, promise)
      } catch (error: any) {
        logger.error(`Event listener error: ${error.message}`)
        // Consider removing problematic listeners
      }
    }),
  )

  clearTimeout(timeout)
  resolve!()
}

public dispose(): void {
  this.listeners = []
  this.listeners.length = 0 // Extra safety
}
```

---

### 1.2 Session Store Memory Leak - MemorySessionStore

**File**: `/home/user/vscode-web-main/src/node/services/session/SessionStore.ts` (Lines 35-167)

**Issue**: Cleanup interval is set but sessions can accumulate if cleanup fails or stalls:

```typescript
// Line 42-46
this.cleanupInterval = setInterval(() => {
  this.deleteExpiredSessions().catch((err) => {
    console.error("Failed to clean up expired sessions:", err)
  })
}, cleanupIntervalSeconds * 1000)
```

**Problems**:

- Silent failure: errors are logged but cleanup doesn't retry
- No memory pressure handling - doesn't shrink when heap grows
- `deleteExpiredSessions()` iterates all sessions even when none are expired
- User sessions map can grow unbounded if users never log out

**Risk**: Critical under load - Memory bloat with many concurrent sessions

**Recommendation**:

```typescript
export class MemorySessionStore implements SessionStore {
  private sessions: Map<string, Session> = new Map()
  private userSessions: Map<string, Set<string>> = new Map()
  private cleanupInterval: NodeJS.Timeout | null = null
  private readonly maxSessions = 10000 // Add hard limit
  private failedCleanups = 0
  private readonly maxFailedCleanups = 5

  constructor(
    cleanupIntervalSeconds = 60,
    private maxSessionsPerStore = 10000,
  ) {
    this.startCleanupInterval(cleanupIntervalSeconds)

    // Monitor memory pressure
    this.monitorMemoryPressure()
  }

  private monitorMemoryPressure(): void {
    const checkMemory = () => {
      const used = process.memoryUsage()
      const heapUsedPercent = (used.heapUsed / used.heapTotal) * 100

      if (heapUsedPercent > 80) {
        // Aggressive cleanup on high memory
        this.deleteExpiredSessions()

        // If still high, remove LRU sessions
        if (heapUsedPercent > 85) {
          this.removeLRUSessions(Math.ceil(this.sessions.size * 0.1))
        }
      }
    }

    setInterval(checkMemory, 5000)
  }

  private removeLRUSessions(count: number): void {
    // Remove least recently used sessions
    const sorted = Array.from(this.sessions.entries())
      .sort((a, b) => a[1].lastActivity.getTime() - b[1].lastActivity.getTime())
      .slice(0, count)

    sorted.forEach(([sessionId]) => this.delete(sessionId).catch(console.error))
  }

  private startCleanupInterval(intervalSeconds: number): void {
    this.cleanupInterval = setInterval(async () => {
      try {
        await this.deleteExpiredSessions()
        this.failedCleanups = 0
      } catch (err) {
        this.failedCleanups++
        console.error("Failed to clean up expired sessions:", err)

        if (this.failedCleanups >= this.maxFailedCleanups) {
          // Trigger aggressive cleanup
          this.sessions.clear()
          this.userSessions.clear()
          this.failedCleanups = 0
        }
      }
    }, intervalSeconds * 1000)
  }

  async close(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    this.sessions.clear()
    this.userSessions.clear()
  }
}
```

---

### 1.3 Object Allocation in HTTP Socket Disposer

**File**: `/home/user/vscode-web-main/src/node/http.ts` (Lines 250-295)

**Issue**: Each socket creates a closure over `sockets` Set and timeout:

```typescript
export function disposer(server: http.Server): Disposable["dispose"] {
  const sockets = new Set<net.Socket>()
  let cleanupTimeout: undefined | NodeJS.Timeout

  server.on("connection", (socket) => {
    sockets.add(socket)
    // Adds listener to every socket
    socket.on("close", () => {
      sockets.delete(socket)
      // ... more code
    })
  })
  // ... returns closure
}
```

**Problems**:

- Creates a Set for every server instance (should be reused)
- Socket event listener never garbage collected if socket hangs
- Timeout at line 284 can hang if sockets don't properly close

**Risk**: Medium - Under many connections, accumulates closure memory

**Recommendation**:

```typescript
export function disposer(server: http.Server): Disposable["dispose"] {
  const sockets = new Set<net.Socket>()
  let cleanupTimeout: undefined | NodeJS.Timeout
  const MAX_SOCKET_WAIT = 5000 // Reduced from arbitrary

  server.on("connection", (socket) => {
    sockets.add(socket)

    const onClose = () => {
      sockets.delete(socket)
      socket.removeListener("close", onClose)

      if (cleanupTimeout && sockets.size === 0) {
        clearTimeout(cleanupTimeout)
        cleanupTimeout = undefined
      }
    }

    // Use once() to auto-cleanup
    socket.once("close", onClose)

    // Destroy hanging sockets
    socket.setTimeout(30000, () => {
      if (!socket.destroyed) {
        socket.destroy()
      }
    })
  })

  return () => {
    return new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) return reject(err)
        resolve()
      })

      if (sockets.size > 0) {
        cleanupTimeout = setTimeout(() => {
          cleanupTimeout = undefined
          sockets.forEach((socket) => {
            if (!socket.destroyed) {
              console.warn("Force destroying hanging socket")
              socket.destroy()
            }
          })
        }, MAX_SOCKET_WAIT)
      }
    })
  }
}
```

---

### 1.4 Buffer Concatenation in Update Provider

**File**: `/home/user/vscode-web-main/src/node/update.ts` (Lines 84-98)

**Issue**: Inefficient buffer handling during HTTP response streaming:

```typescript
private async request(uri: string): Promise<Buffer> {
  const response = await this.requestResponse(uri)
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let bufferLength = 0
    response.on("data", (chunk) => {
      bufferLength += chunk.length
      chunks.push(chunk)  // Accumulates chunks in array
    })
    response.on("error", reject)
    response.on("end", () => {
      resolve(Buffer.concat(chunks, bufferLength))  // Single large concat
    })
  })
}
```

**Problems**:

- `Buffer.concat()` on potentially large arrays allocates new memory
- No streaming processing for large responses
- No size limits on response body
- For update checks, likely small responses, but pattern can cause issues

**Risk**: Medium - Impacts large file downloads if feature expands

**Recommendation**:

```typescript
private async request(uri: string, maxSize = 1024 * 1024): Promise<Buffer> {
  const response = await this.requestResponse(uri)
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let totalLength = 0

    response.on("data", (chunk) => {
      totalLength += chunk.length

      if (totalLength > maxSize) {
        response.destroy()
        reject(new Error(`Response exceeded max size of ${maxSize} bytes`))
        return
      }

      chunks.push(chunk)
    })

    response.on("error", reject)
    response.on("end", () => {
      resolve(Buffer.concat(chunks, totalLength))
    })
  })
}
```

---

## 2. CPU USAGE OPTIMIZATION

### 2.1 Password Hashing CPU Overhead

**File**: `/home/user/vscode-web-main/src/node/util.ts` (Lines 143-175)

**Issue**: Multiple password hashing operations on every login request:

```typescript
export async function handlePasswordValidation({
  passwordMethod,
  passwordFromArgs,
  passwordFromRequestBody,
  hashedPasswordFromArgs,
}: HandlePasswordValidationArgs): Promise<PasswordValidation> {
  // ... code ...
  case "PLAIN_TEXT": {
    const isValid = safeCompare(passwordFromRequestBody, passwordFromArgs) : false
    // ALWAYS hashes for obfuscation (line 239)
    const hashedPassword = await hash(passwordFromRequestBody)
    // ...
  }
}
```

**Problems**:

- **CRITICAL**: Line 239 always calls `hash()` which uses argon2 (CPU intensive)
- Timing attack concern: This actually helps security but wastes CPU on every attempt
- Multiple hashing operations if password method changes
- No async queue/worker pool - blocks thread during hash

**Risk**: High under load - CPU bottleneck on login endpoints

**Recommendation**:

```typescript
// Use worker pool for CPU-intensive crypto
import { Worker } from 'worker_threads'
import os from 'os'

class PasswordHashWorkerPool {
  private workers: Worker[] = []
  private queue: Array<{ password: string; resolve: (h: string) => void; reject: (e: Error) => void }> = []
  private currentWorker = 0

  constructor(poolSize = os.cpus().length) {
    for (let i = 0; i < poolSize; i++) {
      // Spawn worker thread for hash operations
      const worker = new Worker('./passwordHashWorker.ts')
      worker.on('message', this.handleWorkerMessage.bind(this))
      this.workers.push(worker)
    }
  }

  async hash(password: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.queue.push({ password, resolve, reject })
      this.processQueue()
    })
  }

  private processQueue(): void {
    if (this.queue.length === 0) return
    const { password, resolve, reject } = this.queue.shift()!

    const worker = this.workers[this.currentWorker]
    this.currentWorker = (this.currentWorker + 1) % this.workers.length

    worker.once('message', (result: string) => resolve(result))
    worker.once('error', reject)
    worker.postMessage({ password })
  }

  close(): void {
    this.workers.forEach(w => w.terminate())
  }
}

const hashPool = new PasswordHashWorkerPool()

export async function handlePasswordValidation({...}: HandlePasswordValidationArgs): Promise<PasswordValidation> {
  // Use worker pool
  const hashedPassword = await hashPool.hash(passwordFromRequestBody)
  // ...
}
```

---

### 2.2 Regex Compilation in Util Module

**File**: `/home/user/vscode-web-main/src/node/util.ts` (Lines 20-24)

**Issue**: ANSI regex is compiled at module load but recompiled on each use:

```typescript
const pattern = [
  "[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)",
  "(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))",
].join("|")
const re = new RegExp(pattern, "g") // Recreated on every module load
```

**Issue**: Regex is created once but the `replace()` operation is called multiple times:

```typescript
// Line 42 in onLine function
callback(split[i].replace(re, ""), split[i])
```

**Problems**:

- Regex pattern is very complex (ReDoS potential on malicious input)
- `split[i].replace(re, "")` called on every log line
- No caching of regex results

**Risk**: Medium - DoS vulnerability with crafted log input

**Recommendation**:

```typescript
// Cache compiled regex
const re = new RegExp(pattern, "g")

// Add timeout protection
export const onLine = (proc: cp.ChildProcess, callback: OnLineCallback): void => {
  let buffer = ""
  if (!proc.stdout) {
    throw new Error("no stdout")
  }
  proc.stdout.setEncoding("utf8")

  // Add max line length check
  const MAX_LINE_LENGTH = 16384

  proc.stdout.on("data", (d) => {
    const data = buffer + d
    const split = data.split("\n")
    const last = split.length - 1

    for (let i = 0; i < last; ++i) {
      const line = split[i]

      // Skip processing very long lines (likely corrupted)
      if (line.length > MAX_LINE_LENGTH) {
        console.warn(`Skipping line exceeding max length: ${line.length}`)
        continue
      }

      try {
        // Cache ANSI-stripped version
        const stripped = line.replace(re, "")
        callback(stripped, line)
      } catch (e) {
        console.error(`Error processing line: ${e}`)
      }
    }

    buffer = split[last]
  })
}
```

---

### 2.3 JSON Parsing Optimization

**File**: `/home/user/vscode-web-main/src/node/vscodeSocket.ts` (Lines 155-183)

**Issue**: Inefficient JSON parsing in EditorSessionManagerClient:

```typescript
async getConnectedSocketPath(filePath: string): Promise<string | undefined> {
  const response = await new Promise<GetSessionResponse>((resolve, reject) => {
    // ...
    res.on("end", () => {
      try {
        const obj = JSON.parse(rawData)  // Full parsing
        if (res.statusCode === 200) {
          resolve(obj)
        } else {
          reject(new Error("Unexpected status code: " + res.statusCode))
        }
      } catch (e: unknown) {
        reject(e)
      }
    })
  })
}
```

**Problems**:

- String accumulation (`rawData += chunk`) creates many intermediate strings
- No streaming JSON parser
- Full buffer in memory before parsing

**Risk**: Medium - Memory spike with many concurrent requests

**Recommendation**:

```typescript
async getConnectedSocketPath(filePath: string): Promise<string | undefined> {
  const response = await new Promise<GetSessionResponse>((resolve, reject) => {
    const opts = {
      path: "/session?filePath=" + encodeURIComponent(filePath),
      socketPath: this.codeServerSocketPath,
      method: "GET",
    }
    const req = http.request(opts, (res) => {
      let buffers: Buffer[] = []
      let totalLength = 0
      const MAX_RESPONSE_SIZE = 1024 * 10 // 10KB limit

      res.on("data", (chunk: Buffer) => {
        totalLength += chunk.length
        if (totalLength > MAX_RESPONSE_SIZE) {
          res.destroy()
          reject(new Error("Response exceeds size limit"))
          return
        }
        buffers.push(chunk)
      })

      res.on("end", () => {
        try {
          const rawData = Buffer.concat(buffers).toString("utf8")
          const obj = JSON.parse(rawData)
          if (res.statusCode === 200) {
            resolve(obj)
          } else {
            reject(new Error("Unexpected status code: " + res.statusCode))
          }
        } catch (e: unknown) {
          reject(e)
        }
      })
    })
    req.on("error", reject)
    req.end()
  })
  return response.socketPath
}
```

---

## 3. I/O OPTIMIZATION

### 3.1 Inefficient Audit Log Querying

**File**: `/home/user/vscode-web-main/src/node/services/audit/AuditLogger.ts` (Lines 75-135)

**Issue**: Full file reads and in-memory filtering:

```typescript
async query(filter: AuditEventFilter): Promise<AuditEvent[]> {
  const events: AuditEvent[] = []

  try {
    const logFiles = await this.getLogFiles(filter.startDate, filter.endDate)

    for (const logFile of logFiles) {
      const content = await fs.readFile(logFile, "utf-8")  // Entire file in memory
      const lines = content.split("\n").filter((line) => line.trim())  // More copies

      for (const line of lines) {
        try {
          const event = JSON.parse(line) as AuditEvent
          // ... filtering in app code
          if (filter.userId && event.userId !== filter.userId) continue
          // ... more filtering
          events.push(event)
        } catch {
          // Skip malformed lines
        }
      }
    }
  } catch {
    // Log directory might not exist
  }

  // Sort by timestamp (newest first)
  events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

  // Apply pagination
  return events.slice(offset, offset + limit)
}
```

**Problems**:

- Full file read into memory (could be GBs)
- String split creates copies of entire content
- All filtering done in application code (no database index)
- Sorts entire result set then paginates
- No early termination when limit reached

**Risk**: Critical - High memory, high CPU, slow queries

**Recommendation**:

```typescript
async query(filter: AuditEventFilter): Promise<AuditEvent[]> {
  const events: AuditEvent[] = []
  const offset = filter.offset || 0
  const limit = filter.limit || 100
  let collected = 0

  try {
    const logFiles = await this.getLogFiles(filter.startDate, filter.endDate)

    // Process files in reverse (newest first)
    for (let i = logFiles.length - 1; i >= 0 && collected < limit + offset; i--) {
      const logFile = logFiles[i]

      // Use streaming instead of full read
      const fileHandle = await fs.open(logFile, 'r')
      const stream = fileHandle.createReadStream({ encoding: 'utf8', highWaterMark: 64 * 1024 })

      const rl = readline.createInterface({
        input: stream,
        crlfDelay: Infinity
      })

      for await (const line of rl) {
        if (!line.trim()) continue

        try {
          const event = JSON.parse(line) as AuditEvent
          event.timestamp = new Date(event.timestamp)

          // Apply filters early
          if (!this.matchesFilter(event, filter)) continue

          // Early termination
          if (collected >= limit + offset) {
            rl.close()
            break
          }

          events.push(event)
          collected++
        } catch {
          // Skip malformed lines
        }
      }

      await fileHandle.close()
    }
  } catch (e) {
    console.error("Error querying audit logs:", e)
  }

  // Already sorted, just apply pagination
  return events.slice(offset, offset + limit)
}

private matchesFilter(event: AuditEvent, filter: AuditEventFilter): boolean {
  if (filter.userId && event.userId !== filter.userId) return false

  if (filter.eventType) {
    const types = Array.isArray(filter.eventType) ? filter.eventType : [filter.eventType]
    if (!types.includes(event.eventType)) return false
  }

  if (filter.status && event.status !== filter.status) return false

  return true
}
```

---

### 3.2 Inefficient Session Store Update in Redis

**File**: `/home/user/vscode-web-main/src/node/services/session/SessionStore.ts` (Lines 200-216)

**Issue**: Fetches all user sessions then rebuilds the list:

```typescript
async set(sessionId: string, session: Session, ttl?: number): Promise<void> {
  const key = this.getKey(sessionId)
  const value = JSON.stringify(session)

  const ttlSeconds = ttl || Math.floor((session.expiresAt.getTime() - Date.now()) / 1000)

  if (ttlSeconds > 0) {
    await this.redis.set(key, value, { EX: ttlSeconds })

    // INEFFICIENT: Fetch all sessions, add one, rewrite all
    const userKey = this.getUserKey(session.userId)
    const userSessions = await this.getUserSessions(session.userId)  // Full fetch!
    userSessions.push(session)  // Add one
    await this.redis.set(userKey, JSON.stringify(userSessions.map((s) => s.id)), { EX: ttlSeconds })
  }
}
```

**Problems**:

- On every session creation, fetches all user's sessions
- `getUserSessions()` calls `get()` multiple times (lines 278-283)
- Rebuilds entire JSON on single session addition
- No atomic operations - race conditions possible

**Risk**: High - O(n) operations, latency with many sessions

**Recommendation**:

```typescript
async set(sessionId: string, session: Session, ttl?: number): Promise<void> {
  const key = this.getKey(sessionId)
  const value = JSON.stringify(session)

  const ttlSeconds = ttl || Math.floor((session.expiresAt.getTime() - Date.now()) / 1000)

  if (ttlSeconds > 0) {
    // Use pipeline for atomic operations
    const pipeline = this.redis.pipeline()

    // Set session
    pipeline.set(key, value, { EX: ttlSeconds })

    // Add to user's sorted set (for ordering/LRU)
    const userSessionsKey = this.getUserKey(session.userId)
    pipeline.zadd(userSessionsKey, session.lastActivity.getTime(), sessionId)

    // Set TTL on user session set
    pipeline.expire(userSessionsKey, ttlSeconds)

    await pipeline.exec()
  }
}

async getUserSessions(userId: string): Promise<Session[]> {
  const userKey = this.getUserKey(userId)

  // Get session IDs from sorted set (most recent first)
  const sessionIds = await this.redis.zrevrange(userKey, 0, -1)

  if (!sessionIds || sessionIds.length === 0) {
    return []
  }

  // Fetch all sessions in parallel
  const sessions = await Promise.all(
    sessionIds.map(sessionId => this.get(sessionId))
  )

  return sessions.filter((s): s is Session => s !== null)
}
```

---

### 3.3 File System Operations in Routes

**File**: `/home/user/vscode-web-main/src/node/routes/index.ts` (Lines 95-105)

**Issue**: Synchronous file operations in every request:

```typescript
app.router.get(["/security.txt", "/.well-known/security.txt"], async (_, res) => {
  const resourcePath = path.resolve(rootPath, "src/browser/security.txt")
  res.set("Content-Type", getMediaMime(resourcePath))
  res.send(await fs.readFile(resourcePath)) // Reads file on every request
})

app.router.get("/robots.txt", async (_, res) => {
  const resourcePath = path.resolve(rootPath, "src/browser/robots.txt")
  res.set("Content-Type", getMediaMime(resourcePath))
  res.send(await fs.readFile(resourcePath)) // Reads file on every request
})
```

**Problems**:

- Static files read from disk on every request
- No caching of file contents
- No etag/cache headers
- Path resolution on every request

**Risk**: Medium - Unnecessary I/O and CPU

**Recommendation**:

```typescript
// Cache static files at startup
interface CachedFile {
  content: Buffer
  contentType: string
  hash: string
  etag: string
}

const staticFileCache = new Map<string, CachedFile>()

async function cacheStaticFile(relativePath: string, mimeType?: string): Promise<void> {
  const fullPath = path.resolve(rootPath, relativePath)
  const content = await fs.readFile(fullPath)
  const hash = crypto.createHash("md5").update(content).digest("hex")

  staticFileCache.set(relativePath, {
    content,
    contentType: mimeType || getMediaMime(fullPath),
    hash,
    etag: `"${hash}"`,
  })
}

// Cache on startup
export const register = async (app: App, args: DefaultedArgs) => {
  // Cache static files
  await Promise.all([
    cacheStaticFile("src/browser/security.txt", "text/plain"),
    cacheStaticFile("src/browser/robots.txt", "text/plain"),
  ])

  app.router.get(["/security.txt", "/.well-known/security.txt"], (_, res) => {
    const cached = staticFileCache.get("src/browser/security.txt")!
    res.set("Content-Type", cached.contentType)
    res.set("ETag", cached.etag)
    res.set("Cache-Control", "public, max-age=3600")
    res.send(cached.content)
  })

  app.router.get("/robots.txt", (_, res) => {
    const cached = staticFileCache.get("src/browser/robots.txt")!
    res.set("Content-Type", cached.contentType)
    res.set("ETag", cached.etag)
    res.set("Cache-Control", "public, max-age=3600")
    res.send(cached.content)
  })
}
```

---

## 4. PROCESS MANAGEMENT ISSUES

### 4.1 Child Process Resource Cleanup

**File**: `/home/user/vscode-web-main/src/node/wrapper.ts` (Lines 154-283)

**Issue**: ChildProcess monitoring interval never cleared:

```typescript
export class ChildProcess extends Process {
  public constructor(private readonly parentPid: number) {
    super()

    // Line 162-172: Monitors parent in interval
    setInterval(() => {
      try {
        process.kill(this.parentPid, 0)
      } catch (_) {
        this.logger.error(`parent process ${parentPid} died`)
        this._onDispose.emit(undefined)
      }
    }, 5000) // No way to clear this interval!
  }
}
```

**Problems**:

- Interval created with no handle to clear it
- Continues running even after disposal
- No graceful shutdown hook
- Leaks file descriptor on parent pid

**Risk**: Medium - Accumulates timers, prevents process exit

**Recommendation**:

```typescript
export class ChildProcess extends Process {
  private parentCheckInterval?: NodeJS.Timeout

  public constructor(private readonly parentPid: number) {
    super()

    // Store interval for cleanup
    this.parentCheckInterval = setInterval(() => {
      try {
        process.kill(this.parentPid, 0)
      } catch (_) {
        this.logger.error(`parent process ${this.parentPid} died`)
        this._onDispose.emit(undefined)
      }
    }, 5000)

    // Clean up interval on dispose
    this.onDispose(() => {
      if (this.parentCheckInterval) {
        clearInterval(this.parentCheckInterval)
        this.parentCheckInterval = undefined
      }
    })
  }
}
```

---

### 4.2 Rotating File Stream Resource Leak

**File**: `/home/user/vscode-web-main/src/node/wrapper.ts` (Lines 227-254)

**Issue**: Rotating file streams not properly closed:

```typescript
export class ParentProcess extends Process {
  private readonly logStdoutStream: rfs.RotatingFileStream
  private readonly logStderrStream: rfs.RotatingFileStream

  public constructor(private currentVersion: string) {
    super()

    // ...

    const opts = {
      size: "10M",
      maxFiles: 10,
      path: path.join(paths.data, "coder-logs"),
    }
    this.logStdoutStream = rfs.createStream("code-server-stdout.log", opts)
    this.logStderrStream = rfs.createStream("code-server-stderr.log", opts)

    this.onDispose(() => this.disposeChild())
    // NOTE: logStdoutStream and logStderrStream are never closed!
  }
}
```

**Problems**:

- File streams not closed in `disposeChild()` or via `onDispose`
- File descriptors leak on shutdown
- Rotating stream might hold locks
- Buffered data might not flush

**Risk**: Medium - File descriptor exhaustion, data loss

**Recommendation**:

```typescript
export class ParentProcess extends Process {
  private readonly logStdoutStream: rfs.RotatingFileStream
  private readonly logStderrStream: rfs.RotatingFileStream

  public constructor(private currentVersion: string) {
    super()

    const opts = {
      size: "10M",
      maxFiles: 10,
      path: path.join(paths.data, "coder-logs"),
    }
    this.logStdoutStream = rfs.createStream("code-server-stdout.log", opts)
    this.logStderrStream = rfs.createStream("code-server-stderr.log", opts)

    // Properly handle disposal
    this.onDispose(async () => {
      await this.disposeChild()
      await this.closeLogStreams()
    })
  }

  private async closeLogStreams(): Promise<void> {
    return new Promise((resolve) => {
      let closed = 0
      const checkDone = () => {
        if (++closed === 2) resolve()
      }

      // Close streams properly
      this.logStdoutStream.end(() => checkDone())
      this.logStderrStream.end(() => checkDone())

      // Timeout in case streams hang
      setTimeout(resolve, 5000)
    })
  }

  private async disposeChild(): Promise<void> {
    this.started = undefined
    if (this.child) {
      const child = this.child
      child.removeAllListeners()
      child.kill("SIGTERM")

      // Wait for graceful termination
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          child.kill("SIGKILL") // Force kill if needed
          resolve()
        }, 5000)

        child.once("exit", () => {
          clearTimeout(timeout)
          resolve()
        })
      })
    }
  }
}
```

---

### 4.3 Idle Timeout Timer Management

**File**: `/home/user/vscode-web-main/src/node/main.ts` (Lines 170-189)

**Issue**: Idle timeout timer management has races:

```typescript
if (args["idle-timeout-seconds"]) {
  let idleShutdownTimer: NodeJS.Timeout | undefined

  const startIdleShutdownTimer = () => {
    idleShutdownTimer = setTimeout(() => {
      logger.warn(`Idle timeout of ${args["idle-timeout-seconds"]} seconds exceeded`)
      wrapper.exit(0)
    }, args["idle-timeout-seconds"]! * 1000)
  }

  startIdleShutdownTimer()

  heart.onChange((state) => {
    clearTimeout(idleShutdownTimer)
    if (state === "expired") {
      startIdleShutdownTimer()
    }
  }) // No unsubscribe mechanism!
}
```

**Problems**:

- Listener added to heart.onChange but never removed
- If heart is disposed, listener still exists
- Multiple timers created but previous not always cleared
- Race condition: state could be "expired" twice

**Risk**: Medium - Memory leak, potential double exit

**Recommendation**:

```typescript
if (args["idle-timeout-seconds"]) {
  let idleShutdownTimer: NodeJS.Timeout | undefined
  let isShuttingDown = false

  const startIdleShutdownTimer = () => {
    clearTimeout(idleShutdownTimer)
    idleShutdownTimer = setTimeout(async () => {
      if (isShuttingDown) return
      isShuttingDown = true

      logger.warn(`Idle timeout of ${args["idle-timeout-seconds"]} seconds exceeded`)
      try {
        await disposeRoutes()
      } catch (e) {
        logger.error("Error during disposal:", e)
      }
      wrapper.exit(0)
    }, args["idle-timeout-seconds"]! * 1000)
  }

  startIdleShutdownTimer()

  const heartbeatDisposer = heart.onChange((state) => {
    if (state === "expired") {
      startIdleShutdownTimer()
    } else if (state === "alive") {
      clearTimeout(idleShutdownTimer)
      idleShutdownTimer = undefined
    }
  })

  // Clean up listener on shutdown
  disposeRoutes = (() => {
    const original = disposeRoutes
    return async () => {
      heartbeatDisposer.dispose()
      clearTimeout(idleShutdownTimer)
      return original()
    }
  })()
}
```

---

## 5. ADDITIONAL CRITICAL ISSUES

### 5.1 Socket Proxy Memory Leak

**File**: `/home/user/vscode-web-main/src/node/socket.ts` (Lines 44-75)

**Issue**: Promise never resolves in error cases:

```typescript
return new Promise((resolve, reject) => {
  const id = generateUuid()
  const proxy = net.connect(this.proxyPipe)
  proxy.once("connect", () => proxy.write(id))

  const timeout = setTimeout(() => {
    listener.dispose()
    socket.destroy()
    proxy.destroy()
    reject(new Error("TLS socket proxy timed out"))
  }, this.proxyTimeout)

  const listener = this.onProxyConnect.event((connection) => {
    connection.once("data", (data) => {
      if (!socket.destroyed && !proxy.destroyed && data.toString() === id) {
        clearTimeout(timeout)
        listener.dispose()
        // Sets up pipes
        ;[
          [proxy, socket],
          [socket, proxy],
        ].forEach(([a, b]) => {
          a.pipe(b)
          a.on("error", () => b.destroy())
          a.on("close", () => b.destroy())
          a.on("end", () => b.end())
        })
        resolve(connection)
      }
    })
  })
})
```

**Problems**:

- If `proxy.write(id)` fails silently, nothing happens
- If connection data doesn't match ID, listener never cleaned up
- Stream errors in pipe not propagated to promise
- Multiple destroy calls possible

**Risk**: High - Hanging promises, resource leaks

---

### 5.2 Unhandled Promise Rejections in Routes

**File**: `/home/user/vscode-web-main/src/node/routes/index.ts` (Lines 68-70)

**Issue**: heart.beat() called without awaiting:

```typescript
const common: express.RequestHandler = (req, _, next) => {
  if (!/^\/healthz\/?$/.test(req.url)) {
    // NOTE: intentionally not awaiting - can error silently
    heart.beat() // Promise rejection unhandled!
  }
  next()
}
```

**Problems**:

- Unhandled promise rejections crash process in Node.js
- heart.beat() can throw (file write errors)
- No error logging for these failures

**Risk**: Critical - Process crashes

**Recommendation**:

```typescript
const common: express.RequestHandler = (req, _, next) => {
  if (!/^\/healthz\/?$/.test(req.url)) {
    // Fire and forget with error handling
    heart.beat().catch((err) => {
      logger.warn("Failed to beat heart:", err.message)
    })
  }
  next()
}
```

---

## Summary of Critical Issues

| Issue                          | Severity | Type    | File              | Impact                          |
| ------------------------------ | -------- | ------- | ----------------- | ------------------------------- |
| Event Listener Cleanup         | High     | Memory  | `emitter.ts`      | Memory bloat in error scenarios |
| Session Store Unbounded Growth | Critical | Memory  | `SessionStore.ts` | Out of memory under load        |
| Async Crypto Operations        | High     | CPU     | `util.ts`         | CPU bottleneck on login         |
| Audit Log Full File Reads      | Critical | I/O     | `AuditLogger.ts`  | OOM on large logs               |
| File Descriptor Leaks          | Medium   | Process | `wrapper.ts`      | Exhaustion, data loss           |
| Unhandled Promise Rejections   | Critical | Process | `routes/index.ts` | Process crashes                 |
| Idle Timeout Memory Leak       | Medium   | Memory  | `main.ts`         | Listener accumulation           |
| Redis Session Updates O(n)     | High     | I/O     | `SessionStore.ts` | Latency with many sessions      |

---

## Recommended Implementation Priority

1. **Phase 1 (Immediate - Next 1-2 weeks)**:
   - Fix unhandled promise rejections (critical stability)
   - Implement session store memory limits
   - Add process disposal cleanup

2. **Phase 2 (Short-term - 2-4 weeks)**:
   - Move password hashing to worker pool
   - Implement audit log streaming queries
   - Cache static files

3. **Phase 3 (Medium-term - 1-2 months)**:
   - Optimize Redis session operations
   - Add buffer pooling for I/O
   - Implement connection timeouts and limits

4. **Phase 4 (Long-term - ongoing)**:
   - Add comprehensive monitoring
   - Implement metrics collection
   - Load testing and profiling
