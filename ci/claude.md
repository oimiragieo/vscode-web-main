# ci/ - Build Scripts & CI/CD

## Overview

This directory contains all build scripts, CI/CD automation, Docker configurations, and deployment tools. It handles building from source, creating release artifacts, packaging for different platforms, and deployment automation.

## Directory Structure

```
ci/
├── build/                # Build scripts
├── dev/                  # Development scripts
├── steps/                # CI step scripts
├── release-image/        # Docker release images
├── helm-chart/           # Kubernetes Helm chart
├── lib.sh               # Shared shell functions
├── README.md            # CI documentation
└── Caddyfile            # Caddy reverse proxy config
```

---

## Build Scripts (ci/build/)

### build-vscode.sh
**Purpose:** Build VS Code from source

**Location:** `ci/build/build-vscode.sh:1`

**Responsibilities:**
- Check out VS Code submodule
- Apply patches
- Install dependencies
- Compile VS Code
- Generate distributable files

**Usage:**
```bash
VERSION=4.10.0 ./ci/build/build-vscode.sh
```

**Environment Variables:**
- `VERSION` - Version to build (required)
- `VSCODE_CACHE` - Cache directory for dependencies

**Process:**
1. Initialize VS Code submodule at `lib/vscode`
2. Apply custom patches from `patches/`
3. Run `yarn install` in VS Code directory
4. Compile TypeScript
5. Build web assets
6. Create minified bundles

---

### build-code-server.sh
**Purpose:** Build code-server TypeScript code

**Location:** `ci/build/build-code-server.sh:1`

**Responsibilities:**
- Compile TypeScript (src/ → out/)
- Copy static assets
- Generate source maps

**Usage:**
```bash
./ci/build/build-code-server.sh
```

**Output:** `out/` directory with compiled JavaScript

---

### build-release.sh
**Purpose:** Create release artifacts

**Location:** `ci/build/build-release.sh:1`

**Responsibilities:**
- Build VS Code
- Build code-server
- Bundle dependencies
- Create release tarball/ZIP

**Usage:**
```bash
VERSION=4.10.0 ./ci/build/build-release.sh
```

**Output:**
```
release/
├── code-server-4.10.0-linux-amd64.tar.gz
├── code-server-4.10.0-linux-arm64.tar.gz
├── code-server-4.10.0-darwin-amd64.tar.gz
├── code-server-4.10.0-darwin-arm64.tar.gz
└── code-server-4.10.0-win-amd64.zip
```

---

### build-packages.sh
**Purpose:** Create platform-specific packages

**Location:** `ci/build/build-packages.sh:1`

**Creates:**
- `.deb` - Debian/Ubuntu packages
- `.rpm` - RedHat/Fedora packages
- `.apk` - Alpine Linux packages
- `.pkg` - macOS installer
- Homebrew formula

**Usage:**
```bash
VERSION=4.10.0 ./ci/build/build-packages.sh
```

**Tool:** Uses nfpm (package builder)

**Configuration:** `ci/build/nfpm.yaml`

---

### build-standalone-release.sh
**Purpose:** Create standalone binaries

**Location:** `ci/build/build-standalone-release.sh:1`

**Responsibilities:**
- Bundle Node.js runtime
- Bundle all dependencies
- Create single executable

**Output:** Self-contained binaries that don't require Node.js installation

---

### code-server.sh
**Purpose:** Code-server launcher script

**Location:** `ci/build/code-server.sh:1`

**Responsibilities:**
- Set up environment
- Find Node.js
- Launch code-server

**Installed to:** `/usr/bin/code-server` in packages

---

### code-server@.service
**Purpose:** systemd service template (system-wide)

**Location:** `ci/build/code-server@.service:1`

**Usage:**
```bash
sudo systemctl enable --now code-server@username
```

**Configuration:** `/etc/code-server/config.yaml`

---

### code-server-user.service
**Purpose:** systemd user service

**Location:** `ci/build/code-server-user.service:1`

**Usage:**
```bash
systemctl --user enable --now code-server
```

**Configuration:** `~/.config/code-server/config.yaml`

---

### npm-postinstall.sh
**Purpose:** NPM package postinstall script

**Location:** `ci/build/npm-postinstall.sh:1`

**Responsibilities:**
- Download platform-specific binary
- Extract to node_modules
- Set permissions

---

### nfpm.yaml
**Purpose:** Package metadata for nfpm

**Location:** `ci/build/nfpm.yaml:1`

