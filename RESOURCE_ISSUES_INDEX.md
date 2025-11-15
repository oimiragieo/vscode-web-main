# Resource Management Issues - Quick Index

## All Issues by Severity and Location

### CRITICAL - Fix This Week

| #   | Issue                          | File                                        | Lines  | Risk            | Est. Time |
| --- | ------------------------------ | ------------------------------------------- | ------ | --------------- | --------- |
| 1   | Unhandled Promise Rejections   | `src/node/routes/index.ts`                  | 68-70  | Process crashes | 30 min    |
| 2   | Session Store Unbounded Growth | `src/node/services/session/SessionStore.ts` | 35-167 | OOM crashes     | 2-3 hrs   |
| 3   | Audit Log Full File Reads      | `src/node/services/audit/AuditLogger.ts`    | 75-135 | OOM, slow       | 4-5 hrs   |

### HIGH - Fix This Sprint

| #   | Issue                      | File                                        | Lines   | Risk          | Est. Time |
| --- | -------------------------- | ------------------------------------------- | ------- | ------------- | --------- |
| 4   | Password Hashing CPU       | `src/node/util.ts`                          | 143-175 | CPU maxes     | 3-4 hrs   |
| 5   | File Descriptor Leaks      | `src/node/wrapper.ts`                       | 227-254 | FD exhaustion | 1-2 hrs   |
| 6   | Redis Session O(n) Updates | `src/node/services/session/SessionStore.ts` | 200-216 | High latency  | 2-3 hrs   |

### MEDIUM - Fix Next 2 Sprints

| #   | Issue                      | File                       | Lines   | Risk              | Est. Time |
| --- | -------------------------- | -------------------------- | ------- | ----------------- | --------- |
| 7   | Event Listener Cleanup     | `src/common/emitter.ts`    | 41-56   | Memory bloat      | 2 hrs     |
| 8   | Child Process Cleanup      | `src/node/wrapper.ts`      | 154-173 | Hanging processes | 1-2 hrs   |
| 9   | Idle Timeout Listener Leak | `src/node/main.ts`         | 170-189 | Memory leak       | 1 hr      |
| 10  | Static File Caching        | `src/node/routes/index.ts` | 95-105  | Unnecessary I/O   | 1-2 hrs   |

### LOW - Fix Later

| #   | Issue                   | File                       | Lines   | Risk  | Est. Time |
| --- | ----------------------- | -------------------------- | ------- | ----- | --------- |
| 11  | HTTP Socket Disposer    | `src/node/http.ts`         | 250-295 | Minor | 2 hrs     |
| 12  | Buffer Concatenation    | `src/node/update.ts`       | 84-98   | Minor | 1 hr      |
| 13  | JSON Parsing Efficiency | `src/node/vscodeSocket.ts` | 155-183 | Minor | 1 hr      |
| 14  | Regex ReDoS Protection  | `src/node/util.ts`         | 20-24   | DoS   | 1-2 hrs   |

---

## Issue Details

### #1: Unhandled Promise Rejections

**File**: `src/node/routes/index.ts:68-70`  
**Severity**: CRITICAL  
**Category**: Process Management

**Problem**:

```typescript
heart.beat() // Promise rejection unhandled!
```

**Impact**: Process crashes on file write errors

**Fix**:

```typescript
heart.beat().catch((err) => {
  logger.warn("Failed to beat heart:", err.message)
})
```

---

### #2: Session Store Unbounded Growth

**File**: `src/node/services/session/SessionStore.ts:35-167`  
**Severity**: CRITICAL  
**Category**: Memory Management

**Problem**:

```typescript
this.cleanupInterval = setInterval(() => {
  this.deleteExpiredSessions().catch((err) => {
    console.error("Failed to clean up:", err)
  })
}, cleanupIntervalSeconds * 1000)
```

**Issues**:

- No memory pressure monitoring
- Cleanup can silently fail
- User sessions map unbounded
- No LRU eviction

**Fix**: Add memory monitoring, hard limits, LRU eviction  
**Estimated Time**: 2-3 hours

---

### #3: Audit Log Full File Reads

**File**: `src/node/services/audit/AuditLogger.ts:75-135`  
**Severity**: CRITICAL  
**Category**: I/O Optimization

**Problem**:

```typescript
const content = await fs.readFile(logFile, "utf-8") // Entire file in memory
const lines = content.split("\n") // Copy + split
for (const line of lines) {
  // Filter in app code
  if (filter.userId && event.userId !== filter.userId) continue
}
```

**Issues**:

- Entire files in memory
- String copies and splits
- No early termination
- No database indexing

**Fix**: Implement streaming with early termination  
**Estimated Time**: 4-5 hours

---

