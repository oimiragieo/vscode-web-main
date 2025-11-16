# AI Website + Web IDE Integration Architecture

**Version:** 1.0
**Date:** 2025-11-16
**Status:** Design Complete

---

## Executive Summary

This document outlines the architecture for integrating the VSCode Web IDE into your AI-powered website, creating a unified platform with both `/chat` and `/ide` features while ensuring complete user session isolation.

### Key Goals

1. **Unified Platform**: Single website with `/chat` and `/ide` routes
2. **Shared Authentication**: Users authenticate once, access both features
3. **Complete Isolation**: Each user's IDE session is completely isolated
4. **AI Integration**: IDE can leverage the same AI infrastructure as chat
5. **World-Class Features**: Implement comprehensive IDE capabilities

---

## Architecture Overview

### System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     AI Website Frontend                         │
│  ┌──────────────────┐           ┌──────────────────────────────┐│
│  │   /chat          │           │         /ide                 ││
│  │  • Chat UI       │           │  • VSCode Editor             ││
│  │  • Message List  │           │  • File Explorer             ││
│  │  • AI Responses  │           │  • Terminal                  ││
│  └──────────────────┘           │  • Extensions                ││
│                                  └──────────────────────────────┘│
└──────────────────┬───────────────────────────┬───────────────────┘
                   │                           │
                   v                           v
┌─────────────────────────────────────────────────────────────────┐
│                   Gateway / API Router                          │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  Shared Services:                                         │ │
│  │  • Authentication (JWT/Session)                           │ │
│  │  • User Management                                        │ │
│  │  • Rate Limiting                                          │ │
│  │  • Audit Logging                                          │ │
│  └───────────────────────────────────────────────────────────┘ │
└──────────────────┬───────────────────────────┬───────────────────┘
                   │                           │
                   v                           v
       ┌───────────────────────┐    ┌────────────────────────────┐
       │  Chat Service         │    │  IDE Service               │
       │  ┌────────────────┐   │    │  ┌──────────────────────┐  │
       │  │ AI Provider    │   │    │  │ Code Server          │  │
       │  │ (Claude API)   │◄──┼────┼──┤ (VSCode Web)         │  │
       │  └────────────────┘   │    │  └──────────────────────┘  │
       │  ┌────────────────┐   │    │  ┌──────────────────────┐  │
       │  │ Conversation   │   │    │  │ User Isolation       │  │
       │  │ Storage        │   │    │  │ • Containers/Dirs    │  │
       │  └────────────────┘   │    │  └──────────────────────┘  │
       └───────────────────────┘    └────────────────────────────┘
                   │                           │
                   v                           v
       ┌───────────────────────────────────────────────────────┐
       │            Shared Database Layer                      │
       │  ┌──────────┐  ┌──────────┐  ┌────────────────────┐  │
       │  │  Users   │  │ Sessions │  │  Chat Conversations│  │
       │  └──────────┘  └──────────┘  └────────────────────┘  │
       │  ┌──────────┐  ┌──────────┐  ┌────────────────────┐  │
       │  │IDE State │  │  Audit   │  │   User Settings    │  │
       │  └──────────┘  └──────────┘  └────────────────────┘  │
       └───────────────────────────────────────────────────────┘
