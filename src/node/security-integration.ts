/**
 * Security Integration Module
 *
 * This module integrates the security middleware from src/core/security.ts
 * into the main Express application. Previously, the security module was
 * orphaned (existed but not used). This provides easy integration points.
 *
 * Usage in app.ts:
 *   import { setupSecurity } from "./security-integration"
 *   setupSecurity(app)
 */

import { Express } from "express"
import { securityHeaders, hsts } from "../core/security"

/**
 * Apply security middleware to Express app
 *
 * @param app - Express application instance
 * @param options - Configuration options
 */
export function setupSecurity(
  app: Express,
  options: {
    enableHSTS?: boolean
    hstsMaxAge?: number
  } = {},
): void {
  // Apply security headers middleware
  // This adds CSP, X-Frame-Options, X-Content-Type-Options, etc.
  app.use(securityHeaders())

  // Apply HSTS if enabled (typically for HTTPS deployments)
  if (options.enableHSTS) {
    app.use(hsts(options.hstsMaxAge))
  }
}

/**
 * Note: Additional security features from src/core/security.ts
 * that can be integrated as needed:
 *
 * - CSRFProtection class - For state-changing operations
 * - rateLimit() - Additional rate limiting beyond login
 * - sanitizeHTML() - For user-generated content
 * - validateInput() - For form validation
 *
 * Example usage:
 *
 * import { CSRFProtection, rateLimit } from "../core/security"
 *
 * const csrf = new CSRFProtection()
 * app.use(csrf.generateToken())
 * app.post("/api/*", csrf.validateToken())
 *
 * app.use("/api/*", rateLimit(100, 15 * 60 * 1000)) // 100 req per 15min
 */