### #4: Password Hashing CPU Bottleneck

**File**: `src/node/util.ts:143-175`  
**Severity**: HIGH  
**Category**: CPU Optimization

**Problem**:

```typescript
case "PLAIN_TEXT": {
  const isValid = safeCompare(passwordFromRequestBody, passwordFromArgs) : false
  const hashedPassword = await hash(passwordFromRequestBody)  // Blocking hash
  // ...
}
```

**Issues**:

- Argon2 hashing in main thread
- Blocks all requests during hash
- No worker pool
- Multiple hashes per request

**Fix**: Implement worker thread pool  
**Estimated Time**: 3-4 hours

---

### #5: File Descriptor Leaks

**File**: `src/node/wrapper.ts:227-254`  
**Severity**: HIGH  
**Category**: Process Management

**Problem**:

```typescript
this.logStdoutStream = rfs.createStream("code-server-stdout.log", opts)
this.logStderrStream = rfs.createStream("code-server-stderr.log", opts)
// Never closed!
this.onDispose(() => this.disposeChild()) // Child disposed, not streams
```

**Issues**:

- Streams never closed
- FDs never released
- Data might not flush
- Locks on log files

**Fix**: Close streams in onDispose  
**Estimated Time**: 1-2 hours

---

### #6: Redis Session O(n) Updates

**File**: `src/node/services/session/SessionStore.ts:200-216`  
**Severity**: HIGH  
**Category**: I/O Optimization

**Problem**:

```typescript
async set(sessionId: string, session: Session, ttl?: number): Promise<void> {
  // ...
  const userKey = this.getUserKey(session.userId)
  const userSessions = await this.getUserSessions(session.userId)  // Fetch all!
  userSessions.push(session)
  await this.redis.set(userKey, JSON.stringify(userSessions.map((s) => s.id)))  // Rebuild!
}
```

**Issues**:

- O(n) fetch on every session creation
- JSON stringify on every operation
- No atomic operations
- Race conditions possible

**Fix**: Use Redis sorted sets with pipeline  
**Estimated Time**: 2-3 hours

---

### #7: Event Listener Cleanup

**File**: `src/common/emitter.ts:41-56`  
**Severity**: MEDIUM  
**Category**: Memory Management

**Problem**:

```typescript
public async emit(value: T): Promise<void> {
  let resolve: () => void
  const promise = new Promise<void>((r) => (resolve = r))

  await Promise.all(
    this.listeners.map(async (cb) => {
      try {
        await cb(value, promise)
      } catch (error: any) {
        logger.error(error.message)  // Silent error
      }
    }),
  )

  resolve!()  // Can fail with non-null assertion
}
```

**Issues**:

- No timeout for hanging listeners
- Silent error handling
- Non-null assertion can fail
- No listener removal on error

**Fix**: Add timeout, use allSettled, error handling  
**Estimated Time**: 2 hours

---

### #8: Child Process Cleanup

**File**: `src/node/wrapper.ts:154-173`  
**Severity**: MEDIUM  
**Category**: Process Management

**Problem**:

```typescript
setInterval(() => {
  try {
    process.kill(this.parentPid, 0)
  } catch (_) {
    this.logger.error(`parent process ${parentPid} died`)
    this._onDispose.emit(undefined)
  }
}, 5000) // No handle to clear!
```

**Issues**:

- Interval never cleared
- Continues after disposal
- No graceful shutdown
- Prevents process exit

**Fix**: Store interval, clear in onDispose  
**Estimated Time**: 1-2 hours

---

### #9: Idle Timeout Listener Leak

**File**: `src/node/main.ts:170-189`  
**Severity**: MEDIUM  
**Category**: Memory Management

**Problem**:

```typescript
heart.onChange((state) => {
  clearTimeout(idleShutdownTimer)
  if (state === "expired") {
    startIdleShutdownTimer()
  }
}) // Listener never removed!
```

**Issues**:

- Listener never disposed
- Continues after heart disposed
- No unsubscribe mechanism
- Multiple timers possible

**Fix**: Store disposer, clean up on shutdown  
**Estimated Time**: 1 hour

---

### #10: Static File Caching

**File**: `src/node/routes/index.ts:95-105`  
**Severity**: MEDIUM  
**Category**: I/O Optimization

**Problem**:

```typescript
app.router.get(["/security.txt", "/.well-known/security.txt"], async (_, res) => {
  const resourcePath = path.resolve(rootPath, "src/browser/security.txt")
  res.set("Content-Type", getMediaMime(resourcePath))
  res.send(await fs.readFile(resourcePath)) // Read every request!
})
```

**Issues**:

- Static files read from disk every request
- No caching
- No etag headers
- Path resolution every request

