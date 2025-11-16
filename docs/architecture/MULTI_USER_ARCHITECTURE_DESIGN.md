# Multi-User Architecture Design

## VSCode Web IDE - Single & Multi-User Deployment Modes

**Design Date:** 2025-11-15
**Status:** Design Document
**Version:** 1.0

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Design Goals](#design-goals)
3. [Deployment Modes](#deployment-modes)
4. [Architecture Options Analysis](#architecture-options-analysis)
5. [Recommended Architecture](#recommended-architecture)
6. [Implementation Phases](#implementation-phases)
7. [Detailed Component Design](#detailed-component-design)
8. [Security Considerations](#security-considerations)
9. [Scalability & Performance](#scalability--performance)
10. [Migration Path](#migration-path)

---

## 1. Executive Summary

This document outlines the architecture for supporting **two distinct deployment modes** for the VSCode Web IDE:

- **Single-User Mode**: Lightweight, simple deployment for personal use or single-user scenarios
- **Multi-User Mode**: Enterprise-ready deployment supporting multiple concurrent users with full isolation

### Key Design Principles

1. **Mode Separation**: Clear separation between single and multi-user modes via configuration
2. **Backward Compatibility**: Single-user mode maintains current behavior and performance
3. **Progressive Enhancement**: Multi-user features can be adopted incrementally
4. **Resource Efficiency**: Multi-user mode optimized for container/cloud deployment
5. **Security First**: Complete isolation between users in multi-user mode

---

## 2. Design Goals

### Single-User Mode Goals

- ✅ Maintain current simplicity and performance
- ✅ Zero additional dependencies
- ✅ Single-password authentication
- ✅ Shared resources (settings, extensions)
- ✅ Minimal memory footprint

### Multi-User Mode Goals

- ✅ **Complete user isolation** (processes, filesystems, state)
- ✅ **Scalable authentication** (user database, sessions, tokens)
- ✅ **Resource management** (quotas, limits, cleanup)
- ✅ **Session persistence** (survive server restarts)
- ✅ **Horizontal scalability** (load balancing, session affinity)
- ✅ **Audit & monitoring** (user actions, resource usage)

---

## 3. Deployment Modes

### 3.1 Mode Configuration

**Configuration via CLI flag or environment variable:**

```bash
# Single-user mode (default - current behavior)
code-server --deployment-mode=single

# Multi-user mode (new)
code-server --deployment-mode=multi --auth-provider=database

# Environment variable
export CODE_SERVER_DEPLOYMENT_MODE=multi
```

**Configuration file (.code-server.yaml):**

```yaml
deployment-mode: multi # single | multi

# Multi-user specific settings
multi-user:
  auth:
    provider: database # database | ldap | oauth | saml
    database:
      type: sqlite # sqlite | postgres | mysql
      path: /data/users.db
    session:
      store: redis # memory | redis | database
      ttl: 86400 # 24 hours

  isolation:
    strategy: directory # directory | container | process
    base-path: /data/users

  limits:
    max-sessions-per-user: 5
    max-concurrent-connections: 100
    storage-quota-mb: 1000
    memory-limit-mb: 2048
    cpu-limit-percent: 50

  features:
    audit-logging: true
    usage-analytics: true
    admin-dashboard: true
```

### 3.2 Mode Comparison

| Feature                | Single-User Mode   | Multi-User Mode          |
| ---------------------- | ------------------ | ------------------------ |
| **Authentication**     | Single password    | User database + sessions |
| **User Isolation**     | None (shared)      | Complete isolation       |
| **File System**        | Shared directories | Per-user directories     |
| **Settings**           | Global             | Per-user                 |
| **Extensions**         | Global             | Per-user or shared       |
| **Resource Limits**    | None               | Enforced quotas          |
| **Session Management** | Cookie-based       | Token + session store    |
| **Scalability**        | Single instance    | Horizontal scaling       |
| **Admin Interface**    | None               | Admin dashboard          |
| **Audit Logging**      | Basic              | Comprehensive            |

---

## 4. Architecture Options Analysis

### Option A: Session-Based Isolation (Single Process)

**Description:** Single Node.js process with middleware-based user isolation

```
┌─────────────────────────────────────────┐
│     Single Node.js Process              │
│  ┌─────────────────────────────────┐   │
│  │  Session Manager                │   │
│  │  ├─ User 1 Session               │   │
│  │  ├─ User 2 Session               │   │
│  │  └─ User 3 Session               │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │  File System Isolation          │   │
│  │  /data/users/                   │   │
│  │    ├─ user1/                    │   │
│  │    ├─ user2/                    │   │
│  │    └─ user3/                    │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

**Pros:**

- ✅ Easiest migration from current architecture
- ✅ Low memory overhead
- ✅ Simple deployment (no orchestration)
- ✅ Fast session switching

**Cons:**

- ❌ Shared VS Code module (potential state leakage)
- ❌ Single point of failure
- ❌ Limited horizontal scaling
- ❌ One user's heavy operation blocks others
- ❌ Security: process-level isolation not guaranteed

**Best For:** Small teams (5-20 users), trusted environments

---

### Option B: Container-Per-User (Recommended for Production)

**Description:** Each active user session runs in an isolated container

```
┌─────────────────────────────────────────────────────┐
│          Gateway / Session Router                   │
│   ├─ Auth Service (JWT, OAuth)                     │
│   ├─ Session Store (Redis)                         │
│   └─ Container Orchestrator Interface              │
└────────────┬────────────────────────────────────────┘
             │
      ┌──────┴───────┬───────────┬──────────┐
      │              │           │          │
┌─────v──────┐ ┌────v──────┐ ┌──v──────┐ ┌─v────────┐
│ Container  │ │ Container │ │Container│ │Container │
│ (User 1)   │ │ (User 2)  │ │(User 3) │ │(User 4)  │
│            │ │           │ │         │ │          │
│ VSCode IDE │ │ VSCode IDE│ │VSCode   │ │VSCode    │
│ Process    │ │ Process   │ │IDE      │ │IDE       │
│            │ │           │ │Process  │ │Process   │
│ User       │ │ User      │ │User     │ │User      │
│ Files      │ │ Files     │ │Files    │ │Files     │
└────────────┘ └───────────┘ └─────────┘ └──────────┘
      │              │           │          │
      └──────────────┴───────────┴──────────┘
                     │
              ┌──────v──────┐
              │  Shared     │
              │  Storage    │
              │  (Optional) │
              └─────────────┘
```

**Pros:**

- ✅ **Complete isolation** (process, network, filesystem)
- ✅ **Resource limits** enforced by container runtime
- ✅ **Security**: kernel-level isolation
- ✅ **Scalability**: horizontal scaling with orchestration
- ✅ **Crash isolation**: one user's crash doesn't affect others
- ✅ **Easy cleanup**: terminate container = cleanup all resources

**Cons:**

- ❌ Higher resource overhead (container per user)
- ❌ Requires Docker/Podman or Kubernetes
- ❌ More complex deployment
- ❌ Container startup latency (~1-3 seconds)
- ❌ Requires container orchestration knowledge

**Best For:** Production deployments, cloud environments, 20+ users

---

### Option C: Process Pool (Hybrid)

**Description:** Pool of worker processes, users assigned with session affinity

```
┌─────────────────────────────────────────┐
│       Master Process (Gateway)          │
│   ├─ Session Store (Redis)              │
│   ├─ User Assignment Logic              │
│   └─ Health Checks                      │
└────────┬────────────────────────────────┘
         │
    ┌────┴────┬────────┬────────┐
    │         │        │        │
┌───v────┐ ┌─v───┐ ┌──v──┐ ┌───v───┐
│Worker 1│ │Wkr 2│ │Wkr 3│ │Wkr 4  │
│Users:  │ │Users│ │Users│ │Users  │
│1,5,9   │ │2,6  │ │3,7  │ │4,8    │
└────────┘ └─────┘ └─────┘ └───────┘
```

**Pros:**

- ✅ Better isolation than single process
- ✅ Lighter than container-per-user
- ✅ Dynamic pool scaling
- ✅ Load distribution

**Cons:**

- ❌ More complex than Options A or B
- ❌ Still shares process between users
- ❌ Requires IPC between master and workers
- ❌ Session affinity required (sticky sessions)

**Best For:** Advanced use cases, custom deployments

---

### Option D: Serverless / Function-Based

**Description:** Each user interaction spawns a serverless function

**Status:** Future consideration (not recommended for IDE use case due to stateful nature)

---

## 5. Recommended Architecture

### Phase 1: Session-Based Multi-User (Quick Win)

- **Implementation Time:** 2-3 weeks
- **Use Case:** Teams of 5-20 users, internal deployments
- **Architecture:** Option A (Session-Based Isolation)

### Phase 2: Container-Based Multi-User (Production)

- **Implementation Time:** 4-6 weeks
- **Use Case:** Production SaaS, 20+ users, cloud deployment
- **Architecture:** Option B (Container-Per-User)

### Phase 3: Optimization & Scaling (Future)

- **Implementation Time:** 6-8 weeks
- **Use Case:** Enterprise, 100+ users, multi-region
- **Architecture:** Hybrid (Gateway + Containers + Auto-scaling)

---

## 6. Implementation Phases

### **Phase 1: Core Multi-User Foundation (Week 1-3)**

#### Week 1: Authentication & Session Management

- [ ] User database schema (SQLite initially, Postgres-ready)
- [ ] User CRUD operations (create, read, update, delete)
- [ ] Password hashing with Argon2 (already exists, extend for per-user)
- [ ] Session store implementation (in-memory → Redis migration path)
- [ ] JWT token generation and validation
- [ ] Login/logout/register endpoints
- [ ] Session middleware (replace single-password auth)

#### Week 2: User Isolation

- [ ] Per-user directory structure
  ```
  /data/users/{user-id}/
    ├─ settings.json
    ├─ extensions/
    ├─ workspaces/
    ├─ keybindings.json
    └─ state/
  ```
- [ ] Filesystem access layer (scoped to user directory)
- [ ] Settings provider per user
- [ ] Extension manager per user (or shared with isolation)
- [ ] Workspace isolation

#### Week 3: Resource Management & Admin

- [ ] Resource quota enforcement
  - Max sessions per user
  - Storage limits
  - Connection limits
- [ ] Session lifecycle management
  - Session creation
  - Session expiration
  - Idle timeout per user
  - Force logout
- [ ] Admin API endpoints
  - User management
  - Session monitoring
  - Resource usage stats
- [ ] Basic admin UI (optional)

### **Phase 2: Container-Based Isolation (Week 4-9)**

#### Week 4-5: Container Infrastructure

- [ ] Dockerfile for user containers
  - Minimal Alpine-based image
  - Pre-installed VSCode server
  - Security hardening
- [ ] Container lifecycle manager
  - Start container on user login
  - Stop container on logout/timeout
  - Container health checks
- [ ] Volume management
  - User data volumes
  - Shared read-only volumes (extensions library)
- [ ] Network isolation
  - Container networking
  - Port allocation
  - Reverse proxy routing

#### Week 6-7: Gateway Service

- [ ] Gateway/router service
  - Session routing to containers
  - WebSocket proxy
  - HTTP request forwarding
- [ ] Container registry
  - Track active containers
  - User → container mapping
  - Container metadata
- [ ] Load balancing
  - Session affinity
  - Health-based routing
  - Failover

#### Week 8-9: Orchestration & Scaling

- [ ] Kubernetes manifests (if using K8s)
  - Deployment configs
  - Service definitions
  - Ingress rules
  - HPA (Horizontal Pod Autoscaler)
- [ ] Docker Compose (if using Docker)
  - Multi-container setup
  - Volume definitions
  - Network configuration
- [ ] Auto-scaling policies
  - Container pool pre-warming
  - Scale-up/down triggers
  - Resource limits

### **Phase 3: Production Hardening (Week 10-14)**

#### Week 10: Security

- [ ] OAuth/SAML integration
- [ ] RBAC (Role-Based Access Control)
- [ ] Audit logging
- [ ] Security headers
- [ ] CSRF protection
- [ ] Rate limiting per user
- [ ] Vulnerability scanning

#### Week 11: Monitoring & Observability

- [ ] Metrics collection
  - User activity
  - Resource usage
  - Performance metrics
- [ ] Logging aggregation
- [ ] Alerting rules
- [ ] Dashboard (Grafana/custom)

#### Week 12: Performance Optimization

- [ ] Connection pooling
- [ ] Caching strategies
- [ ] Database query optimization
- [ ] Container startup optimization
- [ ] Resource pre-allocation

#### Week 13-14: Testing & Documentation

- [ ] Load testing
- [ ] Security testing
- [ ] Integration tests
- [ ] User documentation
- [ ] Admin documentation
- [ ] Deployment guides

---

## 7. Detailed Component Design

### 7.1 Authentication Service

```typescript
// src/node/services/auth/AuthService.ts

export interface User {
  id: string // UUID
  username: string // unique
  email: string // unique
  passwordHash: string // Argon2
  roles: string[] // ['user', 'admin']
  createdAt: Date
  updatedAt: Date
  lastLogin: Date
  isActive: boolean
  metadata: Record<string, any>
}

export interface Session {
  id: string // Session token (JWT or UUID)
  userId: string
  createdAt: Date
  expiresAt: Date
  lastActivity: Date
  ipAddress: string
  userAgent: string
  containerId?: string // For container mode
  metadata: Record<string, any>
}

export class AuthService {
  constructor(
    private userRepo: UserRepository,
    private sessionStore: SessionStore,
    private config: AuthConfig,
  ) {}

  // User management
  async createUser(username: string, email: string, password: string): Promise<User>
  async authenticateUser(username: string, password: string): Promise<User | null>
  async updateUser(userId: string, updates: Partial<User>): Promise<User>
  async deleteUser(userId: string): Promise<void>
  async getUserById(userId: string): Promise<User | null>
  async getUserByUsername(username: string): Promise<User | null>

  // Session management
  async createSession(userId: string, metadata: SessionMetadata): Promise<Session>
  async validateSession(sessionToken: string): Promise<Session | null>
  async refreshSession(sessionToken: string): Promise<Session>
  async revokeSession(sessionToken: string): Promise<void>
  async revokeUserSessions(userId: string): Promise<void>
  async getActiveSessions(userId: string): Promise<Session[]>

  // Token management
  generateJWT(user: User, session: Session): string
  verifyJWT(token: string): { user: User; session: Session } | null
}
```

### 7.2 Session Store

```typescript
// src/node/services/session/SessionStore.ts

export interface SessionStore {
  // CRUD operations
  set(sessionId: string, session: Session, ttl?: number): Promise<void>
  get(sessionId: string): Promise<Session | null>
  delete(sessionId: string): Promise<void>

  // Query operations
  getUserSessions(userId: string): Promise<Session[]>
  getAllActiveSessions(): Promise<Session[]>

  // Bulk operations
  deleteUserSessions(userId: string): Promise<void>
  deleteExpiredSessions(): Promise<void>

  // Statistics
  getSessionCount(): Promise<number>
  getUserSessionCount(userId: string): Promise<number>
}

// Implementations:
export class MemorySessionStore implements SessionStore {
  /* ... */
}
export class RedisSessionStore implements SessionStore {
  /* ... */
}
export class DatabaseSessionStore implements SessionStore {
  /* ... */
}
```

### 7.3 User Isolation Manager

```typescript
// src/node/services/isolation/UserIsolationManager.ts

export interface IsolationStrategy {
  // User environment setup
  initializeUserEnvironment(userId: string): Promise<UserEnvironment>
  destroyUserEnvironment(userId: string): Promise<void>

  // Resource access
  getUserDataPath(userId: string): string
  getUserSettingsPath(userId: string): string
  getUserExtensionsPath(userId: string): string
  getUserWorkspacesPath(userId: string): string

  // Resource limits
  enforceStorageQuota(userId: string): Promise<void>
  getResourceUsage(userId: string): Promise<ResourceUsage>
}

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
}

export interface ResourceLimits {
  maxStorageMB: number
  maxSessions: number
  maxConcurrentConnections: number
  maxMemoryMB?: number
  maxCPUPercent?: number
}

// Implementations:
export class DirectoryIsolationStrategy implements IsolationStrategy {
  /* ... */
}
export class ContainerIsolationStrategy implements IsolationStrategy {
  /* ... */
}
export class ProcessIsolationStrategy implements IsolationStrategy {
  /* ... */
}
```

### 7.4 Container Orchestrator (Phase 2)

```typescript
// src/node/services/container/ContainerOrchestrator.ts

export interface ContainerOrchestrator {
  // Container lifecycle
  startContainer(userId: string, session: Session): Promise<Container>
  stopContainer(containerId: string): Promise<void>
  restartContainer(containerId: string): Promise<void>

  // Container queries
  getContainer(containerId: string): Promise<Container | null>
  getUserContainer(userId: string, sessionId: string): Promise<Container | null>
  listContainers(filter?: ContainerFilter): Promise<Container[]>

  // Health checks
  checkContainerHealth(containerId: string): Promise<HealthStatus>

  // Resource management
  setContainerLimits(containerId: string, limits: ResourceLimits): Promise<void>
  getContainerStats(containerId: string): Promise<ContainerStats>
}

export interface Container {
  id: string
  userId: string
  sessionId: string
  image: string
  status: "starting" | "running" | "stopping" | "stopped" | "error"
  createdAt: Date
  ports: { host: number; container: number }[]
  volumes: VolumeMount[]
  limits: ResourceLimits
  health: HealthStatus
}

// Implementations:
export class DockerOrchestrator implements ContainerOrchestrator {
  /* ... */
}
export class KubernetesOrchestrator implements ContainerOrchestrator {
  /* ... */
}
export class LocalProcessOrchestrator implements ContainerOrchestrator {
  /* ... */
}
```

### 7.5 Gateway Service (Phase 2)

```typescript
// src/node/services/gateway/GatewayService.ts

export class GatewayService {
  constructor(
    private authService: AuthService,
    private sessionStore: SessionStore,
    private orchestrator: ContainerOrchestrator,
    private config: GatewayConfig,
  ) {}

  // Request routing
  async routeRequest(req: Request): Promise<RouteTarget>
  async routeWebSocket(req: Request, socket: Socket): Promise<RouteTarget>

  // Session management
  async handleLogin(username: string, password: string): Promise<SessionInfo>
  async handleLogout(sessionToken: string): Promise<void>

  // Container management
  async ensureUserContainer(userId: string, sessionId: string): Promise<Container>
  async cleanupIdleContainers(): Promise<void>
}

export interface RouteTarget {
  type: "local" | "container"
  host: string
  port: number
  path: string
  headers?: Record<string, string>
}

export interface SessionInfo {
  token: string
  user: User
  session: Session
  container?: Container
}
```

### 7.6 Resource Manager

```typescript
// src/node/services/resources/ResourceManager.ts

export class ResourceManager {
  // Quota enforcement
  async enforceQuota(userId: string, resource: ResourceType): Promise<boolean>
  async checkQuota(userId: string, resource: ResourceType): Promise<QuotaStatus>

  // Usage tracking
  async trackUsage(userId: string, usage: ResourceUsage): Promise<void>
  async getUsage(userId: string, period: TimePeriod): Promise<ResourceUsage>

  // Cleanup
  async cleanupUserResources(userId: string): Promise<void>
  async cleanupExpiredSessions(): Promise<void>
  async cleanupIdleContainers(idleThresholdMinutes: number): Promise<void>
}

export interface ResourceUsage {
  userId: string
  storage: { used: number; limit: number } // bytes
  sessions: { active: number; limit: number }
  connections: { current: number; limit: number }
  cpu?: { percent: number; limit: number }
  memory?: { mb: number; limit: number }
  bandwidth?: { mbps: number; limit: number }
}

export interface QuotaStatus {
  resource: ResourceType
  current: number
  limit: number
  available: number
  exceeded: boolean
}
```

---

## 8. Security Considerations

### 8.1 Authentication Security

**Single-User Mode:**

- ✅ Argon2 password hashing (current)
- ✅ Rate limiting on login (current)
- ✅ Secure cookie handling (current)

**Multi-User Mode:**

- ✅ Per-user password hashing (Argon2)
- ✅ JWT tokens with expiration
- ✅ Refresh token rotation
- ✅ Session revocation
- ✅ Multi-factor authentication (optional)
- ✅ OAuth/SAML integration (Phase 3)
- ✅ Password complexity requirements
- ✅ Account lockout after failed attempts

### 8.2 Isolation Security

**Directory-Based Isolation:**

- ⚠️ Relies on OS-level file permissions
- ⚠️ Potential for path traversal attacks
- ⚠️ Shared process memory
- ✅ Filesystem ACLs
- ✅ Chroot jails (optional)

**Container-Based Isolation:**

- ✅ Kernel-level isolation (namespaces, cgroups)
- ✅ Separate network namespaces
- ✅ Read-only root filesystem
- ✅ Non-root user in container
- ✅ Seccomp/AppArmor profiles
- ✅ Resource limits enforced by kernel

### 8.3 API Security

- ✅ HTTPS enforcement
- ✅ CSRF token validation
- ✅ Origin header validation
- ✅ Content Security Policy (CSP)
- ✅ Security headers (HSTS, X-Frame-Options, etc.)
- ✅ Input validation and sanitization
- ✅ SQL injection prevention (parameterized queries)
- ✅ XSS prevention (output encoding)

### 8.4 Audit Logging

**Events to Log:**

- User authentication (login, logout, failed attempts)
- User management (create, update, delete)
- Session events (create, expire, revoke)
- Resource access (file operations, terminal commands)
- Configuration changes
- Admin actions
- Security events (quota exceeded, suspicious activity)

**Log Format:**

```json
{
  "timestamp": "2025-11-15T10:30:00Z",
  "eventType": "user.login",
  "userId": "user-123",
  "username": "alice",
  "ipAddress": "192.168.1.100",
  "userAgent": "Mozilla/5.0...",
  "status": "success",
  "metadata": {
    "sessionId": "session-456",
    "mfa": false
  }
}
```

---

## 9. Scalability & Performance

### 9.1 Horizontal Scaling (Container Mode)

**Load Balancer Configuration:**

```nginx
upstream vscode_backend {
    # Session affinity by user ID (extracted from JWT)
    hash $cookie_session_token consistent;

    server backend1:3000 max_fails=3 fail_timeout=30s;
    server backend2:3000 max_fails=3 fail_timeout=30s;
    server backend3:3000 max_fails=3 fail_timeout=30s;
}

server {
    listen 443 ssl http2;
    server_name ide.example.com;

    location / {
        proxy_pass http://vscode_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts for long-running connections
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

### 9.2 Database Scaling

**User Database:**

- SQLite: Single-user or small teams (<100 users)
- PostgreSQL: Production deployments (with connection pooling)
- Read replicas for read-heavy operations

**Session Store:**

- Redis Cluster for high availability
- Redis Sentinel for automatic failover
- TTL-based auto-cleanup

### 9.3 Container Pool Management

**Pre-warming Strategy:**

```typescript
class ContainerPool {
  private warmPool: Container[] = []

  async preWarmContainers(count: number): Promise<void> {
    // Pre-start containers with base image
    // Assign to users on-demand (faster startup)
  }

  async assignContainer(userId: string): Promise<Container> {
    // Pop from warm pool or start new
  }

  async reclaimContainer(containerId: string): Promise<void> {
    // Clean and return to warm pool
  }
}
```

### 9.4 Performance Targets

| Metric                    | Target  | Notes                          |
| ------------------------- | ------- | ------------------------------ |
| **Login Response Time**   | < 500ms | Auth + session creation        |
| **IDE Load Time**         | < 2s    | Single-user mode               |
| **IDE Load Time**         | < 5s    | Multi-user (container startup) |
| **WebSocket Latency**     | < 50ms  | Terminal/file operations       |
| **Container Startup**     | < 3s    | Cold start                     |
| **Container Startup**     | < 1s    | Warm pool                      |
| **Max Concurrent Users**  | 100+    | Per gateway instance           |
| **Max Sessions Per User** | 5       | Configurable                   |

---

## 10. Migration Path

### 10.1 Single-User → Multi-User Migration

**Scenario:** Existing single-user deployment wants to enable multi-user

**Steps:**

1. **Backup Current Data**

   ```bash
   cp -r ~/.local/share/code-server ~/.local/share/code-server.backup
   cp -r ~/.config/code-server ~/.config/code-server.backup
   ```

2. **Update Configuration**

   ```yaml
   # .code-server.yaml
   deployment-mode: multi
   multi-user:
     auth:
       provider: database
       database:
         type: sqlite
         path: /data/users.db
   ```

3. **Create Admin User**

   ```bash
   code-server user create --username admin --email admin@example.com --role admin
   ```

4. **Migrate Existing Data** (optional)

   ```bash
   # Assign current data to admin user
   code-server migrate-data --from-single-user --to-user admin
   ```

5. **Restart Server**
   ```bash
   systemctl restart code-server
   ```

### 10.2 Directory-Based → Container-Based Migration

**Scenario:** Running multi-user in directory mode, want container isolation

**Steps:**

1. **Install Container Runtime**

   ```bash
   # Docker
   curl -fsSL https://get.docker.com | sh

   # Or Podman
   apt-get install podman
   ```

2. **Build User Container Image**

   ```bash
   docker build -t code-server-user:latest -f Dockerfile.user .
   ```

3. **Update Configuration**

   ```yaml
   multi-user:
     isolation:
       strategy: container # Changed from 'directory'
       container:
         runtime: docker # or podman
         image: code-server-user:latest
         network: bridge
   ```

4. **Migrate User Data to Volumes**

   ```bash
   # For each user
   docker volume create user-<user-id>-data
   docker cp /data/users/<user-id>/* user-<user-id>-data:/
   ```

5. **Rolling Restart**
   ```bash
   # Gradually move users to container mode
   # Old sessions continue in directory mode
   # New sessions start in containers
   ```

---

## 11. Configuration Examples

### 11.1 Development Setup (Single-User)

```yaml
# .code-server.yaml
bind-addr: 127.0.0.1:3000
auth: password
password: mysecretpassword
deployment-mode: single
cert: false
```

### 11.2 Small Team Setup (Multi-User, Directory Isolation)

```yaml
bind-addr: 0.0.0.0:3000
auth: none # Auth handled by multi-user system
deployment-mode: multi
cert: true
cert-path: /etc/ssl/certs/code-server.crt
cert-key-path: /etc/ssl/private/code-server.key

multi-user:
  auth:
    provider: database
    database:
      type: sqlite
      path: /var/lib/code-server/users.db
    session:
      store: memory # OK for single instance
      ttl: 86400

  isolation:
    strategy: directory
    base-path: /var/lib/code-server/users

  limits:
    max-sessions-per-user: 3
    max-concurrent-connections: 50
    storage-quota-mb: 5000

  features:
    audit-logging: true
    admin-dashboard: true
```

### 11.3 Production Setup (Multi-User, Container Isolation)

```yaml
bind-addr: 0.0.0.0:3000
auth: none
deployment-mode: multi
cert: false # Handled by reverse proxy

multi-user:
  auth:
    provider: database
    database:
      type: postgres
      host: postgres.internal
      port: 5432
      database: code_server
      username: code_server
      password: ${DB_PASSWORD} # From environment
    session:
      store: redis
      host: redis.internal
      port: 6379
      ttl: 43200 # 12 hours

  isolation:
    strategy: container
    container:
      runtime: docker
      image: code-server-user:latest
      network: code-server-network
      limits:
        memory: 2048m
        cpu: 2
      volumes:
        - type: volume
          name: user-{userId}-data
          mountPath: /home/coder
        - type: bind
          source: /opt/code-server/extensions
          mountPath: /usr/lib/code-server/extensions
          readOnly: true

  limits:
    max-sessions-per-user: 5
    max-concurrent-connections: 100
    storage-quota-mb: 10000
    memory-limit-mb: 2048
    cpu-limit-percent: 50

  features:
    audit-logging: true
    usage-analytics: true
    admin-dashboard: true
    metrics-export: prometheus

  scaling:
    container-pool:
      enabled: true
      warm-pool-size: 5
      max-idle-minutes: 30
    auto-cleanup:
      enabled: true
      idle-session-minutes: 60
      expired-session-cleanup-interval: 300
```

---

## 12. Monitoring & Observability

### 12.1 Metrics to Track

**System Metrics:**

- Active users count
- Active sessions count
- Container count (running, stopped, total)
- Resource usage (CPU, memory, storage)
- Request rate (HTTP, WebSocket)
- Response time (p50, p95, p99)

**User Metrics:**

- Login success/failure rate
- Session duration
- Active connections per user
- Storage usage per user
- Extension count per user

**Infrastructure Metrics:**

- Container startup time
- Container health status
- Database connection pool usage
- Redis memory usage
- Cache hit/miss ratio

### 12.2 Prometheus Metrics Export

```typescript
// src/node/services/metrics/MetricsExporter.ts

import { Registry, Counter, Gauge, Histogram } from "prom-client"

export class MetricsExporter {
  private registry = new Registry()

  // Counters
  private loginAttempts = new Counter({
    name: "code_server_login_attempts_total",
    help: "Total login attempts",
    labelNames: ["status"], // success, failure
  })

  private sessionCreated = new Counter({
    name: "code_server_sessions_created_total",
    help: "Total sessions created",
  })

  // Gauges
  private activeUsers = new Gauge({
    name: "code_server_active_users",
    help: "Current active users",
  })

  private activeSessions = new Gauge({
    name: "code_server_active_sessions",
    help: "Current active sessions",
  })

  private activeContainers = new Gauge({
    name: "code_server_active_containers",
    help: "Current active containers",
    labelNames: ["status"], // running, starting, stopping
  })

  // Histograms
  private requestDuration = new Histogram({
    name: "code_server_request_duration_seconds",
    help: "Request duration in seconds",
    labelNames: ["method", "route", "status"],
  })

  private containerStartupDuration = new Histogram({
    name: "code_server_container_startup_seconds",
    help: "Container startup duration in seconds",
  })

  getMetrics(): string {
    return this.registry.metrics()
  }
}
```

---

## 13. Testing Strategy

### 13.1 Unit Tests

- Authentication service
- Session management
- User isolation
- Resource limits enforcement

### 13.2 Integration Tests

- Login/logout flow
- Multi-user concurrent access
- Container lifecycle
- Database operations

### 13.3 Load Tests

```bash
# Example using k6
k6 run --vus 50 --duration 5m load-test.js

# Simulate:
# - 50 concurrent users
# - Login, open IDE, edit files, run terminal
# - Measure response times, error rates
```

### 13.4 Security Tests

- Authentication bypass attempts
- Path traversal attempts
- Resource exhaustion attacks
- Session hijacking tests
- CSRF tests

---

## 14. Deployment Examples

### 14.1 Docker Compose (Development/Small Team)

```yaml
version: "3.8"

services:
  gateway:
    image: code-server-gateway:latest
    ports:
      - "3000:3000"
    environment:
      - DEPLOYMENT_MODE=multi
      - AUTH_PROVIDER=database
      - DB_HOST=postgres
      - REDIS_HOST=redis
    volumes:
      - ./config:/etc/code-server
      - /var/run/docker.sock:/var/run/docker.sock
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=code_server
      - POSTGRES_USER=code_server
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data

volumes:
  postgres-data:
  redis-data:
```

### 14.2 Kubernetes (Production)

```yaml
# gateway-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: code-server-gateway
spec:
  replicas: 3
  selector:
    matchLabels:
      app: code-server-gateway
  template:
    metadata:
      labels:
        app: code-server-gateway
    spec:
      containers:
        - name: gateway
          image: code-server-gateway:latest
          ports:
            - containerPort: 3000
          env:
            - name: DEPLOYMENT_MODE
              value: "multi"
            - name: DB_HOST
              value: "postgres-service"
            - name: REDIS_HOST
              value: "redis-service"
          resources:
            requests:
              memory: "512Mi"
              cpu: "500m"
            limits:
              memory: "1Gi"
              cpu: "1000m"
          livenessProbe:
            httpGet:
              path: /healthz
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /healthz
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5

---
# gateway-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: code-server-gateway
spec:
  selector:
    app: code-server-gateway
  ports:
    - protocol: TCP
      port: 80
      targetPort: 3000
  sessionAffinity: ClientIP # Session stickiness

---
# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: code-server-ingress
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
    nginx.ingress.kubernetes.io/websocket-services: "code-server-gateway"
spec:
  tls:
    - hosts:
        - ide.example.com
      secretName: code-server-tls
  rules:
    - host: ide.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: code-server-gateway
                port:
                  number: 80
```

---

## 15. Summary & Next Steps

### Summary

This architecture design provides:

1. ✅ **Two clear deployment modes** (single-user, multi-user)
2. ✅ **Phased implementation** (directory → container isolation)
3. ✅ **Production-ready** (security, scalability, monitoring)
4. ✅ **Flexible** (SQLite → Postgres, memory → Redis)
5. ✅ **Backward compatible** (single-user mode unchanged)

### Recommended Approach

**For MVP (Weeks 1-3):**

- Implement Session-Based Multi-User (Option A)
- SQLite + in-memory sessions
- Directory-based isolation
- Basic admin API

**For Production (Weeks 4-9):**

- Migrate to Container-Based (Option B)
- Postgres + Redis
- Docker orchestration
- Full monitoring

**For Scale (Weeks 10+):**

- Kubernetes deployment
- Auto-scaling
- Multi-region
- Advanced security (OAuth, SAML)

### Next Steps

1. **Review & Approve Architecture**
   - Stakeholder review
   - Security review
   - Infrastructure team review

2. **Create Implementation Plan**
   - Assign tasks to team
   - Set up development environment
   - Create GitHub issues

3. **Prototype Phase 1**
   - Build auth service
   - Build session management
   - Build directory isolation
   - Integration testing

4. **Iterate & Deploy**
   - Deploy to staging
   - Load testing
   - Security audit
   - Production deployment

---

**Document Version:** 1.0
**Last Updated:** 2025-11-15
**Status:** Ready for Implementation
