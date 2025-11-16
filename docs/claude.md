# docs/ - Documentation

## Overview

This directory contains comprehensive documentation for users, developers, and contributors. Includes installation guides, deployment instructions, troubleshooting, FAQs, and contribution guidelines.

## Directory Structure

```
docs/
├── README.md               # Documentation index
├── install.md              # Installation guide
├── guide.md                # User guide
├── FAQ.md                  # Frequently asked questions
├── CONTRIBUTING.md         # Contribution guidelines
├── MAINTAINING.md          # Maintainer guide
├── CODE_OF_CONDUCT.md      # Community code of conduct
├── SECURITY.md             # Security policy
├── requirements.md         # System requirements
├── upgrade.md              # Upgrade instructions
├── npm.md                  # NPM package usage
├── helm.md                 # Kubernetes Helm deployment
├── collaboration.md        # Collaborative features
├── termux.md               # Android Termux setup
├── android.md              # Android deployment
├── ios.md                  # iOS deployment
├── ipad.md                 # iPad-specific instructions
├── coder.md                # Coder platform integration
├── triage.md               # Issue triage guide
└── manifest.json           # Documentation manifest
```

---

## Core Documentation

### README.md

**Purpose:** Documentation overview and index

**Contents:**

- Quick start guide
- Links to all documentation
- Documentation structure
- Contributing to docs

---

### install.md

**Purpose:** Installation instructions for all platforms

**Sections:**

#### Quick Install

```bash
curl -fsSL https://code-server.dev/install.sh | sh
```

#### Platform-Specific Installation

**Linux:**

```bash
# Debian/Ubuntu
curl -fsSL https://code-server.dev/install.sh | sh -s -- --method=deb

# Fedora/CentOS/RHEL
curl -fsSL https://code-server.dev/install.sh | sh -s -- --method=rpm

# Arch Linux
yay -S code-server
```

**macOS:**

```bash
# Homebrew
brew install code-server

# Manual
curl -fsSL https://code-server.dev/install.sh | sh
```

**Windows:**

```powershell
# Using npm
npm install -g code-server

# Manual download
# Download from GitHub releases
```

**Docker:**

```bash
docker run -it -p 8080:8080 \
  -v "$PWD:/home/coder/project" \
  codercom/code-server:latest
```

#### From Source

```bash
git clone https://github.com/coder/code-server
cd code-server
npm install
npm run build
npm run release
```

---

### guide.md

**Purpose:** Comprehensive user guide

**Sections:**

#### Getting Started

- First launch
- Setting password
- Accessing the IDE
- Opening workspace

#### Configuration

- Configuration file location
- Environment variables
- CLI flags
- HTTPS setup
- Custom certificates

#### Using Extensions

- Installing extensions
- Extension marketplace
- VSIX installation
- Extension directory

#### Workspace Management

- Opening folders
- Multi-root workspaces
- Workspace settings
- Tasks and launch configurations

#### Terminal Usage

- Integrated terminal
- Shell configuration
- Environment variables
- Multiple terminals

#### Port Forwarding

- Forwarding local ports
- Accessing forwarded ports
- Security considerations

#### Remote Development

- SSH setup
- Git integration
- Remote debugging

---

### FAQ.md

**Purpose:** Frequently Asked Questions

**Common Questions:**

**Q: How do I change the password?**

```bash
# Using config file
echo "password: your-new-password" > ~/.config/code-server/config.yaml

# Using environment variable
export PASSWORD="your-new-password"
code-server

# Using CLI flag
code-server --auth password --password your-new-password
```

**Q: How do I use my own SSL certificate?**

```bash
code-server --cert /path/to/cert.pem --cert-key /path/to/key.pem
```

**Q: How do I disable telemetry?**

```bash
code-server --disable-telemetry
```

**Q: Can I run code-server on a remote server?**

```
Yes! Run code-server on your remote server and access it via browser.
Use SSH tunneling or reverse proxy for secure access.
```

**Q: How do I install a specific VSCode extension?**

```bash
code-server --install-extension publisher.extension-name
```

**Q: Where are extensions installed?**

```
~/.local/share/code-server/extensions
```

**Q: How do I update code-server?**

```
See upgrade.md for detailed instructions.
```

---

## Deployment Documentation

### helm.md

**Purpose:** Kubernetes Helm chart deployment

**Quick Start:**

```bash
helm repo add code-server https://helm.coder.com
helm install my-code-server code-server/code-server
```

**Configuration:**

```yaml
# values.yaml
password: "secure-password"

persistence:
  enabled: true
  size: 10Gi

ingress:
  enabled: true
  hosts:
    - code-server.example.com

resources:
  limits:
    cpu: 2000m
    memory: 4Gi
  requests:
    cpu: 500m
    memory: 1Gi
```