**Contents:**
- Package name and description
- Dependencies
- File locations
- Pre/post install scripts
- systemd service files

---

## Development Scripts (ci/dev/)

### watch.ts
**Purpose:** Development file watcher

**Location:** `ci/dev/watch.ts:1`

**Responsibilities:**
- Watch TypeScript files for changes
- Recompile on change
- Restart server automatically

**Usage:**
```bash
npm run watch
```

**Features:**
- Incremental compilation
- Fast rebuilds
- Automatic server restart

---

### test-unit.sh
**Purpose:** Run unit tests

**Location:** `ci/dev/test-unit.sh:1`

**Usage:**
```bash
./ci/dev/test-unit.sh
```

**Runs:** Jest unit tests with coverage

---

### test-integration.sh
**Purpose:** Run integration tests

**Location:** `ci/dev/test-integration.sh:1`

**Usage:**
```bash
./ci/dev/test-integration.sh
```

---

### test-e2e.sh
**Purpose:** Run end-to-end tests

**Location:** `ci/dev/test-e2e.sh:1`

**Usage:**
```bash
./ci/dev/test-e2e.sh
```

**Responsibilities:**
- Start test code-server
- Run Playwright tests
- Generate test report
- Clean up test server

---

### test-scripts.sh
**Purpose:** Test shell scripts with shellcheck

**Location:** `ci/dev/test-scripts.sh:1`

**Usage:**
```bash
./ci/dev/test-scripts.sh
```

**Checks:**
- Shell syntax errors
- Common mistakes
- Best practice violations

---

### test-native.sh
**Purpose:** Test native module compilation

**Location:** `ci/dev/test-native.sh:1`

**Tests:** Rebuilding native Node.js modules

---

### lint-scripts.sh
**Purpose:** Lint shell scripts

**Location:** `ci/dev/lint-scripts.sh:1`

**Tool:** shellcheck

---

### postinstall.sh
**Purpose:** Development environment setup

**Location:** `ci/dev/postinstall.sh:1`

**Responsibilities:**
- Initialize VS Code submodule
- Install dependencies
- Apply patches
- Build development environment

**Runs after:** `npm install`

---

### preinstall.js
**Purpose:** Check system requirements

**Location:** `ci/dev/preinstall.js:1`

**Checks:**
- Node.js version
- npm version
- Required tools (git, python, make)

---

### gen_icons.sh
**Purpose:** Generate PWA icons

**Location:** `ci/dev/gen_icons.sh:1`

**Generates:**
- favicon.ico
- PWA icons (192x192, 512x512)
- Maskable icons

---

### doctoc.sh
**Purpose:** Generate table of contents for markdown files

**Location:** `ci/dev/doctoc.sh:1`

**Tool:** doctoc

**Usage:**
```bash
./ci/dev/doctoc.sh
```

---

## CI Step Scripts (ci/steps/)

### steps-lib.sh
**Purpose:** Shared functions for CI steps

**Location:** `ci/steps/steps-lib.sh:1`

**Functions:**
- `log()` - Log messages
- `error()` - Log errors and exit
- `retry()` - Retry commands with backoff
- `download()` - Download with verification

---

### docker-buildx-push.sh
**Purpose:** Build and push multi-arch Docker images

**Location:** `ci/steps/docker-buildx-push.sh:1`

**Features:**
- Multi-architecture builds (amd64, arm64)
- BuildKit caching
- Push to Docker Hub
- Tag management

**Usage:**
```bash
VERSION=4.10.0 ./ci/steps/docker-buildx-push.sh
```

**Builds:**
- `codercom/code-server:4.10.0`
- `codercom/code-server:latest`
- `codercom/code-server:4.10`
- `codercom/code-server:4`

---

### publish-npm.sh
**Purpose:** Publish to npm registry

**Location:** `ci/steps/publish-npm.sh:1`

**Responsibilities:**
- Build package
- Run tests
- Publish to npm
- Create git tag

**Usage:**
```bash
NPM_TOKEN=xxx ./ci/steps/publish-npm.sh
```

---

### brew-bump.sh
**Purpose:** Update Homebrew formula

**Location:** `ci/steps/brew-bump.sh:1`

**Responsibilities:**
- Update version in formula
- Update SHA256 checksums
- Create pull request to Homebrew

**Usage:**
```bash
VERSION=4.10.0 ./ci/steps/brew-bump.sh
```

---

## Docker Images (ci/release-image/)