**Fix**: Cache at startup with etag headers  
**Estimated Time**: 1-2 hours

---

### #11: HTTP Socket Disposer

**File**: `src/node/http.ts:250-295`  
**Severity**: LOW  
**Category**: Memory Management

**Problem**:

```typescript
export function disposer(server: http.Server): Disposable["dispose"] {
  const sockets = new Set<net.Socket>()
  // ...
  server.on("connection", (socket) => {
    sockets.add(socket)
    socket.on("close", () => {
      sockets.delete(socket)
    })
  })
}
```

**Issues**:

- Listener closure memory accumulation
- No socket timeout
- Hanging sockets not destroyed

**Fix**: Add timeouts, use once(), cleanup  
**Estimated Time**: 2 hours

---

### #12: Buffer Concatenation

**File**: `src/node/update.ts:84-98`  
**Severity**: LOW  
**Category**: Memory Management

**Problem**:

```typescript
response.on("data", (chunk) => {
  bufferLength += chunk.length
  chunks.push(chunk)
})
response.on("end", () => {
  resolve(Buffer.concat(chunks, bufferLength)) // Large concat
})
```

**Issues**:

- No size limits
- Large memory allocation
- No streaming

**Fix**: Add size limits, early termination  
**Estimated Time**: 1 hour

---

### #13: JSON Parsing Efficiency

**File**: `src/node/vscodeSocket.ts:155-183`  
**Severity**: LOW  
**Category**: I/O Optimization

**Problem**:

```typescript
let rawData = ""
res.on("data", (chunk) => {
  rawData += chunk // String concatenation!
})
res.on("end", () => {
  const obj = JSON.parse(rawData)
})
```

**Issues**:

- String accumulation (many copies)
- Full buffer in memory
- No streaming parser

**Fix**: Use buffer arrays, size limits  
**Estimated Time**: 1 hour

---

### #14: Regex ReDoS Protection

**File**: `src/node/util.ts:20-24`  
**Severity**: LOW  
**Category**: Security/CPU

**Problem**:

```typescript
const pattern = [
  "[\\u001B\\u009B][[\\]()#;?]*...", // Complex pattern
  "(?:(?:\\d{1,4}(?:;\\d{0,4})*)?...)",
].join("|")
const re = new RegExp(pattern, "g")

// Used in hot path:
callback(split[i].replace(re, ""), split[i]) // Every log line
```

**Issues**:

- Complex regex (ReDoS vulnerability)
- Called on every line
- No max line length check

**Fix**: Add line length check, timeout  
**Estimated Time**: 1-2 hours

---

## Implementation Checklist

### Phase 1: Critical (Week 1)

- [ ] #1: Fix unhandled heart.beat() promise
- [ ] #2: Add memory pressure to session store
- [ ] #3: Implement streaming audit logs

**Validation**:

- [ ] Process no longer crashes on heartbeat failures
- [ ] Heap usage stays below 80% with load test
- [ ] Audit queries complete in < 1 second

### Phase 2: Performance (Weeks 2-3)

- [ ] #4: Implement password hashing worker pool
- [ ] #5: Close log file streams on shutdown
- [ ] #6: Optimize Redis session updates
- [ ] #10: Cache static files

**Validation**:

- [ ] Login latency < 500ms under load
- [ ] No FD exhaustion warnings
- [ ] Session operations O(1) complexity
- [ ] Static files served from cache

### Phase 3: Cleanup (Week 4)

- [ ] #7: Add timeout to event emission
- [ ] #8: Clear child process monitoring interval
- [ ] #9: Remove idle timeout listeners
- [ ] #11-14: Additional optimizations

**Validation**:

- [ ] No listener leaks on load test
- [ ] Clean shutdown with no hanging processes
- [ ] Memory graph flat over time

---

## Validation Commands

```bash
# Monitor memory during load test
watch -n 1 'ps aux | grep node | head -1'

# Check file descriptors
lsof -p <pid> | wc -l

# Monitor heap
node --inspect app.js  # Use Chrome DevTools

# Load test
autocannon -c 100 -d 60 http://localhost:8080

# Check for listener leaks
grep -r "on(" src/node --include="*.ts" | grep -v "once(" | wc -l

# Check for unhandled promises
grep -r "await.*\." src/node --include="*.ts" | grep -v "\.catch" | head -20
```

---

## References

- Main Analysis: `RESOURCE_MANAGEMENT_ANALYSIS.md`
- Summary: `RESOURCE_MANAGEMENT_SUMMARY.md`
- Node.js Best Practices: https://nodejs.org/en/docs/guides/
- Memory Profiling: https://nodejs.org/en/docs/guides/simple-profiling/
- Worker Threads: https://nodejs.org/api/worker_threads.html