**Install with custom values:**

```bash
helm install my-code-server code-server/code-server -f values.yaml
```

**Upgrade:**

```bash
helm upgrade my-code-server code-server/code-server
```

**Uninstall:**

```bash
helm uninstall my-code-server
```

**Advanced Configuration:**

- Persistent volumes
- Ingress setup
- Resource limits
- Security context
- Service account
- Network policies

---

### npm.md

**Purpose:** NPM package usage

**Installation:**

```bash
npm install -g code-server
```

**Usage:**

```bash
code-server
```

**Programmatic Usage:**

```typescript
import { createServer } from "code-server"

const server = await createServer({
  port: 8080,
  auth: "password",
  password: "your-password",
})

await server.listen()
console.log("Server started on port 8080")
```

**Package.json Scripts:**

```json
{
  "scripts": {
    "start": "code-server",
    "dev": "code-server --auth none"
  }
}
```

---

### collaboration.md

**Purpose:** Collaborative development features

**Features:**

- Live Share integration
- Port forwarding for sharing
- Multiple users on same server
- Workspace sharing

**Setup:**

```bash
# Install Live Share extension
code-server --install-extension ms-vsliveshare.vsliveshare

# Start collaboration session
# Use Live Share extension in VS Code
```

**Multi-User Setup:**

- Each user gets their own instance
- Use reverse proxy (nginx, Caddy)
- Subdomain routing
- Authentication per user

---

## Platform-Specific Documentation

### termux.md

**Purpose:** Running on Android via Termux

**Installation:**

```bash
# Install Termux from F-Droid
# In Termux:
pkg install nodejs
npm install -g code-server
code-server
```

**Access:**

```
Open browser to http://localhost:8080
```

**Tips:**

- Use external keyboard
- Enable storage access
- Install git, python for extensions
- Configure wake lock

---

### android.md

**Purpose:** Android deployment options

**Methods:**

1. **Termux** (see termux.md)
2. **Remote server + Android browser**
3. **Docker on Android (UserLand, etc.)**

**Recommendations:**

- Use tablet for better experience
- External keyboard recommended
- SSH to remote server often better
- Mobile browsers have limitations

---

### ios.md

**Purpose:** iOS deployment and usage

**Access Methods:**

1. **Remote server** (recommended)
   - Run code-server on remote Linux server
   - Access via Safari on iOS

2. **iSH app** (limited)
   - Alpine Linux on iOS
   - Very slow, experimental

**Browser Recommendations:**

- Safari (best compatibility)
- Chrome (good alternative)
- Enable "Request Desktop Website"

**Limitations:**

- No local file system access
- Limited terminal functionality
- Some extensions may not work

---

### ipad.md

**Purpose:** iPad-specific instructions and optimizations

**Optimizations:**

- Request desktop website
- Use external keyboard
- Split view support
- Touch gestures

**Keyboard Shortcuts:**

- Cmd+P - Quick open
- Cmd+Shift+P - Command palette
- Cmd+B - Toggle sidebar
- Cmd+J - Toggle panel

**Tips:**

- Use Magic Keyboard for best experience
- Enable cursor support
- Configure workspace layout
- Use iPad as second screen

---

### coder.md

**Purpose:** Integration with Coder platform

**Coder Platform:**

- Enterprise deployment
- Managed code-server instances
- User management
- Resource quotas
- Workspace templates

**Setup:**

```bash
# Install Coder CLI
curl -fsSL https://coder.com/install.sh | sh

# Create workspace
coder create my-workspace

# Access workspace
coder open my-workspace
```

---

## Contributor Documentation

### CONTRIBUTING.md

**Purpose:** Guidelines for contributing

**Sections:**

#### Getting Started

- Fork repository
- Clone locally
- Install dependencies
- Build from source

#### Development Workflow

```bash
# Install dependencies
npm install

# Start development server
npm run watch

# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run fmt
```

#### Submitting Changes

1. Create feature branch
2. Make changes
3. Write tests
4. Run linters
5. Commit with descriptive message
6. Push to fork
7. Create pull request

#### Code Style

- TypeScript strict mode
- ESLint configuration
- Prettier formatting
- Conventional commits

#### Testing

- Unit tests for new features
- Integration tests for APIs
- E2E tests for user flows
- Maintain test coverage >60%

---

### MAINTAINING.md

**Purpose:** Guide for maintainers

**Responsibilities:**

- Review pull requests
- Triage issues
- Release management
- Security updates
- Community management

**Release Process:**

1. Update version in package.json
2. Update CHANGELOG.md
3. Create git tag
4. Build release artifacts
5. Publish to npm
6. Build Docker images
7. Update Homebrew formula
8. Create GitHub release
9. Announce release

**Security:**