### Dockerfile
**Purpose:** Main production Docker image (Debian-based)

**Location:** `ci/release-image/Dockerfile:1`

**Base:** Debian Bullseye

**Features:**
- Multi-stage build
- Minimal final image
- Non-root user
- Health check
- Proper signal handling

**Stages:**
1. **Builder:** Compile code-server
2. **Runtime:** Production image with compiled code

**Installed Tools:**
- Git
- curl, wget
- SSH
- Common development tools

**User:** `coder` (UID 1000)

---

### Dockerfile.opensuse
**Purpose:** OpenSUSE-based image

**Location:** `ci/release-image/Dockerfile.opensuse:1`

**Base:** OpenSUSE Leap

---

### Dockerfile.fedora
**Purpose:** Fedora-based image

**Location:** `ci/release-image/Dockerfile.fedora:1`

**Base:** Fedora

---

### docker-bake.hcl
**Purpose:** Docker Buildx bake configuration

**Location:** `ci/release-image/docker-bake.hcl:1`

**Defines:**
- Multiple build targets
- Platform specifications
- Tag strategies
- Build arguments

**Usage:**
```bash
docker buildx bake -f ci/release-image/docker-bake.hcl
```

---

### entrypoint.sh
**Purpose:** Docker entrypoint script

**Location:** `ci/release-image/entrypoint.sh:1`

**Responsibilities:**
- Set up user permissions
- Initialize workspace
- Configure environment
- Launch code-server

**Features:**
- Supports running as root or non-root
- Handles volume permissions
- Passes signals correctly

---

### entrypoint-catatonit.sh
**Purpose:** Entrypoint with catatonit (init system)

**Location:** `ci/release-image/entrypoint-catatonit.sh:1`

**Benefits:**
- Proper PID 1 handling
- Signal forwarding
- Zombie process reaping

---

## Helm Chart (ci/helm-chart/)

### Chart.yaml
**Purpose:** Helm chart metadata

**Location:** `ci/helm-chart/Chart.yaml:1`

**Contains:**
- Chart name and version
- App version
- Description
- Maintainers

---

### values.yaml
**Purpose:** Default configuration values

**Location:** `ci/helm-chart/values.yaml:1`

**Configurable:**
```yaml
replicaCount: 1

image:
  repository: codercom/code-server
  tag: "4.10.0"
  pullPolicy: IfNotPresent

service:
  type: ClusterIP
  port: 8080

ingress:
  enabled: false
  className: nginx
  hosts:
    - host: code-server.example.com
      paths:
        - path: /
          pathType: Prefix

persistence:
  enabled: true
  size: 10Gi

resources:
  requests:
    cpu: 100m
    memory: 512Mi
  limits:
    cpu: 2000m
    memory: 4Gi

password: "your-password-here"
```

---

### templates/deployment.yaml
**Purpose:** Kubernetes deployment template

**Location:** `ci/helm-chart/templates/deployment.yaml:1`

**Creates:** Deployment with code-server pods

---

### templates/service.yaml
**Purpose:** Kubernetes service template

**Location:** `ci/helm-chart/templates/service.yaml:1`

**Creates:** Service for accessing code-server

---

### templates/ingress.yaml
**Purpose:** Kubernetes ingress template

**Location:** `ci/helm-chart/templates/ingress.yaml:1`

**Creates:** Ingress for external access

---

### templates/pvc.yaml
**Purpose:** Persistent volume claim template

**Location:** `ci/helm-chart/templates/pvc.yaml:1`

**Creates:** Storage for user data

---

### templates/secrets.yaml
**Purpose:** Secrets template

**Location:** `ci/helm-chart/templates/secrets.yaml:1`

**Stores:** Password and other sensitive data

---

## Shared Scripts

### lib.sh
**Purpose:** Shared shell functions

**Location:** `ci/lib.sh:1`

**Functions:**
- `pushd()` / `popd()` - Directory navigation with stack
- `log()` - Logging with timestamps
- `error()` - Error logging and exit
- `download()` - Download with retries
- `extract()` - Extract archives (tar, zip)
- `version_gt()` - Version comparison

**Usage:**
```bash
source ci/lib.sh

log "Starting build"
download "https://example.com/file.tar.gz" "/tmp/file.tar.gz"
extract "/tmp/file.tar.gz" "/opt/app"
```

---

## Configuration Files

### Caddyfile
**Purpose:** Caddy reverse proxy configuration

