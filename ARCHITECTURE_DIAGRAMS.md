# VSCode Web IDE - Architecture Diagrams

## 1. Process Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       npm start                             │
│              (entry.ts → entry.js)                          │
└────────────────────────┬────────────────────────────────────┘
                         │
          ┌──────────────┴──────────────┐
          │                             │
          v                             v
   ┌─────────────────┐         ┌─────────────────┐
   │ ParentProcess   │         │ ChildProcess    │
   ├─────────────────┤         ├─────────────────┤
   │ • Fork child    │         │ • Handshake     │
   │ • IPC Listener  │◄────────┤ • Receive args  │
   │ • Hot reload    │         │ • Run server    │
   │ • Log rotation  │         │ • Prevent exit  │
   └─────────────────┘         └────────┬────────┘
                                        │
                          ┌─────────────┴──────────────┐
                          │                            │
                          v                            v
                    ┌─────────────┐          ┌──────────────────┐
                    │ HTTP Server │          │ Editor Session   │
                    ├─────────────┤          │ Manager (Unix    │
                    │ Express app │          │ socket server)   │
                    │ on 3000     │          │ on session-socket│
                    └─────────────┘          └──────────────────┘
```

## 2. Request Flow - HTTP (Blocking & A)

```
Browser Request
     │
     v
┌─────────────────────────────────────────────┐
│  HTTP Server (app.listen)                   │
│  ├─ compression()                           │
│  ├─ cookieParser()                          │
│  └─ Common middleware (heart.beat())        │
└──────────────┬────────────────────────────┘
               │
     ┌─────────┴──────────┬────────────┬──────────────┐
     │                    │            │              │
     v                    v            v              v
  /login            /logout          /healthz        / (vscode)
  Auth routes       Clear cookie     Health check    Main IDE
  • Validate pwd    • Remove cookie                  • Lazy load
  • Set cookie      • Redirect                         VS Code
                                                     • Render HTML
                                                     • Delegate to
                                                       vscodeServer
```

## 3. WebSocket Upgrade Flow

```
Browser WebSocket /
     │
     v
┌──────────────────────────────────────┐
│ HTTP server "upgrade" event          │
│ wsRouter.handle()                    │
└──────────────┬───────────────────────┘
               │
               v
┌──────────────────────────────────────┐
│ ensureOrigin()                       │
│ Check Origin header matches host     │
└──────────────┬───────────────────────┘
               │
               v
┌──────────────────────────────────────┐
│ ensureAuthenticated()                │
│ Validate session cookie              │
└──────────────┬───────────────────────┘
               │
               v
┌──────────────────────────────────────┐
│ ensureVSCodeLoaded()                 │
│ Lazy-load VS Code module (cached)    │
└──────────────┬───────────────────────┘
               │
               v
┌──────────────────────────────────────┐
│ SocketProxyProvider.createProxy()    │
│ Wrap TLS socket for child processes  │
└──────────────┬───────────────────────┘
               │
               v
┌──────────────────────────────────────┐
│ vscodeServer.handleUpgrade()         │
│ VS Code handles: terminal, files,    │
│ extensions, LSP, etc.                │
└──────────────────────────────────────┘
```

## 4. Session Management (EditorSessionManager)

```
File: /path/to/folder
     │
     v
┌─────────────────────────────────────────────────┐
│ EditorSessionManagerClient                      │
│ .getConnectedSocketPath(filePath)               │
└────────────┬────────────────────────────────────┘
             │
             v HTTP POST
┌─────────────────────────────────────────────────┐
│ EditorSessionManager HTTP Server                │
│ GET /session?filePath=...                       │
│ POST /add-session { entry }                     │
│ POST /delete-session { socketPath }             │
└────────────┬────────────────────────────────────┘
             │
             v
┌─────────────────────────────────────────────────┐
│ EditorSessionManager (in-memory)                │
│                                                 │
│ entries: Map<                                   │
│   socketPath,                                   │
│   { workspace: { folders }, socketPath }       │
│ >                                               │
│                                                 │
│ 1. getCandidatesForFile()                       │
│    → filter entries by workspace prefix        │
│ 2. Sort by recency & match quality             │
│ 3. Try connecting to each socket               │
│ 4. Return first successful connection          │
└─────────────────────────────────────────────────┘
             │
             v
    Returns socket path for workspace
    (or undefined if no connection)
```

## 5. Authentication & Authorization Flow

```
POST /login { password }
     │
     v
┌─────────────────────────────────────┐
│ login.ts Route Handler              │
│ 1. Check rate limiter               │
│ 2. Sanitize password input          │
│ 3. Get password method              │
│    (PLAIN_TEXT|ARGON2|SHA256)       │
└────────────┬────────────────────────┘
             │
             v
┌─────────────────────────────────────┐
│ handlePasswordValidation()           │
│ • Compare request pwd               │
│   with configured pwd               │
│ • Hash for cookie storage           │
└────────────┬────────────────────────┘
             │
       ┌─────┴─────┐
       │           │
    Valid      Invalid
     │           │
     v           v
 Set-Cookie   Throw Error
 "coder.sid"  & Rate Limit
   hash

Subsequent requests:
     │
     v