- Monitor security advisories
- Respond to security reports
- Patch vulnerabilities
- Update dependencies

---

### triage.md

**Purpose:** Issue triage guidelines

**Labels:**

- `bug` - Something isn't working
- `enhancement` - New feature request
- `documentation` - Documentation improvements
- `good first issue` - Good for newcomers
- `help wanted` - Looking for contributors
- `question` - Further information requested
- `wontfix` - This will not be worked on
- `duplicate` - Duplicate issue

**Triage Process:**

1. Review new issues daily
2. Ask for more information if needed
3. Label appropriately
4. Assign priority
5. Link to related issues
6. Close duplicates
7. Close stale issues

---

### CODE_OF_CONDUCT.md

**Purpose:** Community standards and behavior expectations

**Standards:**

- Respectful communication
- Inclusive language
- Constructive feedback
- Focus on collaboration

**Unacceptable Behavior:**

- Harassment
- Trolling
- Spam
- Off-topic discussions

**Enforcement:**

- Warning
- Temporary ban
- Permanent ban

---

### SECURITY.md

**Purpose:** Security policy and vulnerability reporting

**Supported Versions:**
| Version | Supported |
| ------- | ------------------ |
| 4.x | :white_check_mark: |
| 3.x | :x: |
| < 3.0 | :x: |

**Reporting Vulnerabilities:**

```
Email: security@coder.com
PGP Key: Available on website

Do NOT open public issues for security vulnerabilities.
```

**Response Timeline:**

- Acknowledgment: 24 hours
- Initial assessment: 48 hours
- Fix development: Varies by severity
- Patch release: As soon as possible
- Public disclosure: After patch released

---

## Technical Documentation

### requirements.md

**Purpose:** System requirements

**Minimum Requirements:**

- CPU: 1 core
- RAM: 2 GB
- Disk: 1 GB
- OS: Linux, macOS, or Windows
- Node.js: 22.x (if building from source)

**Recommended:**

- CPU: 2+ cores
- RAM: 4+ GB
- Disk: 10+ GB (for extensions and workspaces)
- SSD for better performance

**Network:**

- Outbound: Internet access for extensions
- Inbound: Firewall rules for access

**Browser:**

- Chrome/Chromium 90+
- Firefox 88+
- Safari 14+
- Edge 90+

---

### upgrade.md

**Purpose:** Upgrade instructions

**NPM:**

```bash
npm update -g code-server
```

**Package Managers:**

```bash
# Debian/Ubuntu
sudo apt update && sudo apt upgrade code-server

# Homebrew
brew upgrade code-server
```

**Docker:**

```bash
docker pull codercom/code-server:latest
```

**From Source:**

```bash
git pull origin main
npm install
npm run build
npm run release
```

**Migration Notes:**

- Check CHANGELOG for breaking changes
- Backup configuration files
- Test in development first
- Update extensions if needed

---

## Documentation Maintenance

### manifest.json

**Purpose:** Documentation metadata

**Contents:**

```json
{
  "version": "1.0.0",
  "documents": [
    {
      "title": "Installation Guide",
      "file": "install.md",
      "category": "getting-started"
    },
    {
      "title": "User Guide",
      "file": "guide.md",
      "category": "usage"
    }
  ],
  "categories": ["getting-started", "usage", "deployment", "contributing"]
}
```

---

## Best Practices

### Writing Documentation

1. **Clear and concise** - Use simple language
2. **Examples** - Provide code examples
3. **Screenshots** - Visual aids when helpful
4. **Table of contents** - For longer docs
5. **Links** - Cross-reference related docs
6. **Up to date** - Keep docs synchronized with code

### Documentation Structure

````markdown
# Title

Brief description

## Table of Contents

