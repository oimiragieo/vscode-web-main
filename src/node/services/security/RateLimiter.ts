/**
 * Enhanced Rate Limiting (Week 6 Optimization)
 * Prevents abuse and protects against DDoS attacks
 */

import { Request, Response, NextFunction } from "express"

export interface RateLimitConfig {
  /** Window size in milliseconds */
  windowMs: number
  /** Maximum requests per window */
  max: number
  /** Message to send when rate limit is exceeded */
  message?: string
  /** Status code to send when rate limit is exceeded */
  statusCode?: number
  /** Skip rate limiting for certain requests */
  skip?: (req: Request) => boolean
  /** Custom key generator (default: IP address) */
  keyGenerator?: (req: Request) => string
}

export interface RateLimitInfo {
  limit: number
  current: number
  remaining: number
  resetTime: number
}

/**
 * Sliding Window Rate Limiter
 * Tracks requests per key (IP, user, etc.) with sliding time window
 */
export class RateLimiter {
  private requests = new Map<string, number[]>() // key -> array of timestamps
  private config: Required<RateLimitConfig>

  constructor(config: RateLimitConfig) {
    this.config = {
      windowMs: config.windowMs,
      max: config.max,
      message: config.message || "Too many requests, please try again later",
      statusCode: config.statusCode || 429,
      skip: config.skip || (() => false),
      keyGenerator: config.keyGenerator || ((req: Request) => this.getIP(req)),
    }

    // Start cleanup interval (run every minute)
    setInterval(() => this.cleanup(), 60000)
  }

  /**
   * Express middleware function
   */
  middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Skip if configured to skip
      if (this.config.skip(req)) {
        return next()
      }

      const key = this.config.keyGenerator(req)
      const now = Date.now()
      const info = this.getRateLimitInfo(key, now)

      // Set rate limit headers
      res.setHeader("X-RateLimit-Limit", info.limit.toString())
      res.setHeader("X-RateLimit-Remaining", Math.max(0, info.remaining).toString())
      res.setHeader("X-RateLimit-Reset", new Date(info.resetTime).toISOString())

      if (info.current >= info.limit) {
        // Rate limit exceeded
        res.setHeader("Retry-After", Math.ceil((info.resetTime - now) / 1000).toString())
        return res.status(this.config.statusCode).json({
          error: "Rate limit exceeded",
          message: this.config.message,
          retryAfter: info.resetTime,
        })
      }

      // Record this request
      this.recordRequest(key, now)
      next()
    }
  }

  /**
   * Get rate limit info for a key
   */
  private getRateLimitInfo(key: string, now: number): RateLimitInfo {
    const windowStart = now - this.config.windowMs
    const timestamps = this.requests.get(key) || []

    // Count requests within window
    const requestsInWindow = timestamps.filter((t) => t > windowStart)
    const current = requestsInWindow.length

    return {
      limit: this.config.max,
      current,
      remaining: Math.max(0, this.config.max - current),
      resetTime: now + this.config.windowMs,
    }
  }

  /**
   * Record a request for a key
   */
  private recordRequest(key: string, now: number): void {
    const windowStart = now - this.config.windowMs
    let timestamps = this.requests.get(key) || []

    // Remove old timestamps
    timestamps = timestamps.filter((t) => t > windowStart)

    // Add new timestamp
    timestamps.push(now)

    this.requests.set(key, timestamps)
  }

  /**
   * Get IP address from request
   */
  private getIP(req: Request): string {
    return (
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      (req.headers["x-real-ip"] as string) ||
      req.socket.remoteAddress ||
      "unknown"
    )
  }

  /**
   * Cleanup old entries
   */
  private cleanup(): void {
    const now = Date.now()
    const windowStart = now - this.config.windowMs

    for (const [key, timestamps] of this.requests) {
      const filtered = timestamps.filter((t) => t > windowStart)
      if (filtered.length === 0) {
        this.requests.delete(key)
      } else {
        this.requests.set(key, filtered)
      }
    }
  }

  /**
   * Reset rate limit for a key
   */
  reset(key: string): void {
    this.requests.delete(key)
  }

  /**
   * Reset all rate limits
   */
  resetAll(): void {
    this.requests.clear()
  }

  /**
   * Get current stats
   */
  getStats(): {
    totalKeys: number
    totalRequests: number
    topKeys: Array<{ key: string; requests: number }>
  } {
    const now = Date.now()
    const windowStart = now - this.config.windowMs
    let totalRequests = 0
    const keyCounts: Array<{ key: string; requests: number }> = []

    for (const [key, timestamps] of this.requests) {
      const count = timestamps.filter((t) => t > windowStart).length
      totalRequests += count
      keyCounts.push({ key, requests: count })
    }

    // Sort by request count descending
    keyCounts.sort((a, b) => b.requests - a.requests)

    return {
      totalKeys: this.requests.size,
      totalRequests,
      topKeys: keyCounts.slice(0, 10),
    }
  }
}

/**
 * Composite Rate Limiter
 * Combines multiple rate limiters (per-IP, per-user, global)
 */
export class CompositeRateLimiter {
  private limiters: RateLimiter[] = []

  add(limiter: RateLimiter): void {
    this.limiters.push(limiter)
  }

  middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Chain all limiters
      let index = 0

      const runNext = () => {
        if (index >= this.limiters.length) {
          return next()
        }

        const limiter = this.limiters[index++]
        limiter.middleware()(req, res, runNext)
      }

      runNext()
    }
  }
}

/**
 * Common rate limit presets
 */
export const RateLimitPresets = {
  /**
   * Very strict - for sensitive endpoints (login, register)
   */
  strict: (windowMs = 15 * 60 * 1000): RateLimitConfig => ({
    windowMs,
    max: 5,
    message: "Too many attempts, please try again later",
  }),

  /**
   * Moderate - for API endpoints
   */
  api: (windowMs = 15 * 60 * 1000): RateLimitConfig => ({
    windowMs,
    max: 100,
    message: "API rate limit exceeded",
  }),

  /**
   * Lenient - for general web traffic
   */
  general: (windowMs = 15 * 60 * 1000): RateLimitConfig => ({
    windowMs,
    max: 1000,
    message: "Rate limit exceeded",
  }),

  /**
   * Per-user rate limit (requires user ID in request)
   */
  perUser: (windowMs = 60 * 60 * 1000): RateLimitConfig => ({
    windowMs,
    max: 500,
    keyGenerator: (req: Request) => {
      // Assumes req.user.id exists after authentication
      return (req as any).user?.id || "anonymous"
    },
    message: "User rate limit exceeded",
  }),
}
