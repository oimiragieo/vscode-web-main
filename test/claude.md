# test/ - Test Suites

## Overview

Comprehensive test suite covering unit tests, integration tests, and end-to-end (E2E) tests. Uses Jest for unit/integration testing and Playwright for E2E browser automation.

## Directory Structure

```
test/
├── unit/                  # Unit tests
│   ├── common/           # Tests for src/common/
│   └── node/             # Tests for src/node/
├── integration/           # Integration tests
├── e2e/                  # End-to-end tests (Playwright)
│   ├── models/           # Page object models
│   └── extensions/       # Test extension
├── utils/                # Test utilities
├── playwright.config.ts  # Playwright configuration
├── package.json          # Test dependencies
└── tsconfig.json         # TypeScript config for tests
```

---

## Test Categories

### Unit Tests (test/unit/)

**Framework:** Jest + ts-jest

**Purpose:** Test individual functions and classes in isolation

**Location:** `test/unit/`

**Structure:**

- `test/unit/common/` - Tests for shared utilities
- `test/unit/node/` - Tests for server code
- `test/unit/node/routes/` - Tests for route handlers

**Example Tests:**

#### test/unit/common/emitter.test.ts

Tests the event emitter system.

**Test Cases:**

- Emitter subscription and emission
- Multiple subscribers
- Error handling in callbacks
- Disposable cleanup
- Async callback support

```typescript
describe("Emitter", () => {
  it("should emit events to subscribers", async () => {
    const emitter = new Emitter<string>()
    let received: string | undefined

    emitter.event((value) => {
      received = value
    })

    await emitter.emit("test")
    expect(received).toBe("test")
  })

  it("should handle errors in callbacks", async () => {
    const emitter = new Emitter<string>()

    emitter.event(() => {
      throw new Error("Test error")
    })

    await expect(emitter.emit("test")).resolves.toBeUndefined()
  })
})
```

#### test/unit/node/http.test.ts

Tests HTTP utilities and middleware.

**Test Cases:**

- Authentication checking
- Template replacement
- Relative root calculation
- Cookie handling
- Redirect logic

#### test/unit/node/cli.test.ts

Tests CLI argument parsing.

**Test Cases:**

- Argument parsing
- Default values
- Validation
- Environment variable override

---

### Integration Tests (test/integration/)

**Framework:** Jest

**Purpose:** Test multiple components working together

**Location:** `test/integration/`

**Example Tests:**

#### test/integration/installExtension.test.ts

Tests extension installation flow.

**Test Cases:**

- Install extension via CLI
- Uninstall extension
- List installed extensions
- Extension directory creation
- Marketplace integration

```typescript
describe("Extension Installation", () => {
  it("should install extension", async () => {
    const result = await runCodeServerCommand(["--install-extension", "ms-python.python"])

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("successfully installed")
  })
})
```

#### test/integration/help.test.ts

Tests help command output.

**Test Cases:**

- `--help` flag
- `--version` flag
- Usage information
- Flag documentation

---

### End-to-End Tests (test/e2e/)

**Framework:** Playwright

**Purpose:** Test complete user flows in browser

**Location:** `test/e2e/`

**Test Files:**

#### test/e2e/login.test.ts

Tests login functionality.

**Test Cases:**

- Login page renders
- Password validation
- Session creation
- Redirect after login
- Error message display
- Rate limiting

```typescript
test('should login successfully', async ({ page }) => {
  await page.goto('/login')

  await page.fill('input[name="password"]', 'test-password')
  await page.click('button[type="submit"]')

  await page.waitForURL('/')
  expect(await page.title()).toContain('Visual Studio Code')
})

test('should show error for wrong password', async ({ page }) => {
  await page.goto('/login')

  await page.fill('input[name="password"]', 'wrong-password')
  await page.click('button[type="submit"]')

  await expect(page.locator('.error')).toContain Text('Invalid password')
})
```

---

#### test/e2e/logout.test.ts

Tests logout functionality.

**Test Cases:**

- Logout clears session
- Redirects to login
- Cannot access IDE after logout

---

#### test/e2e/codeServer.test.ts

Tests core IDE functionality.

**Test Cases:**

- Editor loads
- File creation
- File editing
- File saving
- File deletion
- Search functionality

---

#### test/e2e/terminal.test.ts

Tests integrated terminal.

**Test Cases:**

- Terminal opens
- Command execution
- Output display
- Multiple terminals
- Terminal splitting

```typescript
test("should execute command in terminal", async ({ codeServerPage }) => {
  await codeServerPage.openTerminal()

  await codeServerPage.executeTerminalCommand('echo "Hello World"')

  const output = await codeServerPage.getTerminalOutput()
  expect(output).toContain("Hello World")
})
```

---

#### test/e2e/extensions.test.ts

Tests extension functionality.

**Test Cases:**

- Extension marketplace access
- Extension installation
- Extension activation
- Extension commands
- Extension settings

---

