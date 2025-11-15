/**
 * Core types for multi-user session management
 */

export enum DeploymentMode {
  Single = "single",
  Multi = "multi",
}

export enum IsolationStrategy {
  Directory = "directory",
  Container = "container",
  Process = "process",
}

export enum AuthProvider {
  None = "none",
  Password = "password", // Single password (legacy)
  Database = "database",
  LDAP = "ldap",
  OAuth = "oauth",
  SAML = "saml",
}

export enum SessionStoreType {
  Memory = "memory",
  Redis = "redis",
  Database = "database",
}

// ============================================================================
// User Management
// ============================================================================

export interface User {
  id: string // UUID
  username: string // unique
  email: string // unique
  passwordHash: string // Argon2
  roles: UserRole[]
  createdAt: Date
  updatedAt: Date
  lastLogin: Date | null
  isActive: boolean
  metadata: Record<string, any>
}

export enum UserRole {
  Admin = "admin",
  User = "user",
  Viewer = "viewer",
}

export interface CreateUserInput {
  username: string
  email: string
  password: string
  roles?: UserRole[]
  metadata?: Record<string, any>
}

export interface UpdateUserInput {
  email?: string
  password?: string
  roles?: UserRole[]
  isActive?: boolean
  metadata?: Record<string, any>
}

// ============================================================================
// Session Management
// ============================================================================

export interface Session {
  id: string // Session token (JWT or UUID)
  userId: string
  createdAt: Date
  expiresAt: Date
  lastActivity: Date
  ipAddress: string
  userAgent: string
  containerId?: string // For container mode
  processId?: number // For process mode
  metadata: Record<string, any>
}

export interface SessionMetadata {
  ipAddress: string
  userAgent: string
  [key: string]: any
}

export interface CreateSessionInput {
  userId: string
  metadata: SessionMetadata
  ttl?: number // seconds
}

// ============================================================================
// User Environment & Isolation
// ============================================================================

export interface UserEnvironment {
  userId: string
  basePath: string
  paths: {
    data: string
    settings: string
    extensions: string
    workspaces: string
    logs: string
  }
  limits: ResourceLimits
  createdAt: Date
}

export interface ResourceLimits {
  maxStorageMB: number
  maxSessions: number
  maxConcurrentConnections: number
  maxMemoryMB?: number
  maxCPUPercent?: number
  maxExtensions?: number
  maxWorkspaces?: number
}

export interface ResourceUsage {
  userId: string
  timestamp: Date
  storage: { used: number; limit: number } // bytes
  sessions: { active: number; limit: number }
  connections: { current: number; limit: number }
  cpu?: { percent: number; limit: number }
  memory?: { mb: number; limit: number }
}

export interface QuotaStatus {
  resource: ResourceType
  current: number
  limit: number
  available: number
  exceeded: boolean
}

export enum ResourceType {
  Storage = "storage",
  Sessions = "sessions",
  Connections = "connections",
  Memory = "memory",
  CPU = "cpu",
  Extensions = "extensions",
  Workspaces = "workspaces",
}

// ============================================================================
// Container Orchestration
// ============================================================================

export interface Container {
  id: string
  userId: string
  sessionId: string
  image: string
  status: ContainerStatus
  createdAt: Date
  startedAt?: Date
  stoppedAt?: Date
  ports: PortMapping[]
  volumes: VolumeMount[]
  limits: ResourceLimits
  health: HealthStatus
  exitCode?: number
  error?: string
}

export enum ContainerStatus {
  Starting = "starting",
  Running = "running",
  Stopping = "stopping",
  Stopped = "stopped",
  Error = "error",
  Unknown = "unknown",
}

export interface PortMapping {
  host: number
  container: number
  protocol?: "tcp" | "udp"
}

export interface VolumeMount {
  type: "volume" | "bind"
  source: string
  target: string
  readOnly?: boolean
}

export interface HealthStatus {
  status: "healthy" | "unhealthy" | "unknown"
  lastCheck?: Date
  message?: string
}

export interface ContainerFilter {
  userId?: string
  sessionId?: string
  status?: ContainerStatus[]
}

export interface ContainerStats {
  containerId: string
  cpu: {
    percent: number
    usage: number // nanoseconds
  }
  memory: {
    usage: number // bytes
    limit: number // bytes
    percent: number
  }
  network?: {
    rxBytes: number
    txBytes: number
  }
  blockIO?: {
    readBytes: number
    writeBytes: number
  }
}

// ============================================================================
// Configuration
// ============================================================================

export interface MultiUserConfig {
  auth: AuthConfig
  isolation: IsolationConfig
  limits: DefaultResourceLimits
  features: FeaturesConfig
  scaling?: ScalingConfig
}

export interface AuthConfig {
  provider: AuthProvider
  database?: DatabaseAuthConfig
  ldap?: LDAPAuthConfig
  oauth?: OAuthConfig
  saml?: SAMLConfig
  session: SessionConfig
}

export interface DatabaseAuthConfig {
  type: "sqlite" | "postgres" | "mysql"
  host?: string
  port?: number
  database?: string
  username?: string
  password?: string
  path?: string // For SQLite
}

