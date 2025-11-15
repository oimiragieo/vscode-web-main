/**
 * Session store interface and implementations
 * Supports in-memory, Redis, and database-backed session storage
 */

import { Session } from "../types"

export interface SessionStore {
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

  // Lifecycle
  close(): Promise<void>
}

// ============================================================================
// In-Memory Session Store (for development/single-instance)
// ============================================================================

export class MemorySessionStore implements SessionStore {
  private sessions: Map<string, Session> = new Map()
  private userSessions: Map<string, Set<string>> = new Map()
  private cleanupInterval: NodeJS.Timeout | null = null

  // LRU IMPLEMENTATION: Prevent unbounded memory growth
  private accessOrder: Map<string, number> = new Map() // sessionId -> timestamp
  private readonly maxSessions: number
  private readonly evictionThreshold: number

  constructor(cleanupIntervalSeconds = 60, maxSessions = 10000, evictionThreshold = 0.9) {
    this.maxSessions = maxSessions
    this.evictionThreshold = evictionThreshold

    // Periodic cleanup of expired sessions
    this.cleanupInterval = setInterval(() => {
      this.deleteExpiredSessions().catch((err) => {
        console.error("Failed to clean up expired sessions:", err)
      })
    }, cleanupIntervalSeconds * 1000)
  }

  /**
   * Evict least recently used sessions when approaching memory limit
   * MEMORY LEAK FIX: Prevents OOM crashes from unbounded session growth
   */
  private async evictLRUSessions(): Promise<void> {
    const threshold = Math.floor(this.maxSessions * this.evictionThreshold)

    if (this.sessions.size >= threshold) {
      // Sort sessions by access time (oldest first)
      const sessionsByAccess = Array.from(this.accessOrder.entries()).sort((a, b) => a[1] - b[1])

      // Calculate how many to evict (25% of max to avoid frequent evictions)
      const toEvict = Math.floor(this.maxSessions * 0.25)

      // Evict oldest sessions
      for (let i = 0; i < toEvict && i < sessionsByAccess.length; i++) {
        const [sessionId] = sessionsByAccess[i]
        await this.delete(sessionId)
      }

      console.log(
        `[SessionStore] Evicted ${toEvict} LRU sessions. ` + `Current: ${this.sessions.size}/${this.maxSessions}`,
      )
    }
  }

  /**
   * Update access time for LRU tracking
   */
  private updateAccessTime(sessionId: string): void {
    this.accessOrder.set(sessionId, Date.now())
  }

  async set(sessionId: string, session: Session, ttl?: number): Promise<void> {
    // LRU: Evict old sessions if approaching limit
    await this.evictLRUSessions()

    this.sessions.set(sessionId, session)
    this.updateAccessTime(sessionId)

    // Track user → sessions mapping
    if (!this.userSessions.has(session.userId)) {
      this.userSessions.set(session.userId, new Set())
    }
    this.userSessions.get(session.userId)!.add(sessionId)
  }

  async get(sessionId: string): Promise<Session | null> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return null
    }

    // Check if expired
    if (session.expiresAt < new Date()) {
      await this.delete(sessionId)
      return null
    }

    // LRU: Update access time on read
    this.updateAccessTime(sessionId)

    return session
  }

  async delete(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (session) {
      this.sessions.delete(sessionId)
      this.accessOrder.delete(sessionId) // LRU: Clean up access tracking

      // Remove from user → sessions mapping
      const userSessionSet = this.userSessions.get(session.userId)
      if (userSessionSet) {
        userSessionSet.delete(sessionId)
        if (userSessionSet.size === 0) {
          this.userSessions.delete(session.userId)
        }
      }
    }
  }

  async exists(sessionId: string): Promise<boolean> {
    const session = await this.get(sessionId)
    return session !== null
  }

  async getUserSessions(userId: string): Promise<Session[]> {
    const sessionIds = this.userSessions.get(userId)
    if (!sessionIds) {
      return []
    }

    const sessions: Session[] = []
    for (const sessionId of sessionIds) {
      const session = await this.get(sessionId)
      if (session) {
        sessions.push(session)
      }
    }
    return sessions
  }

  async getAllActiveSessions(): Promise<Session[]> {
    const sessions: Session[] = []
    const now = new Date()

    for (const [, session] of this.sessions) {
      if (session.expiresAt > now) {
        sessions.push(session)
      }
    }
    return sessions
  }

  async deleteUserSessions(userId: string): Promise<number> {
    const sessionIds = this.userSessions.get(userId)
    if (!sessionIds) {
      return 0
    }

    let deleted = 0
    for (const sessionId of [...sessionIds]) {
      await this.delete(sessionId)
      deleted++
    }
    return deleted
  }

  async deleteExpiredSessions(): Promise<number> {
    const now = new Date()
    let deleted = 0

    for (const [sessionId, session] of this.sessions) {
      if (session.expiresAt < now) {
        await this.delete(sessionId)
        deleted++
      }
    }
    return deleted
  }

  async getSessionCount(): Promise<number> {
    return this.sessions.size
  }

  async getUserSessionCount(userId: string): Promise<number> {
    const userSessionSet = this.userSessions.get(userId)
    return userSessionSet ? userSessionSet.size : 0
  }

  async close(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    this.sessions.clear()
    this.userSessions.clear()
    this.accessOrder.clear() // LRU: Clean up access tracking
  }
}

