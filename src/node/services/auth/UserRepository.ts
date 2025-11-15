/**
 * User Repository
 * Handles user data persistence
 */

import { User, UpdateUserInput } from "../types"

export interface UserRepository {
  create(user: User): Promise<User>
  findById(id: string): Promise<User | null>
  findByUsername(username: string): Promise<User | null>
  findByEmail(email: string): Promise<User | null>
  findAll(options?: { limit?: number; offset?: number }): Promise<User[]>
  update(id: string, updates: Partial<User>): Promise<User>
  delete(id: string): Promise<void>
  count(): Promise<number>
}

// ============================================================================
// In-Memory User Repository (for development)
// ============================================================================

export class MemoryUserRepository implements UserRepository {
  private users: Map<string, User> = new Map()
  private usernameIndex: Map<string, string> = new Map() // username -> id
  private emailIndex: Map<string, string> = new Map() // email -> id

  async create(user: User): Promise<User> {
    if (this.users.has(user.id)) {
      throw new Error(`User already exists: ${user.id}`)
    }

    this.users.set(user.id, user)
    this.usernameIndex.set(user.username, user.id)
    this.emailIndex.set(user.email, user.id)

    return user
  }

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) || null
  }

  async findByUsername(username: string): Promise<User | null> {
    const userId = this.usernameIndex.get(username)
    return userId ? this.users.get(userId) || null : null
  }

  async findByEmail(email: string): Promise<User | null> {
    const userId = this.emailIndex.get(email)
    return userId ? this.users.get(userId) || null : null
  }

  async findAll(options?: { limit?: number; offset?: number }): Promise<User[]> {
    const allUsers = Array.from(this.users.values())
    const offset = options?.offset || 0
    const limit = options?.limit || allUsers.length

    return allUsers.slice(offset, offset + limit)
  }

  async update(id: string, updates: Partial<User>): Promise<User> {
    const user = this.users.get(id)
    if (!user) {
      throw new Error(`User not found: ${id}`)
    }

    // Update indexes if username or email changed
    if (updates.username && updates.username !== user.username) {
      this.usernameIndex.delete(user.username)
      this.usernameIndex.set(updates.username, user.id)
    }

    if (updates.email && updates.email !== user.email) {
      this.emailIndex.delete(user.email)
      this.emailIndex.set(updates.email, user.id)
    }

    const updatedUser = {
      ...user,
      ...updates,
      updatedAt: new Date(),
    }

    this.users.set(id, updatedUser)
    return updatedUser
  }

  async delete(id: string): Promise<void> {
    const user = this.users.get(id)
    if (user) {
      this.users.delete(id)
      this.usernameIndex.delete(user.username)
      this.emailIndex.delete(user.email)
    }
  }

  async count(): Promise<number> {
    return this.users.size
  }
}

// ============================================================================
// Database User Repository
// ============================================================================

export interface DatabaseConnection {
  query(sql: string, params?: any[]): Promise<any[]>
  execute(sql: string, params?: any[]): Promise<{ affectedRows: number; lastInsertId?: string }>
}

export class DatabaseUserRepository implements UserRepository {
  constructor(private db: DatabaseConnection) {}

  async create(user: User): Promise<User> {
    const sql = `
      INSERT INTO users (id, username, email, password_hash, roles, created_at, updated_at, last_login, is_active, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `

    await this.db.execute(sql, [
      user.id,
      user.username,
      user.email,
      user.passwordHash,
      JSON.stringify(user.roles),
      user.createdAt.toISOString(),
      user.updatedAt.toISOString(),
      user.lastLogin?.toISOString() || null,
      user.isActive ? 1 : 0,
      JSON.stringify(user.metadata),
    ])

    return user
  }

  async findById(id: string): Promise<User | null> {
    const sql = "SELECT * FROM users WHERE id = ?"
    const rows = await this.db.query(sql, [id])

    if (rows.length === 0) {
      return null
    }

    return this.rowToUser(rows[0])
  }

  async findByUsername(username: string): Promise<User | null> {
    const sql = "SELECT * FROM users WHERE username = ?"
    const rows = await this.db.query(sql, [username])

    if (rows.length === 0) {
      return null
    }

    return this.rowToUser(rows[0])
  }

  async findByEmail(email: string): Promise<User | null> {
    const sql = "SELECT * FROM users WHERE email = ?"
    const rows = await this.db.query(sql, [email])

    if (rows.length === 0) {
      return null
    }

    return this.rowToUser(rows[0])
  }

  async findAll(options?: { limit?: number; offset?: number }): Promise<User[]> {
    const limit = options?.limit || 100
    const offset = options?.offset || 0

    const sql = "SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?"
    const rows = await this.db.query(sql, [limit, offset])

    return rows.map((row) => this.rowToUser(row))
  }

  async update(id: string, updates: Partial<User>): Promise<User> {
    const user = await this.findById(id)
    if (!user) {
      throw new Error(`User not found: ${id}`)
    }

    const fields: string[] = []
    const values: any[] = []

    if (updates.username !== undefined) {
      fields.push("username = ?")
      values.push(updates.username)
    }
    if (updates.email !== undefined) {
      fields.push("email = ?")
      values.push(updates.email)
    }
    if (updates.passwordHash !== undefined) {
      fields.push("password_hash = ?")
      values.push(updates.passwordHash)
    }
    if (updates.roles !== undefined) {
      fields.push("roles = ?")
      values.push(JSON.stringify(updates.roles))
    }
    if (updates.lastLogin !== undefined) {
      fields.push("last_login = ?")
      values.push(updates.lastLogin?.toISOString() || null)
    }
    if (updates.isActive !== undefined) {
      fields.push("is_active = ?")
      values.push(updates.isActive ? 1 : 0)
    }
    if (updates.metadata !== undefined) {
      fields.push("metadata = ?")
      values.push(JSON.stringify(updates.metadata))
    }

    fields.push("updated_at = ?")
    values.push(new Date().toISOString())

    values.push(id)

    const sql = `UPDATE users SET ${fields.join(", ")} WHERE id = ?`
    await this.db.execute(sql, values)

    return (await this.findById(id))!
  }

  async delete(id: string): Promise<void> {
    const sql = "DELETE FROM users WHERE id = ?"
    await this.db.execute(sql, [id])
  }

  async count(): Promise<number> {
    const sql = "SELECT COUNT(*) as count FROM users"
    const rows = await this.db.query(sql)
    return rows[0].count
  }

  private rowToUser(row: any): User {
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      passwordHash: row.password_hash,
      roles: JSON.parse(row.roles),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      lastLogin: row.last_login ? new Date(row.last_login) : null,
      isActive: row.is_active === 1,
      metadata: JSON.parse(row.metadata || "{}"),
    }
  }
}