export interface LDAPAuthConfig {
  url: string
  bindDN: string
  bindPassword: string
  searchBase: string
  searchFilter: string
}

export interface OAuthConfig {
  clientId: string
  clientSecret: string
  authorizationURL: string
  tokenURL: string
  userInfoURL: string
  callbackURL: string
  scope: string[]
}

export interface SAMLConfig {
  entryPoint: string
  issuer: string
  cert: string
  privateKey: string
  callbackURL: string
}

export interface SessionConfig {
  store: SessionStoreType
  ttl: number // seconds
  redis?: RedisConfig
  database?: DatabaseAuthConfig
}

export interface RedisConfig {
  host: string
  port: number
  password?: string
  db?: number
  keyPrefix?: string
}

export interface IsolationConfig {
  strategy: IsolationStrategy
  basePath: string
  container?: ContainerConfig
  process?: ProcessConfig
}

export interface ContainerConfig {
  runtime: "docker" | "podman" | "containerd"
  image: string
  network: string
  registryAuth?: {
    username: string
    password: string
    serverAddress: string
  }
  limits: ResourceLimits
  volumes: VolumeMount[]
}

export interface ProcessConfig {
  maxWorkers: number
  workerIdleTimeout: number // seconds
  workerMemoryLimit: number // MB
}

export interface DefaultResourceLimits {
  maxSessionsPerUser: number
  maxConcurrentConnections: number
  storageQuotaMB: number
  memoryLimitMB?: number
  cpuLimitPercent?: number
  maxExtensions?: number
  maxWorkspaces?: number
}

export interface FeaturesConfig {
  auditLogging: boolean
  usageAnalytics: boolean
  adminDashboard: boolean
  metricsExport?: "prometheus" | "statsd"
}

export interface ScalingConfig {
  containerPool?: ContainerPoolConfig
  autoCleanup?: AutoCleanupConfig
}

export interface ContainerPoolConfig {
  enabled: boolean
  warmPoolSize: number
  maxIdleMinutes: number
}

export interface AutoCleanupConfig {
  enabled: boolean
  idleSessionMinutes: number
  expiredSessionCleanupInterval: number // seconds
}

// ============================================================================
// Audit Logging
// ============================================================================

export interface AuditEvent {
  id: string
  timestamp: Date
  eventType: AuditEventType
  userId?: string
  username?: string
  ipAddress: string
  userAgent: string
  status: "success" | "failure" | "error"
  metadata: Record<string, any>
  error?: string
}

export enum AuditEventType {
  // User events
  UserLogin = "user.login",
  UserLogout = "user.logout",
  UserLoginFailed = "user.login.failed",
  UserCreated = "user.created",
  UserUpdated = "user.updated",
  UserDeleted = "user.deleted",

  // Session events
  SessionCreated = "session.created",
  SessionExpired = "session.expired",
  SessionRevoked = "session.revoked",

  // Resource events
  ResourceAccessed = "resource.accessed",
  ResourceModified = "resource.modified",
  ResourceDeleted = "resource.deleted",
  QuotaExceeded = "quota.exceeded",

  // Container events
  ContainerStarted = "container.started",
  ContainerStopped = "container.stopped",
  ContainerError = "container.error",

  // Admin events
  AdminAction = "admin.action",
  ConfigChanged = "config.changed",

  // Security events
  SecurityViolation = "security.violation",
  SuspiciousActivity = "security.suspicious",
}

// ============================================================================
// Metrics
// ============================================================================

export interface MetricPoint {
  timestamp: Date
  name: string
  value: number
  labels?: Record<string, string>
}

export interface UserMetrics {
  userId: string
  activeConnections: number
  activeSessions: number
  storageUsedMB: number
  requestsPerMinute: number
  lastActivity: Date
}

export interface SystemMetrics {
  activeUsers: number
  activeSessions: number
  activeContainers: number
  totalRequests: number
  averageResponseTime: number
  errorRate: number
  resourceUsage: {
    cpuPercent: number
    memoryMB: number
    storageMB: number
  }
}

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: ApiError
  meta?: {
    page?: number
    perPage?: number
    total?: number
    [key: string]: any
  }
}

export interface ApiError {
  code: string
  message: string
  details?: Record<string, any>
}

export interface LoginResponse {
  token: string
  refreshToken?: string
  user: Omit<User, "passwordHash">
  session: Session
  expiresAt: Date
}

export interface SessionInfo {
  token: string
  user: Omit<User, "passwordHash">
  session: Session
  container?: Container
  environment?: UserEnvironment
}

// ============================================================================
// Gateway / Routing
// ============================================================================

export interface RouteTarget {
  type: "local" | "container" | "process"
  host: string
  port: number
  path: string
  headers?: Record<string, string>
  socketPath?: string // For Unix socket communication
}

// ============================================================================
// Time Periods
// ============================================================================

export enum TimePeriod {
  Hour = "hour",
  Day = "day",
  Week = "week",
  Month = "month",
  Year = "year",
}