// ============================================================================
// Redis Session Store (for production/distributed)
// ============================================================================

export interface RedisClient {
  get(key: string): Promise<string | null>
  set(key: string, value: string, options?: { EX?: number }): Promise<string | null>
  del(key: string | string[]): Promise<number>
  exists(key: string): Promise<number>
  keys(pattern: string): Promise<string[]>
  quit(): Promise<void>
}

export class RedisSessionStore implements SessionStore {
  private readonly keyPrefix: string

  constructor(
    private redis: RedisClient,
    keyPrefix = "session:",
  ) {
    this.keyPrefix = keyPrefix
  }

  private getKey(sessionId: string): string {
    return `${this.keyPrefix}${sessionId}`
  }

  private getUserKey(userId: string): string {
    return `${this.keyPrefix}user:${userId}`
  }

  async set(sessionId: string, session: Session, ttl?: number): Promise<void> {
    const key = this.getKey(sessionId)
    const value = JSON.stringify(session)

    // Calculate TTL from session expiration if not provided
    const ttlSeconds = ttl || Math.floor((session.expiresAt.getTime() - Date.now()) / 1000)

    if (ttlSeconds > 0) {
      await this.redis.set(key, value, { EX: ttlSeconds })

      // Add to user's session set
      const userKey = this.getUserKey(session.userId)
      const userSessions = await this.getUserSessions(session.userId)
      userSessions.push(session)
      await this.redis.set(userKey, JSON.stringify(userSessions.map((s) => s.id)), { EX: ttlSeconds })
    }
  }

  async get(sessionId: string): Promise<Session | null> {
    const key = this.getKey(sessionId)
    const value = await this.redis.get(key)

    if (!value) {
      return null
    }

    const session = JSON.parse(value) as Session

    // Convert date strings back to Date objects
    session.createdAt = new Date(session.createdAt)
    session.expiresAt = new Date(session.expiresAt)
    session.lastActivity = new Date(session.lastActivity)

    // Check if expired (Redis should handle this, but double-check)
    if (session.expiresAt < new Date()) {
      await this.delete(sessionId)
      return null
    }

    return session
  }

  async delete(sessionId: string): Promise<void> {
    const session = await this.get(sessionId)
    if (session) {
      const key = this.getKey(sessionId)
      await this.redis.del(key)

      // Remove from user's session set
      const userSessions = await this.getUserSessions(session.userId)
      const filtered = userSessions.filter((s) => s.id !== sessionId)
      const userKey = this.getUserKey(session.userId)

      if (filtered.length > 0) {
        await this.redis.set(userKey, JSON.stringify(filtered.map((s) => s.id)))
      } else {
        await this.redis.del(userKey)
      }
    }
  }

  async exists(sessionId: string): Promise<boolean> {
    const key = this.getKey(sessionId)
    const result = await this.redis.exists(key)
    return result === 1
  }

  async getUserSessions(userId: string): Promise<Session[]> {
    const userKey = this.getUserKey(userId)
    const value = await this.redis.get(userKey)

    if (!value) {
      return []
    }

    const sessionIds = JSON.parse(value) as string[]
    const sessions: Session[] = []

    for (const sessionId of sessionIds) {
      const session = await this.get(sessionId)
      if (session) {
        sessions.push(session)
      }
    }

    return sessions
  }

  async getAllActiveSessions(): Promise<Session[]> {
    const keys = await this.redis.keys(`${this.keyPrefix}*`)
    const sessions: Session[] = []

    for (const key of keys) {
      // Skip user index keys
      if (key.includes(":user:")) {
        continue
      }

      const sessionId = key.replace(this.keyPrefix, "")
      const session = await this.get(sessionId)
      if (session) {
        sessions.push(session)
      }
    }

    return sessions
  }

  async deleteUserSessions(userId: string): Promise<number> {
    const sessions = await this.getUserSessions(userId)
    let deleted = 0

    for (const session of sessions) {
      await this.delete(session.id)
      deleted++
    }

    // Clean up user index
    await this.redis.del(this.getUserKey(userId))

    return deleted
  }

  async deleteExpiredSessions(): Promise<number> {
    // Redis handles TTL-based expiration automatically
    // This method is for compatibility with the interface
    return 0
  }