**Location:** `ci/Caddyfile:1`

**Example:**
```
code-server.example.com {
  reverse_proxy localhost:8080

  # WebSocket support
  @websocket {
    header Connection *Upgrade*
    header Upgrade websocket
  }
  reverse_proxy @websocket localhost:8080
}
```

**Features:**
- Automatic HTTPS
- WebSocket support
- Compression
- Access logging

---

## CI/CD Workflows

### GitHub Actions

Workflows typically include:

1. **Build & Test**
   ```yaml
   - name: Build
     run: ./ci/build/build-release.sh

   - name: Test
     run: |
       ./ci/dev/test-unit.sh
       ./ci/dev/test-integration.sh
       ./ci/dev/test-e2e.sh
   ```

2. **Release**
   ```yaml
   - name: Create Release
     run: ./ci/build/build-packages.sh

   - name: Publish to npm
     run: ./ci/steps/publish-npm.sh

   - name: Build Docker Images
     run: ./ci/steps/docker-buildx-push.sh
   ```

3. **Deploy**
   ```yaml
   - name: Deploy to Kubernetes
     run: |
       helm upgrade --install code-server \
         ./ci/helm-chart \
         --set image.tag=${{ github.ref_name }}
   ```

---

## Build Process Flow

### Development Build
```
npm install
  ↓
ci/dev/postinstall.sh
  ↓
ci/build/build-vscode.sh
  ↓
ci/build/build-code-server.sh
  ↓
out/ (compiled code)
```

### Release Build
```
ci/build/build-release.sh
  ↓
ci/build/build-vscode.sh (build VS Code)
  ↓
ci/build/build-code-server.sh (build code-server)
  ↓
Bundle dependencies
  ↓
Create tarballs/ZIPs
  ↓
release/ (release artifacts)
```

### Package Build
```
ci/build/build-packages.sh
  ↓
Build release first
  ↓
nfpm (package builder)
  ↓
Create .deb, .rpm, .apk
  ↓
dist/ (packages)
```

### Docker Build
```
ci/steps/docker-buildx-push.sh
  ↓
docker buildx build
  ↓
Multi-arch build (amd64, arm64)
  ↓
Push to registry
```

---

## Platform-Specific Notes

### Linux
- Uses systemd services
- Supports multiple package formats
- Requires build tools (make, gcc, python)

### macOS
- Uses launchd instead of systemd
- Homebrew formula available
- Code signing recommended

### Windows
- Requires Visual Studio Build Tools
- Uses NSIS installer (if applicable)
- Different path separators in scripts

---

## Best Practices

### Shell Scripts
1. **Use set -euo pipefail** - Fail fast
2. **Quote variables** - Prevent word splitting
3. **Check dependencies** - Verify tools exist
4. **Log operations** - Use log functions
5. **Handle errors** - Proper error messages

### Docker
1. **Multi-stage builds** - Smaller final images
2. **Non-root user** - Security
3. **Health checks** - Container monitoring
4. **Layer caching** - Faster builds
5. **Specific tags** - Don't use :latest in production

### CI/CD
1. **Fail fast** - Stop on first error
2. **Parallel jobs** - Speed up pipeline
3. **Caching** - Cache dependencies
4. **Artifacts** - Save build outputs
5. **Notifications** - Alert on failures

---

## Troubleshooting

### Build Failures

**VS Code build fails:**
```bash
# Clean and rebuild
rm -rf lib/vscode/node_modules
git submodule update --init
./ci/build/build-vscode.sh
```

**Native module compilation fails:**
```bash
# Install build tools
# Ubuntu/Debian:
sudo apt-get install build-essential python3

# macOS:
xcode-select --install
```

### Docker Build Issues

**Multi-arch build fails:**
```bash
# Set up buildx
docker buildx create --use
docker buildx inspect --bootstrap
```

**Push fails:**
```bash
# Login to registry
docker login
```

---

## Related Files

- **Source Code:** `src/` (code being built)
- **Package Config:** `package.json`
- **VS Code Submodule:** `lib/vscode/`
- **Patches:** `patches/`

---

## Future Enhancements

- [ ] Automated changelog generation
- [ ] Performance benchmarking in CI
- [ ] Security scanning (Snyk, Trivy)
- [ ] Automated dependency updates
- [ ] Canary deployments
- [ ] Blue-green deployments
- [ ] Automated rollback on failures
- [ ] Build artifact signing
- [ ] SBOM generation
