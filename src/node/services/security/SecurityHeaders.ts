/**
 * Security Headers Middleware (Week 6 Optimization)
 * Implements OWASP security best practices through HTTP headers
 */

import { Request, Response, NextFunction } from "express"

export interface SecurityHeadersConfig {
  /** Content Security Policy directives */
  contentSecurityPolicy?: {
    directives?: Record<string, string[] | string | boolean>
    reportOnly?: boolean
  }
  /** HTTP Strict Transport Security */
  strictTransportSecurity?: {
    maxAge?: number
    includeSubDomains?: boolean
    preload?: boolean
  }
  /** X-Frame-Options */
  xFrameOptions?: "DENY" | "SAMEORIGIN" | string
  /** X-Content-Type-Options */
  xContentTypeOptions?: boolean
  /** X-XSS-Protection */
  xXSSProtection?: boolean
  /** Referrer-Policy */
  referrerPolicy?: string
  /** Permissions-Policy (Feature-Policy) */
  permissionsPolicy?: Record<string, string[]>
  /** Cross-Origin-Embedder-Policy */
  crossOriginEmbedderPolicy?: "require-corp" | "credentialless"
  /** Cross-Origin-Opener-Policy */
  crossOriginOpenerPolicy?: "same-origin" | "same-origin-allow-popups" | "unsafe-none"
  /** Cross-Origin-Resource-Policy */
  crossOriginResourcePolicy?: "same-origin" | "same-site" | "cross-origin"
}

/**
 * Default secure configuration
 */
const DEFAULT_CONFIG: Required<SecurityHeadersConfig> = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // VSCode requires inline scripts
      styleSrc: ["'self'", "'unsafe-inline'"], // VSCode requires inline styles
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "data:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      frameSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      upgradeInsecureRequests: true,
    },
    reportOnly: false,
  },
  strictTransportSecurity: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  xFrameOptions: "SAMEORIGIN",
  xContentTypeOptions: true,
  xXSSProtection: true,
  referrerPolicy: "strict-origin-when-cross-origin",
  permissionsPolicy: {
    camera: ["()"],
    microphone: ["()"],
    geolocation: ["()"],
    payment: ["()"],
  },
  crossOriginEmbedderPolicy: "require-corp",
  crossOriginOpenerPolicy: "same-origin",
  crossOriginResourcePolicy: "same-origin",
}

/**
 * Security Headers Middleware
 */
export class SecurityHeadersMiddleware {
  private config: Required<SecurityHeadersConfig>