#### test/e2e/downloads.test.ts

Tests file download functionality.

**Test Cases:**

- Download single file
- Download multiple files
- Download folder as ZIP
- Download via context menu

---

#### test/e2e/uploads.test.ts

Tests file upload functionality.

**Test Cases:**

- Upload single file
- Upload multiple files
- Drag and drop upload
- Upload progress

---

#### test/e2e/webview.test.ts

Tests webview functionality.

**Test Cases:**

- Webview creation
- Webview communication
- Webview navigation
- Webview disposal

---

#### test/e2e/routes.test.ts

Tests HTTP routes.

**Test Cases:**

- Health check endpoint
- Static file serving
- Proxy routes
- Error pages
- Redirects

---

#### test/e2e/github.test.ts

Tests GitHub integration.

**Test Cases:**

- GitHub authentication
- Repository cloning
- Pull request creation
- Issue browsing

---

## Test Utilities (test/utils/)

### helpers.ts

Common test helper functions.

**Functions:**

- `setup()` - Test environment setup
- `teardown()` - Cleanup after tests
- `createTempDir()` - Create temporary directory
- `cleanupTempDirs()` - Remove temp directories
- `waitForServer()` - Wait for server to start

---

### integration.ts

Integration test utilities.

**Functions:**

- `runCodeServer()` - Start test code-server instance
- `makeRequest()` - Make HTTP request to test server
- `authenticate()` - Authenticate for testing
- `cleanupServer()` - Stop test server

---

### httpserver.ts

HTTP test server utilities.

**Purpose:** Create mock HTTP servers for testing proxying

**Functions:**

- `createTestServer()` - Create test HTTP server
- `createTestWSServer()` - Create test WebSocket server

---

### runCodeServerCommand.ts

Utility for running code-server CLI commands.

**Function:**

```typescript
async function runCodeServerCommand(args: string[]): Promise<{
  stdout: string
  stderr: string
  exitCode: number
}>
```

**Usage:**

```typescript
const result = await runCodeServerCommand(["--version"])
expect(result.stdout).toContain("4.10.0")
```

---

### globalE2eSetup.ts

Global Playwright test setup.

**Responsibilities:**

- Start code-server before E2E tests
- Set up test environment
- Configure browser contexts

---

### globalUnitSetup.ts

Global Jest test setup.

**Responsibilities:**

- Set up test environment variables
- Mock external dependencies
- Configure test database (if applicable)

---

### constants.ts

Test constants.

**Constants:**

```typescript
export const TEST_PASSWORD = "test-password"
export const TEST_USER = "test-user"
export const TEST_PORT = 8081
export const TIMEOUT = 30000
```

---

## Page Object Models (test/e2e/models/)

### CodeServer.ts

Page object model for code-server.

**Purpose:** Encapsulate browser interactions

**Methods:**

- `login(password)` - Perform login
- `openFile(path)` - Open file in editor
- `createFile(path, content)` - Create new file
- `deleteFile(path)` - Delete file
- `openTerminal()` - Open integrated terminal
- `executeCommand(command)` - Execute VS Code command
- `installExtension(id)` - Install extension
- `getEditor Content()` - Get current editor content
- `typeInEditor(text)` - Type text in editor
- `saveFile()` - Save current file

**Example:**

```typescript
export class CodeServer {
  constructor(private page: Page) {}

  async login(password: string): Promise<void> {
    await this.page.goto("/login")
    await this.page.fill('input[name="password"]', password)
    await this.page.click('button[type="submit"]')
    await this.page.waitForURL("/")
  }

  async openFile(filePath: string): Promise<void> {
    await this.executeCommand("workbench.action.quickOpen")
    await this.page.keyboard.type(filePath)
    await this.page.keyboard.press("Enter")
  }

  async executeCommand(command: string): Promise<void> {
    await this.page.keyboard.press("F1")
    await this.page.keyboard.type(command)
    await this.page.keyboard.press("Enter")
  }
}
```

---

## Test Extension (test/e2e/extensions/test-extension/)

**Purpose:** Test extension for E2E tests

**Features:**

- Simple extension for testing extension API
- Activation events
- Commands
- Configuration

**File:** `test/e2e/extensions/test-extension/extension.ts`

```typescript
import * as vscode from "vscode"

export function activate(context: vscode.ExtensionContext) {
  const command = vscode.commands.registerCommand("test-extension.helloWorld", () => {
    vscode.window.showInformationMessage("Hello from test extension!")
  })

  context.subscriptions.push(command)
}

export function deactivate() {}
```

---

## Configuration Files

### playwright.config.ts

Playwright configuration.

**Settings:**

- Browser types (Chromium, Firefox, WebKit)
- Viewport sizes
- Test timeout
- Parallel execution
- Screenshot on failure
- Video recording
- Base URL

```typescript
export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  use: {
    baseURL: "http://localhost:8081",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
  ],
})
```

---

### package.json

Test dependencies.

