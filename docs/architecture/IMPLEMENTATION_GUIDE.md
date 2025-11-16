instrument# Multi-User Implementation Guide

## VSCode Web IDE - Step-by-Step Integration

**Last Updated:** 2025-11-15
**Version:** 1.0

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Phase 1: Directory-Based Multi-User](#phase-1-directory-based-multi-user)
4. [Integration Steps](#integration-steps)
5. [Database Schema](#database-schema)
6. [Example Usage](#example-usage)
7. [Testing](#testing)
8. [Migration](#migration)
9. [Troubleshooting](#troubleshooting)

---

## 1. Overview

This guide shows how to integrate the multi-user system into the existing VSCode Web IDE codebase.

**What we're building:**

- ✅ Single-user mode (backward compatible, default)
- ✅ Multi-user mode with session management
- ✅ Directory-based user isolation
- ✅ SQLite user database
- ✅ In-memory session store (Redis-ready)
- ✅ Audit logging
- ✅ Admin API

---

## 2. Prerequisites

### Dependencies

Add to `package.json`:

```json
{
  "dependencies": {
    "argon2": "^0.31.0",
    "js-yaml": "^4.1.0"
  },
  "devDependencies": {
    "@types/js-yaml": "^4.0.9"
  }
}
```

### Directory Structure

Create the following directories:

```bash
mkdir -p src/node/services/auth
mkdir -p src/node/services/session
mkdir -p src/node/services/isolation
mkdir -p src/node/services/audit
mkdir -p src/node/services/config
mkdir -p src/node/services/database
```

---

## 3. Phase 1: Directory-Based Multi-User

### Architecture

```
┌─────────────────────────────────────────┐
│     Express App (existing)              │
├─────────────────────────────────────────┤
│  • Add deployment mode check            │
│  • Add multi-user middleware            │
│  • Add user routes (/api/users)         │
│  • Modify auth routes (/login)          │
└─────────────────────────────────────────┘
             │
             v
┌─────────────────────────────────────────┐
│     Multi-User Services (new)           │
├─────────────────────────────────────────┤
│  • AuthService                          │
│  • SessionStore (Memory/Redis)          │
│  • UserRepository (Database)            │
│  • UserIsolationManager (Directory)     │
│  • AuditLogger (File/Database)          │
└─────────────────────────────────────────┘
             │
             v
┌─────────────────────────────────────────┐
│     Storage Layer                       │
├─────────────────────────────────────────┤
│  • SQLite (users.db)                    │
│  • User directories (/data/users/{id})  │
│  • Audit logs (/var/log/audit/)         │
└─────────────────────────────────────────┘
```

---

## 4. Integration Steps

### Step 1: Create Database Helper

Create `src/node/services/database/SQLiteDatabase.ts`:

```typescript
import sqlite3 from "sqlite3"
import { promisify } from "util"

export class SQLiteDatabase {
  private db: sqlite3.Database

  constructor(private dbPath: string) {}

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  async query(sql: string, params: any[] = []): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err)
        else resolve(rows || [])
      })
    })
  }

  async execute(sql: string, params: any[] = []): Promise<{ affectedRows: number; lastInsertId?: string }> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) reject(err)
        else resolve({ affectedRows: this.changes, lastInsertId: this.lastID?.toString() })
      })
    })
  }

  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  async initSchema(): Promise<void> {
    // Create users table
    await this.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        roles TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_login TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        metadata TEXT NOT NULL DEFAULT '{}'
      )
    `)

    // Create sessions table
    await this.execute(`
      CREATE TABLE IF NOT EXISTS sessions (
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
      )
    `)

    // Create audit_events table
    await this.execute(`
      CREATE TABLE IF NOT EXISTS audit_events (
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
      )
    `)

    // Create indexes
    await this.execute("CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)")
    await this.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)")
    await this.execute("CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)")
    await this.execute("CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)")
    await this.execute("CREATE INDEX IF NOT EXISTS idx_audit_user_id ON audit_events(user_id)")
    await this.execute("CREATE INDEX IF NOT EXISTS idx_audit_event_type ON audit_events(event_type)")
    await this.execute("CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_events(timestamp)")

    console.log("Database schema initialized")
  }
}
```

### Step 2: Create Multi-User Service Container

Create `src/node/services/MultiUserService.ts`:

```typescript
import { AuthService } from "./auth/AuthService"
import { SessionStore } from "./session/SessionStore"
import { UserRepository, MemoryUserRepository, DatabaseUserRepository } from "./auth/UserRepository"
import { IsolationStrategy, DirectoryIsolationStrategy } from "./isolation/UserIsolationManager"
import { AuditLogger, FileAuditLogger, DatabaseAuditLogger, CompositeAuditLogger } from "./audit/AuditLogger"
import { MultiUserConfig, SessionStoreType } from "./types"
import { SQLiteDatabase } from "./database/SQLiteDatabase"
import { MemorySessionStore, RedisSessionStore, DatabaseSessionStore } from "./session/SessionStore"

export class MultiUserService {
  public authService: AuthService
  public sessionStore: SessionStore
  public userRepository: UserRepository
  public isolationStrategy: IsolationStrategy
  public auditLogger: AuditLogger

  private db?: SQLiteDatabase

  private constructor(
    authService: AuthService,
    sessionStore: SessionStore,
    userRepository: UserRepository,
    isolationStrategy: IsolationStrategy,
    auditLogger: AuditLogger,
    db?: SQLiteDatabase,
  ) {
    this.authService = authService
    this.sessionStore = sessionStore
    this.userRepository = userRepository
    this.isolationStrategy = isolationStrategy
    this.auditLogger = auditLogger
    this.db = db
  }

  static async create(config: MultiUserConfig): Promise<MultiUserService> {
    let db: SQLiteDatabase | undefined
    let userRepo: UserRepository
    let sessionStore: SessionStore
    let auditLogger: AuditLogger

    // Initialize database if needed
    if (config.auth.database && config.auth.database.type === "sqlite") {
      db = new SQLiteDatabase(config.auth.database.path!)
      await db.connect()
      await db.initSchema()

      userRepo = new DatabaseUserRepository(db)
      sessionStore =
        config.auth.session.store === SessionStoreType.Database
          ? new DatabaseSessionStore(db)
          : new MemorySessionStore()

      // Composite audit logger (file + database)
      const fileLogger = new FileAuditLogger({
        logDir: "/var/log/code-server/audit",
        rotateDaily: true,
      })
      const dbLogger = new DatabaseAuditLogger(db)
      auditLogger = new CompositeAuditLogger([fileLogger, dbLogger])
    } else {
      // In-memory for development
      userRepo = new MemoryUserRepository()
      sessionStore = new MemorySessionStore()
      auditLogger = new FileAuditLogger({
        logDir: "/tmp/code-server/audit",
        rotateDaily: true,
      })
    }

    // Create isolation strategy
    const isolationStrategy = new DirectoryIsolationStrategy({
      basePath: config.isolation.basePath,
      defaultLimits: config.limits,
    })

    // Create auth service
    const authService = new AuthService(userRepo, sessionStore, auditLogger, {
      sessionTTL: config.auth.session.ttl,
      maxSessionsPerUser: config.limits.maxSessionsPerUser,
      passwordMinLength: 8,
      requireStrongPassword: true,
    })

    return new MultiUserService(authService, sessionStore, userRepo, isolationStrategy, auditLogger, db)
  }

  async close(): Promise<void> {
    await this.authService.close()
    if (this.db) {
      await this.db.close()
    }
  }
}
```

### Step 3: Modify Main Entry Point

Update `src/node/main.ts`:

```typescript
import { MultiUserConfigLoader } from "./services/config/MultiUserConfig"
import { MultiUserService } from "./services/MultiUserService"
import { DeploymentMode } from "./services/types"

let multiUserService: MultiUserService | null = null

export async function runCodeServer(args: DefaultedArgs): Promise<Server> {
  // Load multi-user config
  const multiUserConfig = await MultiUserConfigLoader.load(args)

  if (multiUserConfig) {
    console.log("Starting in MULTI-USER mode")
    multiUserService = await MultiUserService.create(multiUserConfig)

    // Create initial admin user if needed
    const adminUsername = process.env.ADMIN_USERNAME || "admin"
    const adminEmail = process.env.ADMIN_EMAIL || "admin@example.com"
    const adminPassword = process.env.ADMIN_PASSWORD || generateRandomPassword()

    await MultiUserConfigLoader.createInitialAdmin(multiUserService.authService, {
      username: adminUsername,
      email: adminEmail,
      password: adminPassword,
    })

    console.log(`Initial admin credentials:`)
    console.log(`  Username: ${adminUsername}`)
    console.log(`  Password: ${adminPassword}`)
    console.log(`  (Change password after first login!)`)
  } else {
    console.log("Starting in SINGLE-USER mode")
  }

  // Create app with multi-user service
  const { server, dispose } = await createApp(args, multiUserService)

  // ... existing code ...

  return server
}

function generateRandomPassword(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()"
  return Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
}
```

### Step 4: Update App Creation

Modify `src/node/app.ts`:

```typescript
import { MultiUserService } from "./services/MultiUserService"

export async function createApp(args: DefaultedArgs, multiUserService?: MultiUserService | null): Promise<App> {
  // ... existing code ...

  // Inject multi-user service into request
  if (multiUserService) {
    router.use((req: any, res, next) => {
      req.multiUser = multiUserService
      next()
    })
  }

  // ... existing code ...
}
```

### Step 5: Update Login Route

Modify `src/node/routes/login.ts`:

```typescript
export async function handleLogin(req: express.Request, res: express.Response): Promise<void> {
  const multiUserService = (req as any).multiUser

  if (multiUserService) {
    // Multi-user login
    const { username, password } = req.body

    try {
      const loginResponse = await multiUserService.authService.login(username, password, {
        ipAddress: req.ip || "unknown",
        userAgent: req.headers["user-agent"] || "unknown",
      })

      // Set session cookie
      res.cookie(CookieKeys.Session, loginResponse.token, {
        httpOnly: true,
        secure: !!args.cert,
        sameSite: "lax",
        maxAge: loginResponse.expiresAt.getTime() - Date.now(),
      })

      res.json({
        success: true,
        user: loginResponse.user,
      })
    } catch (err) {
      res.status(401).json({
        success: false,
        error: err.message,
      })
    }
  } else {
    // Single-user login (existing code)
    // ... existing code ...
  }
}
```

### Step 6: Add User Management API

Create `src/node/routes/users.ts`:

```typescript
import express from "express"
import { MultiUserService } from "../services/MultiUserService"
import { UserRole } from "../services/types"

export function registerUserRoutes(router: express.Router): void {
  // Middleware to require authentication
  const requireAuth = async (req: any, res: express.Response, next: express.NextFunction) => {
    const multiUser = req.multiUser as MultiUserService
    if (!multiUser) {
      return res.status(500).json({ error: "Multi-user mode not enabled" })
    }

    const token = req.cookies["coder.sid"]
    if (!token) {
      return res.status(401).json({ error: "Not authenticated" })
    }

    const sessionInfo = await multiUser.authService.getSessionInfo(token)
    if (!sessionInfo) {
      return res.status(401).json({ error: "Invalid session" })
    }

    req.user = sessionInfo.user
    req.session = sessionInfo.session
    next()
  }

  // Middleware to require admin role
  const requireAdmin = (req: any, res: express.Response, next: express.NextFunction) => {
    if (!req.user || !req.user.roles.includes(UserRole.Admin)) {
      return res.status(403).json({ error: "Admin access required" })
    }
    next()
  }

  // Get current user
  router.get("/api/users/me", requireAuth, async (req: any, res) => {
    res.json({ user: req.user })
  })

  // List all users (admin only)
  router.get("/api/users", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const multiUser = req.multiUser as MultiUserService
      const users = await multiUser.authService.listUsers()
      res.json({ users })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // Create user (admin only)
  router.post("/api/users", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const multiUser = req.multiUser as MultiUserService
      const { username, email, password, roles } = req.body

      const user = await multiUser.authService.createUser({
        username,
        email,
        password,
        roles,
      })

      // Initialize user environment
      await multiUser.isolationStrategy.initializeUserEnvironment(user.id)

      res.json({ user })
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  })

  // Update user (admin only)
  router.put("/api/users/:userId", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const multiUser = req.multiUser as MultiUserService
      const { userId } = req.params
      const updates = req.body

      const user = await multiUser.authService.updateUser(userId, updates)
      res.json({ user })
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  })

  // Delete user (admin only)
  router.delete("/api/users/:userId", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const multiUser = req.multiUser as MultiUserService
      const { userId } = req.params

      await multiUser.authService.deleteUser(userId)
      await multiUser.isolationStrategy.destroyUserEnvironment(userId)

      res.json({ success: true })
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  })

  // Get user sessions
  router.get("/api/users/me/sessions", requireAuth, async (req: any, res) => {
    try {
      const multiUser = req.multiUser as MultiUserService
      const sessions = await multiUser.authService.getActiveSessions(req.user.id)
      res.json({ sessions })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // Revoke session
  router.delete("/api/users/me/sessions/:sessionId", requireAuth, async (req: any, res) => {
    try {
      const multiUser = req.multiUser as MultiUserService
      const { sessionId } = req.params
      await multiUser.authService.revokeSession(sessionId)
      res.json({ success: true })
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  })

  // Get resource usage
  router.get("/api/users/me/usage", requireAuth, async (req: any, res) => {
    try {
      const multiUser = req.multiUser as MultiUserService
      const usage = await multiUser.isolationStrategy.getResourceUsage(req.user.id)
      res.json({ usage })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })
}
```

### Step 7: Register Routes

Update `src/node/routes/index.ts`:

```typescript
import { registerUserRoutes } from "./users"

export async function register(app: App, args: DefaultedArgs): Promise<void> {
  // ... existing code ...

  // Register user management routes if multi-user mode
  if ((app.router as any).multiUser) {
    registerUserRoutes(app.router)
  }

  // ... existing code ...
}
```

---

## 5. Database Schema

The SQLite database schema is automatically created with these tables:

### Users Table

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

### Sessions Table

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

### Audit Events Table

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

## 6. Example Usage

### Configuration File

Create `.code-server.yaml`:

```yaml
# Deployment mode
deployment-mode: multi # single | multi

# Multi-user configuration
multi-user:
  auth:
    provider: database
    database:
      type: sqlite
      path: /var/lib/code-server/users.db
    session:
      store: memory # memory | redis | database
      ttl: 86400 # 24 hours

  isolation:
    strategy: directory
    base-path: /var/lib/code-server/users

  limits:
    max-sessions-per-user: 5
    max-concurrent-connections: 100
    storage-quota-mb: 5000
    memory-limit-mb: 2048
    cpu-limit-percent: 50

  features:
    audit-logging: true
    usage-analytics: false
    admin-dashboard: true
```

### Starting the Server

```bash
# Single-user mode (default)
code-server

# Multi-user mode with config file
code-server --multi-user-config=.code-server.yaml

# Multi-user mode with environment variables
export CODE_SERVER_DEPLOYMENT_MODE=multi
export CODE_SERVER_DB_PATH=/var/lib/code-server/users.db
export ADMIN_USERNAME=admin
export ADMIN_PASSWORD=SecurePassword123!
code-server
```

### API Examples

```bash
# Login
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"SecurePassword123!"}'

# Create user (admin)
curl -X POST http://localhost:3000/api/users \
  -H "Cookie: coder.sid=<session-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "username":"alice",
    "email":"alice@example.com",
    "password":"AlicePass123!",
    "roles":["user"]
  }'

# List users
curl http://localhost:3000/api/users \
  -H "Cookie: coder.sid=<session-token>"

# Get current user
curl http://localhost:3000/api/users/me \
  -H "Cookie: coder.sid=<session-token>"

# Get resource usage
curl http://localhost:3000/api/users/me/usage \
  -H "Cookie: coder.sid=<session-token>"

# List active sessions
curl http://localhost:3000/api/users/me/sessions \
  -H "Cookie: coder.sid=<session-token>"

# Revoke session
curl -X DELETE http://localhost:3000/api/users/me/sessions/<session-id> \
  -H "Cookie: coder.sid=<session-token>"
```

---

## 7. Testing

### Unit Tests

Create `test/multi-user.test.ts`:

```typescript
import { AuthService } from "../src/node/services/auth/AuthService"
import { MemoryUserRepository } from "../src/node/services/auth/UserRepository"
import { MemorySessionStore } from "../src/node/services/session/SessionStore"
import { UserRole } from "../src/node/services/types"

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
      roles: [UserRole.User],
    })

    expect(user.username).toBe("testuser")
    expect(user.email).toBe("test@example.com")
  })

  it("should authenticate user", async () => {
    await authService.createUser({
      username: "testuser",
      email: "test@example.com",
      password: "Password123!",
    })

    const loginResponse = await authService.login("testuser", "Password123!", {
      ipAddress: "127.0.0.1",
      userAgent: "test",
    })

    expect(loginResponse.token).toBeDefined()
    expect(loginResponse.user.username).toBe("testuser")
  })

  it("should reject invalid password", async () => {
    await authService.createUser({
      username: "testuser",
      email: "test@example.com",
      password: "Password123!",
    })

    await expect(
      authService.login("testuser", "wrongpassword", {
        ipAddress: "127.0.0.1",
        userAgent: "test",
      }),
    ).rejects.toThrow("Invalid username or password")
  })
})
```

---

## 8. Migration

### Migrating from Single-User to Multi-User

```bash
#!/bin/bash
# migrate-to-multiuser.sh

