/**
 * Request Timeout Utilities (Week 5 Optimization)
 * Prevents hanging requests and improves error handling
 */

import { Request, Response, NextFunction } from "express"
import { IncomingMessage, ServerResponse } from "http"

export interface TimeoutOptions {
  /** Timeout in milliseconds (default: 30000ms = 30s) */
  timeout?: number
  /** Custom timeout handler */
  onTimeout?: (req: Request, res: Response) => void
}

/**
 * Express middleware to add request timeouts
 * Automatically terminates requests that exceed the timeout threshold
 */
export const requestTimeout = (options: TimeoutOptions = {}) => {
  const timeout = options.timeout || 30000 // Default 30 seconds
  const onTimeout =
    options.onTimeout ||
    ((req: Request, res: Response) => {
      res.status(408).json({
        error: "Request Timeout",
        message: `Request exceeded ${timeout}ms timeout`,
        path: req.path,
      })
    })

  return (req: Request, res: Response, next: NextFunction) => {
    // Set socket timeout
    if (req.socket) {
      req.socket.setTimeout(timeout)
    }

    // Set request timeout
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        onTimeout(req, res)
      }
    }, timeout)

    // Clear timeout when response finishes
    res.on("finish", () => {
      clearTimeout(timer)
    })

    // Clear timeout on connection close
    res.on("close", () => {
      clearTimeout(timer)
    })

    next()
  }
}

/**
 * Fetch wrapper with AbortController for timeout support
 * Compatible with Node.js 18+ native fetch
 */
export class TimeoutManager {
  /**
   * Fetch with timeout using AbortController
   * @param url URL to fetch
   * @param options Fetch options
   * @param timeout Timeout in milliseconds (default: 30000ms)
   * @returns Promise<Response>
   * @throws Error if request times out
   */
  static async fetchWithTimeout(url: string, options: RequestInit = {}, timeout = 30000): Promise<Response> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      return response
    } catch (err: any) {
      clearTimeout(timeoutId)
      if (err.name === "AbortError") {
        throw new Error(`Request timeout after ${timeout}ms: ${url}`)
      }
      throw err
    }
  }

  /**
   * Promise wrapper with timeout
   * Generic utility to add timeout to any promise
   */
  static async withTimeout<T>(promise: Promise<T>, timeout: number, errorMessage?: string): Promise<T> {
    let timeoutId: NodeJS.Timeout

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(errorMessage || `Operation timeout after ${timeout}ms`))
      }, timeout)
    })

    try {
      const result = await Promise.race([promise, timeoutPromise])
      clearTimeout(timeoutId!)
      return result
    } catch (err) {
      clearTimeout(timeoutId!)
      throw err
    }
  }

  /**
   * Batch requests with timeout
   * Executes multiple requests with individual timeouts
   */
  static async batchWithTimeout<T>(
    requests: Array<() => Promise<T>>,
    timeout = 30000,
    failFast = false,
  ): Promise<Array<T | Error>> {
    const promises = requests.map((req) =>
      this.withTimeout(req(), timeout, "Batch request timeout").catch((err) => err as Error),
    )

    if (failFast) {
      return Promise.all(promises)
    } else {
      return Promise.allSettled(promises).then((results) =>
        results.map((result) => (result.status === "fulfilled" ? result.value : result.reason)),
      )
    }
  }
}

/**
 * HTTP request with retry and timeout
 * Combines timeout with exponential backoff retry logic
 */
export interface RetryOptions {
  maxRetries?: number
  initialDelay?: number
  maxDelay?: number
  timeout?: number
  shouldRetry?: (error: Error, attempt: number) => boolean
}

export class RetryableRequest {
  static async fetchWithRetry(
    url: string,
    options: RequestInit = {},
    retryOptions: RetryOptions = {},
  ): Promise<Response> {
    const {
      maxRetries = 3,
      initialDelay = 1000,
      maxDelay = 10000,
      timeout = 30000,
      shouldRetry = (error: Error) => {
        // Retry on network errors and 5xx server errors
        return error.message.includes("timeout") || error.message.includes("ECONNREFUSED")
      },
    } = retryOptions

    let lastError: Error | null = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await TimeoutManager.fetchWithTimeout(url, options, timeout)

        // Retry on 5xx server errors
        if (response.status >= 500 && attempt < maxRetries) {
          throw new Error(`Server error: ${response.status}`)
        }

        return response
      } catch (err: any) {
        lastError = err

        // Don't retry if we've exhausted attempts
        if (attempt === maxRetries) {
          break
        }

        // Check if we should retry this error
        if (!shouldRetry(err, attempt)) {
          throw err
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(initialDelay * Math.pow(2, attempt), maxDelay)

        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }

    throw lastError || new Error("Request failed after retries")
  }
}