**Dependencies:**

- jest
- @playwright/test
- ts-jest
- @types/jest
- supertest (HTTP testing)

---

### tsconfig.json

TypeScript configuration for tests.

**Settings:**

- Includes test files
- References main tsconfig.json
- Allows importing from src/

---

## Running Tests

### Unit Tests

```bash
# Run all unit tests
npm run test:unit

# Run specific test file
npm run test:unit -- http.test.ts

# Run with coverage
npm run test:unit -- --coverage

# Watch mode
npm run test:unit -- --watch
```

---

### Integration Tests

```bash
# Run all integration tests
npm run test:integration

# Run specific test
npm run test:integration -- installExtension.test.ts
```

---

### E2E Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run specific test
npm run test:e2e -- login.test.ts

# Run in headed mode (see browser)
npm run test:e2e -- --headed

# Run in specific browser
npm run test:e2e -- --project=chromium

# Debug mode
npm run test:e2e -- --debug
```

---

### All Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage
```

---

## Coverage

**Target:** 60% code coverage

**Report Formats:**

- HTML (coverage/index.html)
- Console summary
- LCOV for CI tools

**Viewing Coverage:**

```bash
npm run test:coverage
open coverage/index.html
```

---

## CI Integration

Tests run automatically on:

- Pull requests
- Main branch commits
- Release tags

**GitHub Actions Workflow:**

```yaml
- name: Run tests
  run: |
    npm run test:unit
    npm run test:integration
    npm run test:e2e
```

---

## Best Practices

### Writing Tests

1. **Descriptive names:** Use clear test descriptions
2. **Arrange-Act-Assert:** Follow AAA pattern
3. **Isolation:** Tests should not depend on each other
4. **Cleanup:** Clean up resources in afterEach/afterAll
5. **Mock external dependencies:** Don't make real API calls

### Unit Tests

1. **Test one thing:** Each test should test one behavior
2. **Use mocks:** Mock external dependencies
3. **Fast execution:** Unit tests should run quickly
4. **High coverage:** Aim for >80% on critical code

### Integration Tests

1. **Test interactions:** Focus on component integration
2. **Use test database:** Don't touch production data
3. **Moderate execution time:** Balance coverage vs speed

### E2E Tests

1. **Test user flows:** Simulate real user behavior
2. **Use page objects:** Encapsulate page interactions
3. **Handle flakiness:** Add proper waits
4. **Parallel execution:** Run tests in parallel when possible
5. **Visual regression:** Consider screenshot testing

---

## Debugging Tests

### Jest Debugging

```bash
# Debug with Node debugger
node --inspect-brk node_modules/.bin/jest --runInBand

# Use VS Code debugger
# Add launch configuration in .vscode/launch.json
```

### Playwright Debugging

```bash
# Debug mode (opens inspector)
npm run test:e2e -- --debug

# Headed mode (see browser)
npm run test:e2e -- --headed

# Slow motion (slow down execution)
npm run test:e2e -- --slow-mo=1000

# Trace viewer (detailed execution trace)
npx playwright show-trace trace.zip
```

---

## Common Test Patterns

### Testing Async Code

```typescript
test("async operation", async () => {
  const result = await asyncFunction()
  expect(result).toBe("expected")
})
```

### Testing Errors

```typescript
test("should throw error", async () => {
  await expect(functionThatThrows()).rejects.toThrow("Error message")
})
```

### Testing HTTP Endpoints

```typescript
test("GET /api/data", async () => {
  const response = await request(app).get("/api/data")

  expect(response.status).toBe(200)
  expect(response.body).toEqual({ data: "value" })
})
```

### Testing WebSockets

```typescript
test("websocket connection", async () => {
  const ws = new WebSocket("ws://localhost:8081/ws")

  await new Promise((resolve) => ws.on("open", resolve))

  ws.send("test message")

  const response = await new Promise((resolve) => {
    ws.on("message", resolve)
  })

  expect(response).toBe("expected response")
})
```

---

## Extending Tests

### Adding New Unit Tests

1. Create test file in `test/unit/` matching source structure
2. Import module to test
3. Write test cases
4. Run tests to verify

### Adding New E2E Tests

1. Create test file in `test/e2e/`
2. Use CodeServer page object model
3. Write user flow tests
4. Run with Playwright

### Adding Test Utilities

1. Create utility in `test/utils/`
2. Export functions
3. Import in test files

---

## Related Files

- **Source Code:** `src/` (code being tested)
- **CI Scripts:** `ci/dev/test-*.sh`
- **Jest Config:** `jest.config.js` (if exists)
- **Playwright Config:** `test/playwright.config.ts`

---

## Future Enhancements

- [ ] Visual regression testing
- [ ] Performance testing
- [ ] Load testing
- [ ] Security testing (penetration tests)
- [ ] Accessibility testing
- [ ] Mobile browser testing
- [ ] Cross-browser compatibility tests
- [ ] API contract testing
