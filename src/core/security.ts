/**
 * Security Middleware and Utilities
 * Provides CSRF protection, security headers, and input sanitization
 */

import { logger } from "@coder/logger"
import crypto from "crypto"
import { Request, Response, NextFunction } from "express"

/**
 * Generate CSRF token
 */
export function generateCSRFToken(): string {
  return crypto.randomBytes(32).toString("hex")
}

/**
 * CSRF Protection Middleware
 */
export class CSRFProtection {
  private tokens: Map<string, number> = new Map()
  private readonly tokenExpiry = 60 * 60 * 1000 // 1 hour

  /**
   * Middleware to generate and attach CSRF token
   */
  generateToken() {
    return (req: Request, res: Response, next: NextFunction) => {
      const token = generateCSRFToken()
      const expiry = Date.now() + this.tokenExpiry

      this.tokens.set(token, expiry)

      // Attach to response locals for template access
      res.locals.csrfToken = token

      // Clean up expired tokens periodically
      if (Math.random() < 0.01) {
        // 1% chance
        this.cleanupExpiredTokens()
      }

      next()
    }
  }

  /**
   * Middleware to validate CSRF token
   */
  validateToken() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Skip validation for safe methods
      if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
        return next()
      }

      const token = req.body?._csrf || req.headers["x-csrf-token"]

      if (!token) {
        logger.warn("CSRF token missing", {
          ip: req.ip,
          url: req.originalUrl,
        })
        return res.status(403).json({ error: "CSRF token missing" })
      }

      const expiry = this.tokens.get(token as string)

      if (!expiry) {
        logger.warn("Invalid CSRF token", {
          ip: req.ip,
          url: req.originalUrl,
        })
        return res.status(403).json({ error: "Invalid CSRF token" })
      }

      if (Date.now() > expiry) {
        this.tokens.delete(token as string)
        logger.warn("Expired CSRF token", {
          ip: req.ip,
          url: req.originalUrl,
        })
        return res.status(403).json({ error: "CSRF token expired" })
      }

      // Token is valid, remove it (one-time use)
      this.tokens.delete(token as string)
      next()
    }
  }

  private cleanupExpiredTokens() {
    const now = Date.now()
    for (const [token, expiry] of this.tokens.entries()) {
      if (now > expiry) {
        this.tokens.delete(token)
      }
    }
  }
}

/**
 * Security Headers Middleware
 */
export function securityHeaders() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Content Security Policy
    res.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // VS Code requires eval
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "font-src 'self' data:",
        "connect-src 'self' ws: wss:",
        "frame-ancestors 'self'",
      ].join("; "),
    )

    // Prevent clickjacking
    res.setHeader("X-Frame-Options", "SAMEORIGIN")

    // Prevent MIME sniffing
    res.setHeader("X-Content-Type-Options", "nosniff")

    // Enable XSS filter
    res.setHeader("X-XSS-Protection", "1; mode=block")

    // Referrer Policy
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin")

    // Permissions Policy
    res.setHeader(
      "Permissions-Policy",
      "geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=()",
    )

    next()
  }
}

/**
 * HSTS (HTTP Strict Transport Security)
 */
export function hsts(maxAge: number = 31536000) {
  return (req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Strict-Transport-Security", `max-age=${maxAge}; includeSubDomains; preload`)
    next()
  }
}

/**
 * Sanitize HTML to prevent XSS
 */
export function sanitizeHTML(html: string): string {
  return html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;")
}

/**
 * Sanitize object recursively
 */
export function sanitizeObject(obj: any): any {
  if (typeof obj === "string") {
    return sanitizeHTML(obj)
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject)
  }

  if (typeof obj === "object" && obj !== null) {
    const sanitized: any = {}
    for (const [key, value] of Object.entries(obj)) {
      sanitized[sanitizeHTML(key)] = sanitizeObject(value)
    }
    return sanitized
  }

  return obj
}

/**
 * Rate limiting store
 */
export class RateLimitStore {
  private store: Map<string, { count: number; resetTime: number }> = new Map()

  isAllowed(key: string, maxRequests: number, windowMs: number): boolean {
    const now = Date.now()
    const record = this.store.get(key)

    if (!record || now > record.resetTime) {
      this.store.set(key, { count: 1, resetTime: now + windowMs })
      return true
    }

    if (record.count >= maxRequests) {
      return false
    }

    record.count++
    return true
  }

  cleanup() {
    const now = Date.now()
    for (const [key, record] of this.store.entries()) {
      if (now > record.resetTime) {
        this.store.delete(key)
      }
    }
  }
}

/**
 * Rate limiting middleware
 */
export function rateLimit(maxRequests: number, windowMs: number) {
  const store = new RateLimitStore()

  // Cleanup every minute
  setInterval(() => store.cleanup(), 60000)

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || "unknown"

    if (!store.isAllowed(key, maxRequests, windowMs)) {
      logger.warn("Rate limit exceeded", {
        ip: req.ip,
        url: req.originalUrl,
      })
      return res.status(429).json({
        error: "Too many requests, please try again later",
      })
    }

    next()
  }
}

/**
 * Input validation helper
 */
export function validateInput(
  value: any,
  rules: {
    required?: boolean
    type?: "string" | "number" | "boolean" | "email" | "url"
    minLength?: number
    maxLength?: number
    min?: number
    max?: number
    pattern?: RegExp
    custom?: (value: any) => boolean
  },
): { valid: boolean; error?: string } {
  if (rules.required && (value === undefined || value === null || value === "")) {
    return { valid: false, error: "This field is required" }
  }

  if (!rules.required && (value === undefined || value === null || value === "")) {
    return { valid: true }
  }

  if (rules.type) {
    const actualType = typeof value

    if (rules.type === "email") {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(value)) {
        return { valid: false, error: "Invalid email address" }
      }
    } else if (rules.type === "url") {
      try {
        new URL(value)
      } catch {
        return { valid: false, error: "Invalid URL" }
      }
    } else if (actualType !== rules.type) {
      return { valid: false, error: `Expected ${rules.type}, got ${actualType}` }
    }
  }

  if (rules.minLength && typeof value === "string" && value.length < rules.minLength) {
    return { valid: false, error: `Minimum length is ${rules.minLength}` }
  }

  if (rules.maxLength && typeof value === "string" && value.length > rules.maxLength) {
    return { valid: false, error: `Maximum length is ${rules.maxLength}` }
  }

  if (rules.min !== undefined && typeof value === "number" && value < rules.min) {
    return { valid: false, error: `Minimum value is ${rules.min}` }
  }

  if (rules.max !== undefined && typeof value === "number" && value > rules.max) {
    return { valid: false, error: `Maximum value is ${rules.max}` }
  }

  if (rules.pattern && typeof value === "string" && !rules.pattern.test(value)) {
    return { valid: false, error: "Invalid format" }
  }

  if (rules.custom && !rules.custom(value)) {
    return { valid: false, error: "Validation failed" }
  }

  return { valid: true }
}
