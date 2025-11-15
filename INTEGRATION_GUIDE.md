# VSCode Web IDE - Integration Guide

This guide explains how to integrate the VSCode Web IDE into your existing application.

## Table of Contents

- [Quick Start](#quick-start)
- [Deployment Methods](#deployment-methods)
  - [Docker](#docker)
  - [NPM Package](#npm-package)
  - [Kubernetes](#kubernetes)
  - [Standalone](#standalone)
- [Integration Patterns](#integration-patterns)
- [Configuration](#configuration)
- [Security Best Practices](#security-best-practices)
- [API Reference](#api-reference)
- [Examples](#examples)

---

## Quick Start

### Using Docker (Recommended)

```bash
# 1. Clone the repository
git clone <repository-url>
cd vscode-web-main

# 2. Copy environment file
cp .env.example .env

# 3. Edit .env and set your password
nano .env  # Set IDE_PASSWORD=your-secure-password

# 4. Start with Docker Compose
docker-compose up -d

# 5. Access at http://localhost:8080
```

### Using NPM

```bash
# 1. Install dependencies
npm install

# 2. Build the application
npm run build:vscode
npm run build

# 3. Start the server
PASSWORD=your-password node out/node/entry.js
```

---

## Deployment Methods

### 1. Docker

#### Basic Deployment

```dockerfile
# Use the official image
FROM vscode-web-ide:latest

# Set environment variables
ENV IDE_PASSWORD=your-secure-password

# Expose port
EXPOSE 8080

# Start the server
CMD ["start"]
```

#### Docker Compose

```yaml
version: "3.8"
services:
  ide:
    image: vscode-web-ide:latest
    ports:
      - "8080:8080"
    environment:
      - PASSWORD=your-password
      - DISABLE_TELEMETRY=true
    volumes:
      - ./workspace:/home/coder/project
      - vscode-data:/home/coder/.local/share/code-server
volumes:
  vscode-data:
```

#### Build Custom Image

```bash
# Build optimized production image
docker build -f Dockerfile.optimized -t my-vscode-ide:latest .

# Run the container
docker run -d \
  -p 8080:8080 \
  -e PASSWORD=your-password \
  -v $(pwd)/workspace:/home/coder/project \
  my-vscode-ide:latest
```

### 2. Kubernetes

#### Basic Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: vscode-web-ide
spec:
  replicas: 1
  selector:
    matchLabels:
      app: vscode-ide
  template:
    metadata:
      labels:
        app: vscode-ide
    spec:
      containers:
        - name: ide
          image: vscode-web-ide:latest
          ports:
            - containerPort: 8080
          env:
            - name: PASSWORD
              valueFrom:
                secretKeyRef:
                  name: ide-secrets
                  key: password
          volumeMounts:
            - name: data
              mountPath: /home/coder/.local/share/code-server
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: vscode-data-pvc
---
apiVersion: v1
kind: Service
metadata:
  name: vscode-ide-service
spec:
  selector:
    app: vscode-ide
  ports:
    - port: 80
      targetPort: 8080
  type: LoadBalancer
```

#### With Ingress (HTTPS)

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: vscode-ide-ingress
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/websocket-services: vscode-ide-service
spec:
  tls:
    - hosts:
        - ide.yourdomain.com
      secretName: ide-tls
  rules:
    - host: ide.yourdomain.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: vscode-ide-service
                port:
                  number: 80
```

### 3. NPM Package (Embedded)

#### Install as Dependency

```bash
npm install @vscode-web-ide/core
```

#### Integrate into Express App

```typescript
import express from "express"
import { createIDEMiddleware } from "@vscode-web-ide/core"

const app = express()

// Mount IDE at /ide path
app.use(
  "/ide",
  createIDEMiddleware({
    auth: {
      type: "password",
      password: process.env.IDE_PASSWORD,
    },
    basePath: "/ide",
    userDataDir: "./data/ide",
  }),
)

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000")
  console.log("IDE available at http://localhost:3000/ide")
})
```

#### Use Plugin System

```typescript
import { WebIDE, BasePlugin } from "@vscode-web-ide/core"

// Create custom plugin
class MyAuthPlugin extends BasePlugin {
  metadata = {
    name: "my-auth",
    version: "1.0.0",
    description: "Custom authentication",
  }

  async init(context) {
    context.app.use("/auth", this.authMiddleware)
  }

  authMiddleware = (req, res, next) => {
    // Your auth logic
    next()
  }
}

// Start IDE with plugin
const ide = new WebIDE({
  port: 8080,
  plugins: [new MyAuthPlugin()],
})

await ide.start()
```

### 4. Standalone Deployment

#### Systemd Service (Linux)

```ini
# /etc/systemd/system/vscode-ide.service
[Unit]
Description=VSCode Web IDE
After=network.target

[Service]
Type=simple
User=coder
WorkingDirectory=/opt/vscode-ide
Environment="PASSWORD=your-password"
Environment="NODE_ENV=production"
ExecStart=/usr/bin/node out/node/entry.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start service
sudo systemctl enable vscode-ide
sudo systemctl start vscode-ide
sudo systemctl status vscode-ide
```

---

## Integration Patterns

### Pattern 1: Reverse Proxy Integration

Use behind Nginx, Apache, or Traefik:

#### Nginx Configuration

```nginx
server {
    listen 80;
    server_name ide.yourdomain.com;

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

#### Traefik Labels (Docker)

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.ide.rule=Host(`ide.example.com`)"
  - "traefik.http.routers.ide.entrypoints=websecure"
  - "traefik.http.routers.ide.tls.certresolver=letsencrypt"
```

### Pattern 2: Multi-Tenant Deployment

Deploy separate instances for each user/tenant:

```typescript
import { WebIDE } from "@vscode-web-ide/core"

async function createTenantIDE(tenantId: string, port: number) {
  const ide = new WebIDE({
    port,
    auth: {
      type: "password",
      password: getTenantPassword(tenantId),
    },
    userDataDir: `/data/tenants/${tenantId}`,
    workspaceDir: `/workspace/${tenantId}`,
  })

  await ide.start()
  return ide
}

// Create IDE for each tenant
const tenant1 = await createTenantIDE("tenant-1", 8081)
const tenant2 = await createTenantIDE("tenant-2", 8082)
```

### Pattern 3: Ephemeral/Session-Based

Create temporary IDE instances:

```typescript
import { WebIDE } from "@vscode-web-ide/core"

class IDESessionManager {
  private sessions = new Map()

  async createSession(userId: string) {
    const port = await this.findFreePort()
    const ide = new WebIDE({
      port,
      auth: { type: "none" }, // Auth handled at proxy level
      userDataDir: `/tmp/ide-sessions/${userId}`,
      idleTimeout: 3600, // 1 hour
    })

    await ide.start()
    this.sessions.set(userId, { ide, port })

    return `http://localhost:${port}`
  }

  async destroySession(userId: string) {
    const session = this.sessions.get(userId)
    if (session) {
      await session.ide.stop()
      this.sessions.delete(userId)
      // Cleanup temp files
      await fs.rm(`/tmp/ide-sessions/${userId}`, { recursive: true })
    }
  }
}
```

---

## Configuration

### Environment Variables

See `.env.example` for all available options.

### Configuration File

Create `config.yaml`:

```yaml
# Server
bind-addr: 0.0.0.0:8080

# Authentication
auth: password
password: your-password

# Security
cert: false
disable-telemetry: true
trusted-origins:
  - https://yourdomain.com

# Paths
user-data-dir: /data/code-server
extensions-dir: /data/extensions

# Features
disable-update-check: false
enable-telemetry: false

# Customization
app-name: "My IDE"
welcome-text: "Welcome to My IDE"
locale: en
```

Load config:

```bash
node out/node/entry.js --config config.yaml
```

---

## Security Best Practices

### 1. Use Strong Passwords

```bash
# Generate a strong password
openssl rand -base64 32

# Or use argon2 hashed password
npm install -g argon2-cli
echo -n "your-password" | argon2-cli -e
```

### 2. Enable HTTPS

```yaml
cert: /path/to/cert.pem
cert-key: /path/to/key.pem
```

### 3. Restrict Access

```nginx
# Nginx - IP whitelist
location / {
    allow 192.168.1.0/24;
    deny all;
    proxy_pass http://localhost:8080;
}
```

### 4. Use Secrets Management

#### Docker Secrets

```yaml
services:
  ide:
    secrets:
      - ide_password
    environment:
      - PASSWORD_FILE=/run/secrets/ide_password

secrets:
  ide_password:
    file: ./secrets/password.txt
```

#### Kubernetes Secrets

```bash
kubectl create secret generic ide-secrets \
  --from-literal=password=your-password
```

---

## API Reference

### HTTP Endpoints

| Endpoint       | Method | Description     |
| -------------- | ------ | --------------- |
| `/login`       | GET    | Login page      |
| `/login`       | POST   | Authenticate    |
| `/logout`      | POST   | Logout          |
| `/healthz`     | GET    | Health check    |
| `/update`      | GET    | Update check    |
| `/proxy/:port` | ALL    | Port forwarding |

### Plugin API

See `src/core/plugin.ts` for full plugin interface.

```typescript
interface IPlugin {
  metadata: PluginMetadata
  init(context: PluginContext): Promise<void>
  destroy(): Promise<void>
  healthCheck?(): Promise<boolean>
}
```

---

## Examples

### Example 1: Embed in Next.js

```typescript
// pages/api/ide/[...path].ts
import { createIDEMiddleware } from "@vscode-web-ide/core"

const ideMiddleware = createIDEMiddleware({
  auth: { type: "none" }, // Use Next.js auth
  basePath: "/api/ide",
})

export default ideMiddleware
```

### Example 2: Custom Authentication

```typescript
import { WebIDE } from "@vscode-web-ide/core"
import { verifyJWT } from "./auth"

const ide = new WebIDE({ port: 8080 })

ide.app.use((req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1]

  if (!verifyJWT(token)) {
    return res.status(401).json({ error: "Unauthorized" })
  }

  next()
})

await ide.start()
```

### Example 3: Cloud Storage Integration

```typescript
import { BasePlugin } from "@vscode-web-ide/core"
import { S3Client } from "@aws-sdk/client-s3"

class S3StoragePlugin extends BasePlugin {
  metadata = {
    name: "s3-storage",
    version: "1.0.0",
  }

  async init(context) {
    const s3 = new S3Client({ region: "us-east-1" })

    // Add S3 sync routes
    context.app.post("/api/sync/upload", async (req, res) => {
      // Upload workspace to S3
    })

    context.app.post("/api/sync/download", async (req, res) => {
      // Download workspace from S3
    })
  }
}
```

---

## Troubleshooting

### Common Issues

**Issue: "No password set"**

```bash
# Solution: Set PASSWORD env var
export PASSWORD=your-password
```

**Issue: "Port already in use"**

```bash
# Solution: Change port
export IDE_PORT=8081
```

**Issue: "WebSocket connection failed"**

```nginx
# Solution: Add WebSocket support to proxy
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

---

## Support

- Documentation: See `ANALYSIS_REPORT.md`
- Issues: GitHub Issues
- Examples: `examples/` directory

---

## License

MIT License - See LICENSE file
