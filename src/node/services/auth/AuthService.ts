/**
 * Authentication Service
 * Handles user authentication, session management, and token generation
 */

import * as argon2 from "argon2"
import { randomUUID } from "crypto"
import { AuditLogger } from "../audit/AuditLogger"
import { SessionStore } from "../session/SessionStore"
import {
  User,
  Session,
  CreateUserInput,
  UpdateUserInput,
  SessionMetadata,
  CreateSessionInput,
  UserRole,
  LoginResponse,
  SessionInfo,
  AuditEventType,
} from "../types"
import { UserRepository } from "./UserRepository"

export interface AuthServiceConfig {
  sessionTTL: number // seconds
  maxSessionsPerUser: number
  passwordMinLength: number
  requireStrongPassword: boolean
}

const DEFAULT_CONFIG: AuthServiceConfig = {
  sessionTTL: 86400, // 24 hours
  maxSessionsPerUser: 5,
  passwordMinLength: 8,
  requireStrongPassword: true,
}

export class AuthService {
  private config: AuthServiceConfig

  constructor(
    private userRepo: UserRepository,
    private sessionStore: SessionStore,
    private auditLogger?: AuditLogger,
    config?: Partial<AuthServiceConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  // ============================================================================
  // User Management
  // ============================================================================

  async createUser(input: CreateUserInput): Promise<User> {
    // Validate password
    this.validatePassword(input.password)

    // Check if username already exists
    const existingUser = await this.userRepo.findByUsername(input.username)
    if (existingUser) {
      throw new Error(`Username "${input.username}" already exists`)
    }

    // Check if email already exists
    const existingEmail = await this.userRepo.findByEmail(input.email)
    if (existingEmail) {
      throw new Error(`Email "${input.email}" already exists`)
    }

    // Hash password
    const passwordHash = await argon2.hash(input.password)

    // Create user
    const user: User = {
      id: randomUUID(),
      username: input.username,
      email: input.email,
      passwordHash,
      roles: input.roles || [UserRole.User],
      createdAt: new Date(),
      updatedAt: new Date(),
      lastLogin: null,
      isActive: true,
      metadata: input.metadata || {},
    }

    await this.userRepo.create(user)

    // Audit log
    await this.auditLogger?.log({
      id: randomUUID(),
      timestamp: new Date(),
      eventType: AuditEventType.UserCreated,
      userId: user.id,
      username: user.username,
      ipAddress: "system",
      userAgent: "system",
      status: "success",
      metadata: { roles: user.roles },
    })

    return user
  }

  async updateUser(userId: string, updates: UpdateUserInput): Promise<User> {
    const user = await this.userRepo.findById(userId)
    if (!user) {
      throw new Error(`User not found: ${userId}`)
    }

    // Hash new password if provided
    if (updates.password) {
      this.validatePassword(updates.password)
      updates.password = await argon2.hash(updates.password)
    }

    // Check email uniqueness if changing
    if (updates.email && updates.email !== user.email) {
      const existingEmail = await this.userRepo.findByEmail(updates.email)
      if (existingEmail) {
        throw new Error(`Email "${updates.email}" already exists`)
      }
    }

    const updatedUser = await this.userRepo.update(userId, updates)

    // Audit log
    await this.auditLogger?.log({
      id: randomUUID(),
      timestamp: new Date(),
      eventType: AuditEventType.UserUpdated,
      userId: user.id,
      username: user.username,
      ipAddress: "system",
      userAgent: "system",
      status: "success",
      metadata: { updates: Object.keys(updates) },
    })

    return updatedUser
  }

  async deleteUser(userId: string): Promise<void> {
    const user = await this.userRepo.findById(userId)
    if (!user) {
      throw new Error(`User not found: ${userId}`)
    }

    // Revoke all user sessions
    await this.revokeUserSessions(userId)

    // Delete user
    await this.userRepo.delete(userId)

    // Audit log
    await this.auditLogger?.log({
      id: randomUUID(),
      timestamp: new Date(),
      eventType: AuditEventType.UserDeleted,
      userId: user.id,
      username: user.username,
      ipAddress: "system",
      userAgent: "system",
      status: "success",
      metadata: {},
    })
  }

  async getUserById(userId: string): Promise<User | null> {
    return this.userRepo.findById(userId)
  }

  async getUserByUsername(username: string): Promise<User | null> {
    return this.userRepo.findByUsername(username)
  }

  async listUsers(options?: { limit?: number; offset?: number }): Promise<User[]> {
    return this.userRepo.findAll(options)
  }

  // ============================================================================
  // Authentication
  // ============================================================================

  async authenticateUser(username: string, password: string): Promise<User | null> {
    const user = await this.userRepo.findByUsername(username)

    if (!user || !user.isActive) {
      return null
    }

    try {
      const valid = await argon2.verify(user.passwordHash, password)
      if (!valid) {
        return null
      }

      // Update last login
      await this.userRepo.update(user.id, { lastLogin: new Date() } as UpdateUserInput)

      return user
    } catch (err) {
      console.error("Password verification error:", err)
      return null
    }
  }

  async login(username: string, password: string, metadata: SessionMetadata): Promise<LoginResponse> {
    const user = await this.authenticateUser(username, password)

    if (!user) {
      // Audit log - failed login
      await this.auditLogger?.log({
        id: randomUUID(),
        timestamp: new Date(),
        eventType: AuditEventType.UserLoginFailed,
        username,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        status: "failure",
        metadata: {},
      })

      throw new Error("Invalid username or password")
    }

    // Check session limit
    const userSessionCount = await this.sessionStore.getUserSessionCount(user.id)
    if (userSessionCount >= this.config.maxSessionsPerUser) {
      throw new Error(
        `Maximum number of sessions (${this.config.maxSessionsPerUser}) reached. Please logout from another device.`,
      )
    }

    // Create session
    const session = await this.createSession({
      userId: user.id,
      metadata,
      ttl: this.config.sessionTTL,
    })

    // Audit log - successful login
    await this.auditLogger?.log({
      id: randomUUID(),
      timestamp: new Date(),
      eventType: AuditEventType.UserLogin,
      userId: user.id,
      username: user.username,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      status: "success",
      metadata: { sessionId: session.id },
    })

    // Generate token (for now, just use session ID; in production, use JWT)
    const token = this.generateToken(user, session)

    return {
      token,
      user: this.sanitizeUser(user),
      session,
      expiresAt: session.expiresAt,
    }
  }

  async logout(sessionToken: string, metadata: Partial<SessionMetadata> = {}): Promise<void> {
    const session = await this.validateSession(sessionToken)
    if (!session) {
      return
    }

    const user = await this.userRepo.findById(session.userId)

    // Revoke session
    await this.revokeSession(sessionToken)

    // Audit log
    await this.auditLogger?.log({
      id: randomUUID(),
      timestamp: new Date(),
      eventType: AuditEventType.UserLogout,
      userId: session.userId,
      username: user?.username,
      ipAddress: metadata.ipAddress || session.ipAddress,
      userAgent: metadata.userAgent || session.userAgent,
      status: "success",
      metadata: { sessionId: session.id },
    })
  }

  // ============================================================================
  // Session Management
  // ============================================================================

  async createSession(input: CreateSessionInput): Promise<Session> {
    const sessionId = randomUUID()
    const now = new Date()
    const expiresAt = new Date(now.getTime() + (input.ttl || this.config.sessionTTL) * 1000)

    const session: Session = {
      id: sessionId,
      userId: input.userId,
      createdAt: now,
      expiresAt,
      lastActivity: now,
      ipAddress: input.metadata.ipAddress,
      userAgent: input.metadata.userAgent,
      metadata: input.metadata,
    }

    await this.sessionStore.set(sessionId, session, input.ttl)

    // Audit log
    await this.auditLogger?.log({
      id: randomUUID(),
      timestamp: new Date(),
      eventType: AuditEventType.SessionCreated,
      userId: session.userId,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      status: "success",
      metadata: { sessionId: session.id, expiresAt: session.expiresAt },
    })

    return session
  }

  async validateSession(sessionToken: string): Promise<Session | null> {
    const session = await this.sessionStore.get(sessionToken)
    if (!session) {
      return null
    }

    // Check if expired
    if (session.expiresAt < new Date()) {
      await this.sessionStore.delete(sessionToken)
      return null
    }

    return session
  }

  async refreshSession(sessionToken: string): Promise<Session> {
    const session = await this.validateSession(sessionToken)
    if (!session) {
      throw new Error("Invalid or expired session")
    }

    // Update last activity and extend expiration
    session.lastActivity = new Date()
    session.expiresAt = new Date(Date.now() + this.config.sessionTTL * 1000)

    await this.sessionStore.set(sessionToken, session)

    return session
  }

  async revokeSession(sessionToken: string): Promise<void> {
    const session = await this.sessionStore.get(sessionToken)
    await this.sessionStore.delete(sessionToken)

    if (session) {
      await this.auditLogger?.log({
        id: randomUUID(),
        timestamp: new Date(),
        eventType: AuditEventType.SessionRevoked,
        userId: session.userId,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        status: "success",
        metadata: { sessionId: session.id },
      })
    }
  }

  async revokeUserSessions(userId: string): Promise<void> {
    const count = await this.sessionStore.deleteUserSessions(userId)

    await this.auditLogger?.log({
      id: randomUUID(),
      timestamp: new Date(),
      eventType: AuditEventType.SessionRevoked,
      userId,
      ipAddress: "system",
      userAgent: "system",
      status: "success",
      metadata: { sessionsRevoked: count },
    })
  }

  async getActiveSessions(userId: string): Promise<Session[]> {
    return this.sessionStore.getUserSessions(userId)
  }

  async getSessionInfo(sessionToken: string): Promise<SessionInfo | null> {
    const session = await this.validateSession(sessionToken)
    if (!session) {
      return null
    }

    const user = await this.userRepo.findById(session.userId)
    if (!user) {
      return null
    }

    return {
      token: sessionToken,
      user: this.sanitizeUser(user),
      session,
    }
  }

  // ============================================================================
  // Token Management (Basic implementation - use JWT in production)
  // ============================================================================

  generateToken(user: User, session: Session): string {
    // For now, just return session ID
    // In production, generate JWT with user info and session ID
    return session.id
  }

  async verifyToken(token: string): Promise<{ user: User; session: Session } | null> {
    // For now, treat token as session ID
    // In production, verify JWT and extract session ID
    const session = await this.validateSession(token)
    if (!session) {
      return null
    }

    const user = await this.userRepo.findById(session.userId)
    if (!user) {
      return null
    }

    return { user, session }
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private validatePassword(password: string): void {
    if (password.length < this.config.passwordMinLength) {
      throw new Error(`Password must be at least ${this.config.passwordMinLength} characters`)
    }

    if (this.config.requireStrongPassword) {
      // Check for at least one uppercase, one lowercase, one digit, one special char
      const hasUppercase = /[A-Z]/.test(password)
      const hasLowercase = /[a-z]/.test(password)
      const hasDigit = /\d/.test(password)
      const hasSpecial = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)

      if (!hasUppercase || !hasLowercase || !hasDigit || !hasSpecial) {
        throw new Error(
          "Password must contain at least one uppercase letter, one lowercase letter, one digit, and one special character",
        )
      }
    }
  }

  private sanitizeUser(user: User): Omit<User, "passwordHash"> {
    const { passwordHash, ...sanitized } = user
    return sanitized
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  async close(): Promise<void> {
    await this.sessionStore.close()
  }
}
