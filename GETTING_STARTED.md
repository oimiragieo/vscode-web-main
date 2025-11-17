# Getting Started with code-server (vscode-web-main fork)

> **⚠️ IMPORTANT:** This fork has significant experimental code that is NOT yet integrated. See [REALITY_CHECK_REPORT.md](REALITY_CHECK_REPORT.md) for the complete analysis.

## What This Actually Is

This is a **fork of code-server** (the upstream project that lets you run VS Code in a browser) with some performance optimizations and experimental features in various stages of completion.

### ✅ What Actually Works

1. **Standard code-server functionality** - Run VS Code in your browser
2. **Password authentication** with Argon2 hashing
3. **Performance optimizations:**
   - Brotli compression (40-45% bandwidth reduction)
   - HTTP/2 support
   - Settings write debouncing (98% fewer disk operations)
4. **Docker deployment** with optimized Dockerfile
5. **Basic health checks** at `/healthz`

### ⚠️ What's Experimental/Incomplete

The following exist in the codebase but are **NOT integrated** into the main application:
- Plugin system (`src/core/plugin.ts`) - Code exists but not used
- Enhanced security middleware (`src/core/security.ts`) - Only used in tests
- Multi-user architecture (~5,000 lines of code) - Complete scaffolding, zero integration
- Modern login UI (`modern-login.html`) - Exists but not used
- Monitoring dashboard - HTML exists, no route
- Prometheus metrics endpoint - Code exists, not exposed

## Prerequisites

Before you start, you need:

1. **Node.js 22.x** (exact version required)
   ```bash
   node --version  # Must be v22.x.x
   ```

2. **Git with submodules**
   ```bash
   git --version  # Any recent version
   ```

3. **At least 4GB RAM** (for building VS Code)

4. **10GB free disk space** (for node_modules and build artifacts)

## Installation Steps

### Step 1: Clone the Repository

```bash
git clone https://github.com/your-repo/vscode-web-main.git
cd vscode-web-main
```

### Step 2: Initialize VS Code Submodule (CRITICAL!)

⚠️ **This is the most important step!** Without it, the build will fail.

```bash
# Initialize and fetch the VS Code submodule
git submodule update --init --recursive

# Verify it worked
ls lib/vscode/package.json
# Should show: lib/vscode/package.json
```

If you see "No such file or directory", the submodule isn't initialized and you **cannot proceed**.

### Step 3: Install Dependencies

```bash
# This will install dependencies for:
# - The main project
# - The test directory
# - The VS Code submodule (if initialized)
npm install
```

This takes 5-15 minutes depending on your internet connection.

### Step 4: Build VS Code

```bash
# Build the VS Code submodule (takes 10-30 minutes)
npm run build:vscode
```

**Expected output:**
- Lots of TypeScript compilation messages
- Final message about build completion
- Creates `lib/vscode/out` directory

### Step 5: Build code-server

```bash
# Build the TypeScript code (takes 1-2 minutes)
npm run build
```

**Expected output:**
- Creates `out/` directory with compiled JavaScript
- No TypeScript errors

### Step 6: Run code-server

```bash
# Start the server with a password
PASSWORD=your-secure-password npm start
```

Or use the binary directly:

```bash
# Set password via environment variable
export PASSWORD=your-secure-password

# Run the compiled code
./out/node/entry.js
```

### Step 7: Access the IDE

Open your browser to:
```
http://localhost:8080
```

**Login with:**
- The password you set in the `PASSWORD` environment variable

## Quick Start with Docker (Easier!)

If you don't want to deal with building from source:

```bash
# 1. Create a .env file
echo "IDE_PASSWORD=your-secure-password" > .env

# 2. Build the Docker image (requires VS Code submodule!)
docker build -f Dockerfile.optimized -t code-server-fork .

# 3. Run it
docker run -d \
  -p 8080:8080 \
  -e PASSWORD=your-secure-password \
  -v "$(pwd)/workspace:/home/coder/project" \
  code-server-fork
```

**Note:** The Docker build will fail if the VS Code submodule isn't initialized!

## Configuration

### Using Environment Variables

```bash
# Server settings
export PORT=8080
export HOST=0.0.0.0

# Authentication
export PASSWORD=your-password

# Features
export DISABLE_TELEMETRY=true
export APP_NAME="My Code Server"
```

### Using Config File

Create `~/.config/code-server/config.yaml`:

```yaml
bind-addr: 0.0.0.0:8080
auth: password
password: your-password
disable-telemetry: true
```

## Common Issues

### Issue: "lib/vscode/package.json is missing"

**Solution:** Initialize the VS Code submodule:
```bash
git submodule update --init --recursive
```

### Issue: "Cannot find module '@coder/logger'"

**Solution:** Install dependencies:
```bash
npm install
```

### Issue: Build fails with "out of memory"

**Solution:** Increase Node.js memory:
```bash
export NODE_OPTIONS="--max-old-space-size=8192"
npm run build:vscode
```

### Issue: "EACCES: permission denied"

**Solution:** Don't run as root. If on Linux:
```bash
sudo chown -R $USER:$USER ~/.config/code-server
```

## Development Workflow

### Watch Mode (for development)

```bash
# Automatically rebuild on file changes
npm run watch
```

### Running Tests

```bash
# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# E2E tests (requires built code)
npm run test:e2e
```

### Linting and Formatting

```bash
# Format code
npm run prettier

# Lint TypeScript
npm run lint:ts

# Lint shell scripts
npm run lint:scripts
```

## What's Next?

### If You Want to Use This in Production

1. **Read the security guide:** [docs/SECURITY.md](docs/SECURITY.md)
2. **Set up HTTPS:** See [docs/guide.md](docs/guide.md#using-lets-encrypt-with-nginx)
3. **Configure authentication properly:** Don't use plain text passwords
4. **Set up backups:** Your user data is in `~/.local/share/code-server`

### If You Want to Develop Features

1. **Read the architecture docs:** [claude.md](claude.md) has comprehensive documentation
2. **Look at the experimental code:** See what's in `src/core/` and `src/node/services/`
3. **Check the reality report:** [REALITY_CHECK_REPORT.md](REALITY_CHECK_REPORT.md) shows what needs integration
4. **Run the tests:** `npm run test:unit` to see the proof-of-concept tests

### If You Want to Contribute

1. **Check open issues** on GitHub
2. **Focus on integration:** There's ~6,000 lines of good code waiting to be integrated
3. **Update documentation** to match reality
4. **Write tests** for any new features

## Key Differences from Upstream code-server

This fork includes:
- ✅ **HTTP/2 and Brotli compression** - Better performance
- ✅ **Settings debouncing** - Reduces disk I/O
- ⚠️ **Experimental features in progress** - See REALITY_CHECK_REPORT.md

This fork does NOT include (yet):
- ❌ Multi-user support (code exists but not integrated)
- ❌ Plugin system (code exists but not integrated)
- ❌ Enhanced security middleware (code exists but not integrated)

## Support

- **Documentation:** See [docs/](docs/) directory
- **Issues:** Check GitHub issues
- **Original code-server docs:** https://coder.com/docs/code-server

## License

MIT License - See [LICENSE](LICENSE) file

---

**Last Updated:** 2025-11-17

**Status:** Active development - expect rough edges

**Recommendation:** For production use, consider using [upstream code-server](https://github.com/coder/code-server) until the experimental features in this fork are fully integrated.