  constructor(config: Partial<SecurityHeadersConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      contentSecurityPolicy: {
        ...DEFAULT_CONFIG.contentSecurityPolicy,
        ...config.contentSecurityPolicy,
        directives: {
          ...DEFAULT_CONFIG.contentSecurityPolicy.directives,
          ...config.contentSecurityPolicy?.directives,
        },
      },
      strictTransportSecurity: {
        ...DEFAULT_CONFIG.strictTransportSecurity,
        ...config.strictTransportSecurity,
      },
      permissionsPolicy: {
        ...DEFAULT_CONFIG.permissionsPolicy,
        ...config.permissionsPolicy,
      },
    }
  }

  /**
   * Express middleware function
   */
  middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Content-Security-Policy
      if (this.config.contentSecurityPolicy) {
        const csp = this.formatCSP(this.config.contentSecurityPolicy.directives)
        const headerName = this.config.contentSecurityPolicy.reportOnly
          ? "Content-Security-Policy-Report-Only"
          : "Content-Security-Policy"
        res.setHeader(headerName, csp)
      }

      // Strict-Transport-Security (only for HTTPS)
      if (req.secure || req.headers["x-forwarded-proto"] === "https") {
        const hsts = this.formatHSTS(this.config.strictTransportSecurity)
        res.setHeader("Strict-Transport-Security", hsts)
      }

      // X-Frame-Options
      if (this.config.xFrameOptions) {
        res.setHeader("X-Frame-Options", this.config.xFrameOptions)
      }

      // X-Content-Type-Options
      if (this.config.xContentTypeOptions) {
        res.setHeader("X-Content-Type-Options", "nosniff")
      }

      // X-XSS-Protection (legacy, but still used)
      if (this.config.xXSSProtection) {
        res.setHeader("X-XSS-Protection", "1; mode=block")
      }

      // Referrer-Policy
      if (this.config.referrerPolicy) {
        res.setHeader("Referrer-Policy", this.config.referrerPolicy)
      }

      // Permissions-Policy
      if (this.config.permissionsPolicy) {
        const policy = this.formatPermissionsPolicy(this.config.permissionsPolicy)
        res.setHeader("Permissions-Policy", policy)
      }

      // Cross-Origin-Embedder-Policy
      if (this.config.crossOriginEmbedderPolicy) {
        res.setHeader("Cross-Origin-Embedder-Policy", this.config.crossOriginEmbedderPolicy)
      }

      // Cross-Origin-Opener-Policy
      if (this.config.crossOriginOpenerPolicy) {
        res.setHeader("Cross-Origin-Opener-Policy", this.config.crossOriginOpenerPolicy)
      }

      // Cross-Origin-Resource-Policy
      if (this.config.crossOriginResourcePolicy) {
        res.setHeader("Cross-Origin-Resource-Policy", this.config.crossOriginResourcePolicy)
      }

      next()
    }
  }

  /**
   * Format CSP directives
   */
  private formatCSP(directives: Record<string, string[] | string | boolean>): string {
    const parts: string[] = []

    for (const [key, value] of Object.entries(directives)) {
      const directive = key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)

      if (typeof value === "boolean" && value) {
        // Boolean directives (e.g., upgrade-insecure-requests)
        parts.push(directive)
      } else if (Array.isArray(value)) {
        // Array directives (e.g., default-src)
        parts.push(`${directive} ${value.join(" ")}`)
      } else if (typeof value === "string") {
        // String directives
        parts.push(`${directive} ${value}`)
      }
    }

    return parts.join("; ")
  }

  /**
   * Format HSTS header
   */
  private formatHSTS(config: { maxAge: number; includeSubDomains: boolean; preload: boolean }): string {
    let value = `max-age=${config.maxAge}`

    if (config.includeSubDomains) {
      value += "; includeSubDomains"
    }

    if (config.preload) {
      value += "; preload"
    }

    return value
  }

  /**
   * Format Permissions-Policy header
   */
  private formatPermissionsPolicy(policy: Record<string, string[]>): string {
    const parts: string[] = []

    for (const [feature, allowlist] of Object.entries(policy)) {
      if (allowlist.length === 0 || (allowlist.length === 1 && allowlist[0] === "()")) {
        parts.push(`${feature}=()`)
      } else {
        parts.push(`${feature}=(${allowlist.join(" ")})`)
      }
    }

    return parts.join(", ")
  }
}

/**
 * Preset configurations
 */
export const SecurityPresets = {
  /**
   * Maximum security (strictest)
   */
  strict: (): Partial<SecurityHeadersConfig> => ({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: true,
      },
    },
    xFrameOptions: "DENY",
    crossOriginOpenerPolicy: "same-origin",
  }),

  /**
   * Balanced security (recommended)
   */
  balanced: (): Partial<SecurityHeadersConfig> => DEFAULT_CONFIG,

  /**
   * Relaxed security (for development)
   */
  development: (): Partial<SecurityHeadersConfig> => ({
    contentSecurityPolicy: {
      reportOnly: true,
      directives: {
        defaultSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        connectSrc: ["'self'", "ws:", "wss:", "http:", "https:"],
      },
    },
    xFrameOptions: "SAMEORIGIN",
  }),
}

/**
 * Helper function to create middleware with default config
 */
export function securityHeaders(
  config: Partial<SecurityHeadersConfig> = {},
): ReturnType<SecurityHeadersMiddleware["middleware"]> {
  const middleware = new SecurityHeadersMiddleware(config)
  return middleware.middleware()
}