- [Section 1](#section-1)
- [Section 2](#section-2)

## Section 1

Content with examples:

```bash
code-server --help
```
````

## Section 2

More content

```

---

## Related Resources

### External Links
- [Official Website](https://coder.com)
- [GitHub Repository](https://github.com/coder/code-server)
- [Docker Hub](https://hub.docker.com/r/codercom/code-server)
- [npm Package](https://www.npmjs.com/package/code-server)
- [VS Code Documentation](https://code.visualstudio.com/docs)

### Community
- GitHub Discussions
- Discord Server
- Reddit Community

---

---

## Architecture Documentation

### architecture/

**Purpose:** Technical architecture and design documentation

**Key Documents:**

#### EXECUTIVE_SUMMARY.md

**Purpose:** High-level overview of AI Website + Web IDE integration

**Contents:**

- Investment analysis ($300k-$500k, 6-8 months)
- Three-phase roadmap (MVP → Production → Enterprise)
- Technical stack and architectural decisions
- Revenue models and cost management
- Risk assessment and success metrics
- Next steps and implementation plan

**Target Audience:** Decision makers, investors, product managers

---

#### AI_WEBSITE_IDE_INTEGRATION.md

**Purpose:** Detailed integration architecture for merging chat and IDE features

**Contents:**

- Unified platform design (/chat + /ide routes)
- Session isolation strategies (directory vs container-based)
- Shared authentication and database schema
- AI integration architecture (Claude API)
- Deployment options (monolithic vs microservices)
- Security, performance, and monitoring strategies

**Target Audience:** Architects, tech leads, senior engineers

**Key Topics:**

- Integration Strategy (Monolithic vs Microservices)
- Session Isolation (Directory-based → Container-based)
- Shared Authentication & Database Schema
- AI Service Integration (Chat + IDE)
- Routes Structure (Frontend & Backend)
- Deployment Architecture (Docker Compose, Kubernetes)
- Security Considerations
- Performance Optimization
- Cost Management

---

#### WORLD_CLASS_IDE_FEATURES.md

**Purpose:** Comprehensive implementation guide for IDE features

**Contents:**

**1. AI-Powered Intelligence**

- Real-time code completion (GitHub Copilot-style)
- Conversational AI assistant panel
- AI-driven debugging with fix suggestions
- Intelligent refactoring and code translation
- Automated documentation generation

**2. Collaboration & Version Control**

- Google Docs-style real-time editing (Yjs CRDT)
- Shared terminals for pair programming
- Port forwarding for live preview sharing
- In-IDE PR management and review
- Visual diff viewer with line-level staging

**3. Core Editor & Performance**

- Sub-2-second load time optimization
- Advanced IntelliSense (Language Server Protocol)
- Full-featured visual debugger
- Multi-terminal support

**4. Environment & Extensibility**

- VSCode-compatible extension marketplace
- devcontainer.json support (zero-config)
- Docker container management GUI
- Settings sync across devices

**5. DevOps & Cloud Integration**

- One-click deployment (Vercel, Netlify, AWS, Azure)
- Integrated database GUI (SQL/NoSQL)
- Secure secrets vault with encryption

**Target Audience:** Developers, engineers, implementation teams

**Timeline:** 24-32 weeks (6-8 months)

---

#### MULTI_USER_ARCHITECTURE_DESIGN.md

**Purpose:** Multi-user deployment architecture

**Contents:**

- Two deployment modes (single-user, multi-user)
- Complete user isolation strategies
- Authentication and authorization
- Session management
- Resource quotas and limits
- Scalability and performance
- Security considerations

---

#### MULTI_USER_README.md

**Purpose:** Quick start for multi-user deployments

**Contents:**

- Configuration examples
- Deployment modes
- Setup instructions
- Docker Compose examples
- Kubernetes deployment
- Troubleshooting guide

---

#### IMPLEMENTATION_GUIDE.md

**Purpose:** Step-by-step integration guide

**Contents:**

- Prerequisites and dependencies
- 7-step integration process
- Database schema (users, sessions, audit_events)
- API examples and testing
- Migration from single-user to multi-user
- Troubleshooting common issues

---

#### SERVER_ARCHITECTURE_ANALYSIS.md

**Purpose:** Current server architecture analysis

**Contents:**

- Process model (parent-child)
- Session management (EditorSessionManager)
- Authentication flow
- File system structure
- Communication mechanisms
- WebSocket routing

---

#### ARCHITECTURE_DIAGRAMS.md

**Purpose:** Visual architecture documentation

**Contents:**

- Process architecture diagrams
- Request flow diagrams
- WebSocket upgrade sequence
- Session management flow
- Authentication flow
- Startup sequence

---

### Using the Architecture Documentation

**For Planning:**

1. Read `EXECUTIVE_SUMMARY.md` for overview
2. Review timeline and budget estimates
3. Assess risks and mitigation strategies

**For Implementation:**

1. Study `AI_WEBSITE_IDE_INTEGRATION.md` for architecture
2. Follow `WORLD_CLASS_IDE_FEATURES.md` for features
3. Use `IMPLEMENTATION_GUIDE.md` for step-by-step setup

**For Deployment:**

1. Choose deployment mode (single vs multi-user)
2. Follow `MULTI_USER_README.md` for setup
3. Configure using examples in architecture docs

---

## Future Documentation

- [x] Architecture deep dive (DONE - see architecture/)
- [x] Multi-tenancy setup (DONE - MULTI_USER_ARCHITECTURE_DESIGN.md)
- [x] Enterprise deployment guide (DONE - EXECUTIVE_SUMMARY.md)
- [ ] API reference documentation
- [ ] Plugin development guide
- [ ] Performance tuning guide
- [ ] Backup and restore guide
- [ ] Compliance documentation
- [ ] Extension development tutorial
- [ ] Video tutorials
```