# 1. Backup existing data
echo "Backing up existing data..."
cp -r ~/.local/share/code-server ~/.local/share/code-server.backup
cp -r ~/.config/code-server ~/.config/code-server.backup

# 2. Create multi-user directories
echo "Creating multi-user directories..."
sudo mkdir -p /var/lib/code-server/users
sudo chown $(whoami):$(whoami) /var/lib/code-server/users

# 3. Create configuration
echo "Creating configuration..."
cat > .code-server.yaml <<EOF
deployment-mode: multi
multi-user:
  auth:
    provider: database
    database:
      type: sqlite
      path: /var/lib/code-server/users.db
    session:
      store: memory
      ttl: 86400
  isolation:
    strategy: directory
    base-path: /var/lib/code-server/users
  limits:
    max-sessions-per-user: 5
    storage-quota-mb: 5000
  features:
    audit-logging: true
EOF

# 4. Start server (will create admin user)
echo "Starting server..."
export ADMIN_USERNAME=admin
export ADMIN_EMAIL=admin@localhost
export ADMIN_PASSWORD=AdminPassword123!
code-server --multi-user-config=.code-server.yaml

# 5. Migrate existing data to admin user (manual step)
echo "To migrate your existing data to the admin user:"
echo "  sudo cp -r ~/.local/share/code-server/* /var/lib/code-server/users/\$(admin-user-id)/data/"
```

---

## 9. Troubleshooting

### Issue: "Database locked"

**Solution:** SQLite doesn't handle concurrent writes well. Use PostgreSQL or ensure single-threaded access.

### Issue: "Permission denied" on user directories

**Solution:** Check directory permissions and ownership.

```bash
sudo chown -R code-server:code-server /var/lib/code-server/users
sudo chmod 700 /var/lib/code-server/users/*
```

### Issue: "Session not found" after restart

**Solution:** Sessions are stored in memory by default. Use Redis or database session store for persistence.

### Issue: "Storage quota exceeded"

**Solution:** Increase quota in configuration or clean up user files.

```bash
# Check user storage
du -sh /var/lib/code-server/users/*

# Clean up old logs
find /var/lib/code-server/users/*/logs -mtime +30 -delete
```

---

**Ready to implement!** Start with Step 1 and work through each integration step sequentially.