  async getSessionCount(): Promise<number> {
    const keys = await this.redis.keys(`${this.keyPrefix}*`)
    // Filter out user index keys
    return keys.filter((key) => !key.includes(":user:")).length
  }

  async getUserSessionCount(userId: string): Promise<number> {
    const sessions = await this.getUserSessions(userId)
    return sessions.length
  }

  async close(): Promise<void> {
    await this.redis.quit()
  }
}

// ============================================================================
// Database Session Store (for persistence)
// ============================================================================

export interface DatabaseConnection {
  query(sql: string, params?: any[]): Promise<any[]>
  execute(sql: string, params?: any[]): Promise<{ affectedRows: number }>
  close(): Promise<void>
}

export class DatabaseSessionStore implements SessionStore {
  constructor(private db: DatabaseConnection) {}

  async set(sessionId: string, session: Session, ttl?: number): Promise<void> {
    const sql = `
      INSERT INTO sessions (id, user_id, created_at, expires_at, last_activity, ip_address, user_agent, container_id, process_id, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        last_activity = excluded.last_activity,
        expires_at = excluded.expires_at,
        container_id = excluded.container_id,
        process_id = excluded.process_id,
        metadata = excluded.metadata
    `

    await this.db.execute(sql, [
      sessionId,
      session.userId,
      session.createdAt.toISOString(),
      session.expiresAt.toISOString(),
      session.lastActivity.toISOString(),
      session.ipAddress,
      session.userAgent,
      session.containerId || null,
      session.processId || null,
      JSON.stringify(session.metadata),
    ])
  }

  async get(sessionId: string): Promise<Session | null> {
    const sql = "SELECT * FROM sessions WHERE id = ? AND expires_at > datetime('now')"
    const rows = await this.db.query(sql, [sessionId])

    if (rows.length === 0) {
      return null
    }

    return this.rowToSession(rows[0])
  }

  async delete(sessionId: string): Promise<void> {
    const sql = "DELETE FROM sessions WHERE id = ?"
    await this.db.execute(sql, [sessionId])
  }

  async exists(sessionId: string): Promise<boolean> {
    const session = await this.get(sessionId)
    return session !== null
  }

  async getUserSessions(userId: string): Promise<Session[]> {
    const sql = "SELECT * FROM sessions WHERE user_id = ? AND expires_at > datetime('now')"
    const rows = await this.db.query(sql, [userId])
    return rows.map((row) => this.rowToSession(row))
  }

  async getAllActiveSessions(): Promise<Session[]> {
    const sql = "SELECT * FROM sessions WHERE expires_at > datetime('now')"
    const rows = await this.db.query(sql)
    return rows.map((row) => this.rowToSession(row))
  }

  async deleteUserSessions(userId: string): Promise<number> {
    const sql = "DELETE FROM sessions WHERE user_id = ?"
    const result = await this.db.execute(sql, [userId])
    return result.affectedRows
  }

  async deleteExpiredSessions(): Promise<number> {
    const sql = "DELETE FROM sessions WHERE expires_at <= datetime('now')"
    const result = await this.db.execute(sql)
    return result.affectedRows
  }

  async getSessionCount(): Promise<number> {
    const sql = "SELECT COUNT(*) as count FROM sessions WHERE expires_at > datetime('now')"
    const rows = await this.db.query(sql)
    return rows[0].count
  }

  async getUserSessionCount(userId: string): Promise<number> {
    const sql = "SELECT COUNT(*) as count FROM sessions WHERE user_id = ? AND expires_at > datetime('now')"
    const rows = await this.db.query(sql, [userId])
    return rows[0].count
  }

  async close(): Promise<void> {
    await this.db.close()
  }

  private rowToSession(row: any): Session {
    return {
      id: row.id,
      userId: row.user_id,
      createdAt: new Date(row.created_at),
      expiresAt: new Date(row.expires_at),
      lastActivity: new Date(row.last_activity),
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      containerId: row.container_id || undefined,
      processId: row.process_id || undefined,
      metadata: JSON.parse(row.metadata || "{}"),
    }
  }
}

// ============================================================================
// Session Store Factory
// ============================================================================

export type SessionStoreConfig =
  | { type: "memory"; cleanupIntervalSeconds?: number }
  | { type: "redis"; client: RedisClient; keyPrefix?: string }
  | { type: "database"; connection: DatabaseConnection }

export function createSessionStore(config: SessionStoreConfig): SessionStore {
  switch (config.type) {
    case "memory":
      return new MemorySessionStore(config.cleanupIntervalSeconds)
    case "redis":
      return new RedisSessionStore(config.client, config.keyPrefix)
    case "database":
      return new DatabaseSessionStore(config.connection)
    default:
      throw new Error(`Unknown session store type: ${(config as any).type}`)
  }
}