┌──────────────────────────┐
│ ensureAuthenticated()    │
│ 1. Get req.cookies["sid"]│
│ 2. Call authenticated()  │
│ 3. Compare with         │
│    args.password        │
└──────────────┬───────────┘
               │
       ┌───────┴────────┐
       │                │
    Valid            Invalid
     │                │
     v                v
  next()           401 Error
                   → Redirect to
                     /login
```

## 6. File System Structure

```
$HOME/
├─ .local/share/code-server/              (data dir)
│  ├─ coder.json                          (global settings)
│  │  └─ { query: {...}, update: {...} }
│  ├─ heartbeat                           (idle detection)
│  ├─ coder-logs/
│  │  ├─ code-server-stdout.log
│  │  └─ code-server-stderr.log
│  ├─ <hostname>.crt                      (HTTPS certs)
│  ├─ <hostname>.key
│  ├─ serve-web-key-half                  (WS security)
│  └─ tls-proxy/                          (socket proxy)
│
└─ .config/code-server/                   (user-data-dir)
   ├─ settings.json                       (VS Code)
   ├─ keybindings.json
   ├─ extensions/
   │  ├─ extension1/
   │  └─ extension2/
   └─ workspaceStorage/
      └─ workspace-metadata.json
```

## 7. State Persistence Model

```
┌──────────────────────────────────────────────────────┐
│              State Management                        │
├──────────────────────────────────────────────────────┤
│ Component              │ Storage    │ Scope          │
├────────────────────────┼────────────┼────────────────┤
│ Password               │ Env/Config │ Global (1)     │
│ User session           │ Cookie     │ Per browser    │
│ Workspace sessions     │ Memory Map │ Current proc   │
│ Editor settings        │ JSON file  │ Global         │
│ Heartbeat/idle        │ File       │ Idle detect    │
│ HTTPS certs           │ File       │ HTTPS          │
│ Extensions            │ Directory  │ Shared         │
└──────────────────────────────────────────────────────┘

⚠️ PROBLEM: No per-user isolation!
   - All users share: settings, extensions, heartbeat
   - No persistent user sessions
   - No user database
```

## 8. Communication Mechanisms

```
┌────────────────────────────────────────┐
│    Communication Mechanisms            │
├────────────────────────────────────────┤
│                                        │
│ 1. process.send() / on("message")     │
│    └─ Parent-child IPC (handshake)    │
│                                        │
│ 2. Unix Sockets (EditorSessionManager)│
│    └─ Inter-instance coordination     │
│                                        │
│ 3. WebSocket (HTTP Upgrade)           │
│    └─ Real-time client-server         │
│                                        │
│ 4. HTTP Path/Domain Proxies           │
│    └─ Request forwarding              │
│                                        │
│ 5. Node.js Streams (pipes)            │
│    └─ Data streaming                  │
│                                        │
└────────────────────────────────────────┘
```

## 9. Multi-User Architecture (Proposed)

```
┌─────────────────────────────────────────────────────┐
│              Load Balancer                          │
│         (Session Affinity by user_id)              │
└──────────────┬────────────────────────────┬────────┘
               │                            │
        ┌──────v─────┐            ┌────────v──────┐
        │Instance 1  │            │Instance 2    │
        │user1, 3    │            │user2, 4      │
        └──────┬─────┘            └────────┬──────┘
               │                          │
               └──────────┬───────────────┘
                          │
                    ┌─────v──────┐
                    │ Redis      │
                    ├────────────┤
                    │ Sessions   │
                    │ Users      │
                    │ Workspaces │
                    │ Locks      │
                    └────────────┘
```

## 10. Startup Sequence

```
┌─────────────────────────────────────────┐
│ 1. entry.ts                             │
│    - Parse CLI args                     │
│    - Read config file                   │
│    - Check for --help/--version         │
│    - Determine: CLI vs Server mode      │
└──────────────┬──────────────────────────┘
               │
        ┌──────┴─────────┐
        │                │
        v                v
   CLI Mode         Server Mode
   (extensions)     (IDE server)
        │                │
        v                v
   wrapper.ts        wrapper.ts
   runCodeCli()      ParentProcess
                     │
                     v
                 cp.fork(entry)
                     │
                     v
                 ChildProcess
                 handshake()
                     │
                     v
                 runCodeServer()
                 ├─ createApp()
                 │  ├─ Express router
                 │  ├─ HTTP/S server
                 │  ├─ Session mgr
                 │  └─ listen()
                 ├─ register()
                 │  ├─ Heart
                 │  ├─ Routes
                 │  └─ Middleware
                 └─ Server running
```

## 11. Request Timing & Order

```
1. Client connects → HTTP/WebSocket
                   ↓
2. Compression middleware
                   ↓
3. Cookie parser
                   ↓
4. Common middleware (heart.beat() called)
                   ↓
5. Auth check (if required route)
                   ↓
6. Route-specific handler
                   ↓
7. Error handler (if error)
                   ↓
8. Response sent

⏱️ Heart.beat() is async and NOT awaited
   → doesn't block request processing
```

---

**File Locations:** All absolute paths reference `/home/user/vscode-web-main/src/node/`