```

---

## Integration Strategy

### Option 1: Monolithic Integration (Recommended for MVP)

**Architecture**: Single Node.js application serving both chat and IDE

```typescript
// Main server structure
src/
├── server/
│   ├── app.ts                      # Main Express app
│   ├── routes/
│   │   ├── chat/                   # Chat routes
│   │   │   ├── messages.ts
│   │   │   ├── conversations.ts
│   │   │   └── ai.ts
│   │   ├── ide/                    # IDE routes
│   │   │   ├── workspaces.ts
│   │   │   ├── files.ts
│   │   │   └── vscode.ts
│   │   └── auth/                   # Shared auth
│   │       ├── login.ts
│   │       ├── register.ts
│   │       └── session.ts
│   ├── services/
│   │   ├── auth/                   # Authentication
│   │   ├── ai/                     # AI provider integration
│   │   ├── chat/                   # Chat logic
│   │   └── ide/                    # IDE integration
│   └── middleware/
│       ├── auth.ts
│       ├── rateLimit.ts
│       └── userContext.ts
```

**Pros:**
- ✅ Simpler deployment
- ✅ Shared authentication & session management
- ✅ Easier to start
- ✅ Lower operational complexity

**Cons:**
- ❌ Harder to scale independently
- ❌ Single point of failure
- ❌ Resource contention between chat and IDE

**Best for:** MVP, teams < 100 users

### Option 2: Microservices Architecture

**Architecture**: Separate services for chat and IDE, unified gateway

```
Gateway (nginx/API Gateway)
├── /chat/* → Chat Service (Port 3000)
├── /ide/* → IDE Service (Port 8080)
└── /api/* → API Service (Port 4000)
```

**Pros:**
- ✅ Independent scaling
- ✅ Technology flexibility
- ✅ Better fault isolation
- ✅ Team autonomy

**Cons:**
- ❌ More complex deployment
- ❌ Distributed session management required
- ❌ Network overhead

**Best for:** Production SaaS, teams > 100 users

---

## Session Isolation Strategy

### Critical Requirement: User Isolation

Each user MUST have:
- ✅ Isolated filesystem workspace
- ✅ Isolated process/container
- ✅ Separate settings & extensions
- ✅ Resource quotas (CPU, memory, storage)
- ✅ Network isolation (optional)

### Implementation Options

#### 1. Directory-Based Isolation (Phase 1 - Fastest)

```
/var/lib/ai-website/
├── users/
│   ├── user-123/
│   │   ├── workspaces/          # User's project files
│   │   ├── settings/            # VS Code settings
│   │   ├── extensions/          # Installed extensions
│   │   └── .metadata/           # IDE state
│   ├── user-456/
│   │   └── ...
```

**Implementation:**
- OS-level permissions (chmod 700)
- Disk quotas (quota, setquota)
- chroot jails (optional)

**Pros:** Fast, simple, low overhead
**Cons:** Limited isolation, same process space

#### 2. Container-Based Isolation (Phase 2 - Recommended)

Each user gets a Docker container:

```yaml
# User container template
services:
  ide-user-123:
    image: ai-website-ide:latest
    container_name: ide-user-123
    environment:
      - USER_ID=123
      - WORKSPACE=/workspace
    volumes:
      - user-123-data:/workspace
      - user-123-settings:/home/coder/.config
    resources:
      limits:
        cpus: '2'
        memory: 4G
      reservations:
        memory: 1G
    networks:
      - user-123-network
```

**Pros:**
- ✅ Complete isolation
- ✅ Resource limits enforced
- ✅ Network isolation
- ✅ Easy cleanup

**Cons:**
- ❌ Container startup overhead (2-5 seconds)
- ❌ More complex orchestration
- ❌ Higher resource usage

#### 3. VM-Based Isolation (Phase 3 - Maximum Security)

Each user gets a lightweight VM (Firecracker, gVisor)

**Pros:** Strongest isolation
**Cons:** Highest overhead, most complex

---

## Shared Authentication & Session Management

### Database Schema

```sql
-- Users table (shared between chat and IDE)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name VARCHAR(255),
  avatar_url TEXT,
  roles TEXT[] DEFAULT ARRAY['user'],
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP,
  is_active BOOLEAN DEFAULT TRUE,
  settings JSONB DEFAULT '{}'::jsonb
);

-- Sessions table
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  last_activity TIMESTAMP DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Chat conversations
CREATE TABLE chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Chat messages
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL, -- 'user' | 'assistant' | 'system'
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- IDE workspaces
CREATE TABLE ide_workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  path TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  last_accessed TIMESTAMP DEFAULT NOW(),
  container_id TEXT,
  status VARCHAR(20) DEFAULT 'stopped', -- 'running' | 'stopped' | 'starting' | 'error'
  metadata JSONB DEFAULT '{}'::jsonb,
  UNIQUE(user_id, name)
);

-- IDE session state
CREATE TABLE ide_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES ide_workspaces(id) ON DELETE CASCADE,
  session_token TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  last_activity TIMESTAMP DEFAULT NOW(),
  container_id TEXT,
  process_id INTEGER,
  port INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Audit log
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMP DEFAULT NOW(),
  user_id UUID REFERENCES users(id),
  event_type VARCHAR(50) NOT NULL,
  resource_type VARCHAR(50),
  resource_id TEXT,
  action VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL, -- 'success' | 'failure' | 'error'
  ip_address INET,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  error TEXT
);

-- Indexes
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX idx_chat_conversations_user_id ON chat_conversations(user_id);
CREATE INDEX idx_chat_messages_conversation_id ON chat_messages(conversation_id);
CREATE INDEX idx_ide_workspaces_user_id ON ide_workspaces(user_id);
CREATE INDEX idx_ide_sessions_user_id ON ide_sessions(user_id);
CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp);
CREATE INDEX idx_audit_log_event_type ON audit_log(event_type);
```

### Authentication Flow

```typescript
// Shared authentication middleware
async function authenticateUser(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies['session_token'] || req.headers['authorization']?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const session = await SessionService.validate(token);

  if (!session || session.expiresAt < new Date()) {
    return res.status(401).json({ error: 'Session expired' });
  }

  const user = await UserService.findById(session.userId);

  if (!user || !user.isActive) {
    return res.status(401).json({ error: 'User not found or inactive' });
  }

  // Update last activity
  await SessionService.updateActivity(session.id);

  // Attach to request
  req.user = user;
  req.session = session;

  next();
}
```

---

## AI Integration Architecture

### Shared AI Service

Both chat and IDE can use the same AI infrastructure:

```typescript
// Shared AI service
class AIService {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  // For chat
  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    const response = await this.client.messages.create({
      model: options?.model || 'claude-sonnet-4-5-20250929',
      max_tokens: options?.maxTokens || 4096,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content
      }))
    });

    return {
      content: response.content[0].text,
      usage: response.usage
    };
  }

  // For IDE code completion
  async complete(code: string, context: CodeContext): Promise<string> {
    const prompt = this.buildCompletionPrompt(code, context);
    const response = await this.chat([
      { role: 'user', content: prompt }
    ], { model: 'claude-sonnet-4-5-20250929', maxTokens: 2048 });

    return response.content;
  }

  // For IDE code explanation
  async explain(code: string, language: string): Promise<string> {
    const prompt = `Explain this ${language} code:\n\n${code}`;
    const response = await this.chat([
      { role: 'user', content: prompt }
    ]);

    return response.content;
  }

  // For IDE debugging
  async debug(error: Error, code: string, context: CodeContext): Promise<DebugSuggestion> {
    const prompt = this.buildDebugPrompt(error, code, context);
    const response = await this.chat([
      { role: 'user', content: prompt }
    ], { model: 'claude-sonnet-4-5-20250929' });

    return this.parseDebugResponse(response.content);
  }

  // For IDE refactoring
  async refactor(code: string, instruction: string): Promise<string> {
    const prompt = `Refactor this code: ${instruction}\n\n${code}`;
    const response = await this.chat([
      { role: 'user', content: prompt }
    ]);

    return response.content;
  }
}
```

### IDE AI Features Integration

```typescript
// IDE-specific AI routes
router.post('/api/ide/ai/complete', authenticateUser, async (req, res) => {
  const { code, cursor, language, context } = req.body;

  const completion = await aiService.complete(code, {
    cursor,
    language,
    ...context
  });

  await AuditLog.create({
    userId: req.user.id,
    eventType: 'ai.code.complete',
    resourceType: 'code',
    action: 'generate',
    status: 'success'
  });

  res.json({ completion });
});

router.post('/api/ide/ai/explain', authenticateUser, async (req, res) => {
  const { code, language } = req.body;

  const explanation = await aiService.explain(code, language);

  res.json({ explanation });
});

router.post('/api/ide/ai/debug', authenticateUser, async (req, res) => {
  const { error, code, context } = req.body;

  const suggestion = await aiService.debug(error, code, context);

  res.json({ suggestion });
});

router.post('/api/ide/ai/refactor', authenticateUser, async (req, res) => {
  const { code, instruction } = req.body;

  const refactoredCode = await aiService.refactor(code, instruction);

  res.json({ code: refactoredCode });
});
```

---

## Routes Structure

### Frontend Routes

```typescript
// React Router or Next.js routes
const routes = [
  {
    path: '/',
    component: HomePage
  },
  {
    path: '/login',
    component: LoginPage
  },
  {
    path: '/register',
    component: RegisterPage
  },
  {
    path: '/chat',
    component: ChatPage,
    requireAuth: true
  },
  {
    path: '/chat/:conversationId',
    component: ChatPage,
    requireAuth: true
  },
  {
    path: '/ide',
    component: IDEPage,
    requireAuth: true
  },
  {
    path: '/ide/workspace/:workspaceId',
    component: IDEPage,
    requireAuth: true
  },
  {
    path: '/settings',
    component: SettingsPage,
    requireAuth: true
  },
  {
    path: '/admin',
    component: AdminDashboard,
    requireAuth: true,
    requireRole: 'admin'
  }
];
```

### Backend API Routes

```typescript
// Express routes
app.use('/api/auth', authRoutes);           // Authentication
app.use('/api/users', userRoutes);          // User management
app.use('/api/chat', chatRoutes);           // Chat features
app.use('/api/ide', ideRoutes);             // IDE features
app.use('/api/admin', adminRoutes);         // Admin features
app.use('/api/ai', aiRoutes);               // Shared AI features

// WebSocket routes
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'ws://localhost');

  if (url.pathname.startsWith('/chat/')) {
    handleChatWebSocket(ws, req);
  } else if (url.pathname.startsWith('/ide/')) {
    handleIDEWebSocket(ws, req);
  }
});
```

---

## Deployment Architecture

### Development (Docker Compose)

```yaml
version: '3.8'

services:
  # Main application
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://postgres:password@postgres:5432/ai_website
      - REDIS_URL=redis://redis:6379
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
    volumes:
      - ./src:/app/src
      - user-workspaces:/var/lib/ai-website/users
      - /var/run/docker.sock:/var/run/docker.sock  # For container-based isolation
    depends_on:
      - postgres
      - redis

  # Database
  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=ai_website
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres-data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  # Session store & cache
  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data
    ports:
      - "6379:6379"

  # Optional: Nginx proxy
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - app

volumes:
  postgres-data:
  redis-data:
  user-workspaces:
```

### Production (Kubernetes)

```yaml
# Deployment example
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ai-website
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ai-website
  template:
    metadata:
      labels:
        app: ai-website
    spec:
      containers:
      - name: app
        image: your-registry/ai-website:latest
        ports:
        - containerPort: 3000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: url
        - name: REDIS_URL
          value: redis://redis-service:6379
        - name: ANTHROPIC_API_KEY
          valueFrom:
            secretKeyRef:
              name: api-keys
              key: anthropic
        resources:
          limits:
            memory: "2Gi"
            cpu: "1000m"
          requests:
            memory: "1Gi"
            cpu: "500m"
        volumeMounts:
        - name: user-workspaces
          mountPath: /var/lib/ai-website/users
        - name: docker-sock
          mountPath: /var/run/docker.sock
      volumes:
      - name: user-workspaces
        persistentVolumeClaim:
          claimName: user-workspaces-pvc
      - name: docker-sock
        hostPath:
          path: /var/run/docker.sock
```

---

## Security Considerations

### 1. Authentication & Authorization
- ✅ JWT tokens or secure session cookies
- ✅ Password hashing (Argon2)
- ✅ Rate limiting on auth endpoints
- ✅ CSRF protection
- ✅ Role-based access control (RBAC)

### 2. IDE Session Isolation
- ✅ User workspaces isolated by containers/directories
- ✅ File system permissions (chmod 700)
- ✅ Process isolation (containers)
- ✅ Network isolation (optional)
- ✅ Resource quotas enforced

### 3. Code Execution Security
- ✅ Sandboxed execution environments
- ✅ Limited network access from user containers
- ✅ No access to host system
- ✅ Readonly system files
- ✅ Resource limits (CPU, memory, disk)

### 4. AI API Security
- ✅ API keys stored in environment variables
- ✅ Rate limiting on AI endpoints
- ✅ Usage tracking per user
- ✅ Cost monitoring and alerts

### 5. Data Privacy
- ✅ User data encrypted at rest
- ✅ HTTPS for all connections
- ✅ Session tokens httpOnly and secure
- ✅ Regular security audits
- ✅ GDPR compliance

---

## Performance Optimization

### 1. Container Pool Management

Pre-warm containers for faster startup:

```typescript
class ContainerPoolManager {
  private warmPool: Map<string, string[]> = new Map();

  async initializeWarmPool(size: number = 5): Promise<void> {
    for (let i = 0; i < size; i++) {
      const containerId = await this.createContainer({
        image: 'ai-website-ide:latest',
        warmPool: true
      });
      this.warmPool.get('default')?.push(containerId);
    }
  }

  async assignToUser(userId: string): Promise<string> {
    const containers = this.warmPool.get('default');
    if (containers && containers.length > 0) {
      const containerId = containers.pop()!;
      await this.configureForUser(containerId, userId);
      return containerId;
    }

    // Create new container if pool is empty
    return this.createContainer({ userId });
  }
}
```

### 2. Caching Strategy

```typescript
// Cache user workspaces
const workspaceCache = new LRUCache({
  max: 1000,
  ttl: 1000 * 60 * 30 // 30 minutes
});

// Cache IDE state
const ideStateCache = new LRUCache({
  max: 500,
  ttl: 1000 * 60 * 15 // 15 minutes
});

// Cache AI responses (optional)
const aiResponseCache = new LRUCache({
  max: 10000,
  ttl: 1000 * 60 * 60 // 1 hour
});
```

### 3. Database Optimization

- Connection pooling (pg-pool)
- Query result caching
- Prepared statements
- Proper indexing
- Read replicas for scaling

### 4. Static Asset Optimization

- CDN for frontend assets
- Code splitting
- Lazy loading
- Service worker for offline support

---

## Monitoring & Observability

### Metrics to Track

```typescript
// Prometheus metrics
const metrics = {
  // User metrics
  activeUsers: new Gauge({ name: 'active_users_total' }),
  newRegistrations: new Counter({ name: 'user_registrations_total' }),

  // Chat metrics
  chatMessages: new Counter({ name: 'chat_messages_total' }),
  chatConversations: new Gauge({ name: 'chat_conversations_active' }),
  aiRequestLatency: new Histogram({ name: 'ai_request_duration_seconds' }),

  // IDE metrics
  ideSessionsActive: new Gauge({ name: 'ide_sessions_active' }),
  ideContainerStartup: new Histogram({ name: 'ide_container_startup_seconds' }),
  ideFilesOpen: new Gauge({ name: 'ide_files_open_total' }),
  ideCPUUsage: new Gauge({ name: 'ide_cpu_usage_percent' }),
  ideMemoryUsage: new Gauge({ name: 'ide_memory_usage_bytes' }),

  // System metrics
  httpRequests: new Counter({ name: 'http_requests_total' }),
  httpErrors: new Counter({ name: 'http_errors_total' }),
  databaseQueries: new Histogram({ name: 'database_query_duration_seconds' })
};
```

### Logging

```typescript
// Structured logging with Winston
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

// Log examples
logger.info('User logged in', { userId, ipAddress });
logger.warn('Rate limit exceeded', { userId, endpoint });
logger.error('AI request failed', { userId, error });
```

---

## Cost Management

### AI API Usage

```typescript
class AIUsageTracker {
  async trackUsage(userId: string, request: AIRequest, response: AIResponse): Promise<void> {
    await db.query(`
      INSERT INTO ai_usage (user_id, model, input_tokens, output_tokens, cost_usd)
      VALUES ($1, $2, $3, $4, $5)
    `, [
      userId,
      request.model,
      response.usage.input_tokens,
      response.usage.output_tokens,
      this.calculateCost(request.model, response.usage)
    ]);
  }

  async getUserUsage(userId: string, period: 'day' | 'month'): Promise<UsageStats> {
    const result = await db.query(`
      SELECT
        SUM(input_tokens) as total_input_tokens,
        SUM(output_tokens) as total_output_tokens,
        SUM(cost_usd) as total_cost
      FROM ai_usage
      WHERE user_id = $1
        AND created_at > NOW() - INTERVAL '1 ${period}'
    `, [userId]);

    return result.rows[0];
  }

  async enforceQuota(userId: string): Promise<boolean> {
    const usage = await this.getUserUsage(userId, 'month');
    const userPlan = await this.getUserPlan(userId);

    return usage.total_cost < userPlan.monthlyLimit;
  }
}
```

### Resource Quotas

```yaml
# Per-user quotas
quotas:
  free:
    storage: 1GB
    cpu: 0.5 cores
    memory: 1GB
    ai_tokens_monthly: 100000
    ide_hours_monthly: 10

  pro:
    storage: 10GB
    cpu: 2 cores
    memory: 4GB
    ai_tokens_monthly: 1000000
    ide_hours_monthly: 100

  enterprise:
    storage: 100GB
    cpu: 8 cores
    memory: 16GB
    ai_tokens_monthly: unlimited
    ide_hours_monthly: unlimited
```

---

## Summary

This architecture provides:

✅ **Unified Platform**: Single application with `/chat` and `/ide`
✅ **Complete Isolation**: Users cannot access each other's data
✅ **Shared AI Infrastructure**: Both features use same AI service
✅ **Scalable Design**: Can grow from MVP to enterprise
✅ **Security First**: Authentication, authorization, audit logging
✅ **Production Ready**: Monitoring, logging, error handling

**Recommended Implementation Path:**
1. Start with Monolithic + Directory Isolation (MVP)
2. Add Container Isolation (Production v1)
3. Split to Microservices if needed (Scale)

Next steps: See `WORLD_CLASS_IDE_FEATURES.md` for comprehensive feature implementation plan.
