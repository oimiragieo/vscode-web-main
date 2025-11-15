/**
 * Password Worker Pool
 * Manages a pool of worker threads for CPU-intensive password operations
 * Prevents main thread blocking during argon2 hash/verify operations
 */

import { Worker } from "worker_threads"
import * as path from "path"
import * as os from "os"

interface PendingRequest {
  resolve: (value: string | boolean) => void
  reject: (error: Error) => void
}

export class PasswordWorkerPool {
  private workers: Worker[] = []
  private pendingRequests = new Map<string, PendingRequest>()
  private currentWorkerIndex = 0
  private readonly poolSize: number
  private requestCounter = 0

  constructor(poolSize?: number) {
    // Default to CPU count, capped at 4 for password hashing
    this.poolSize = poolSize || Math.min(os.cpus().length, 4)
    this.initialize()
  }

  /**
   * Initialize worker pool
   */
  private initialize(): void {
    const workerPath = path.join(__dirname, "password-worker.js")

    for (let i = 0; i < this.poolSize; i++) {
      const worker = new Worker(workerPath)

      worker.on("message", (response: any) => {
        const pending = this.pendingRequests.get(response.id)

        if (pending) {
          this.pendingRequests.delete(response.id)

          if (response.success) {
            pending.resolve(response.result)
          } else {
            pending.reject(new Error(response.error))
          }
        }
      })

      worker.on("error", (error) => {
        console.error(`Worker ${i} error:`, error)
      })

      worker.on("exit", (code) => {
        if (code !== 0) {
          console.error(`Worker ${i} exited with code ${code}`)
          // Restart worker if it crashes
          this.workers[i] = this.createWorker(i)
        }
      })

      this.workers.push(worker)
    }
  }

  /**
   * Create a new worker (for recovery)
   */
  private createWorker(index: number): Worker {
    const workerPath = path.join(__dirname, "password-worker.js")
    const worker = new Worker(workerPath)

    worker.on("message", (response: any) => {
      const pending = this.pendingRequests.get(response.id)
      if (pending) {
        this.pendingRequests.delete(response.id)
        if (response.success) {
          pending.resolve(response.result)
        } else {
          pending.reject(new Error(response.error))
        }
      }
    })

    return worker
  }

  /**
   * Get next available worker (round-robin)
   */
  private getNextWorker(): Worker {
    const worker = this.workers[this.currentWorkerIndex]
    this.currentWorkerIndex = (this.currentWorkerIndex + 1) % this.poolSize
    return worker
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req-${Date.now()}-${this.requestCounter++}`
  }

  /**
   * Hash a password using worker thread
   * PERFORMANCE: Offloads CPU-intensive operation from main thread
   */
  async hash(password: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const id = this.generateRequestId()
      const worker = this.getNextWorker()

      this.pendingRequests.set(id, {
        resolve: resolve as (value: string | boolean) => void,
        reject,
      })

      worker.postMessage({
        id,
        type: "hash",
        password,
      })

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id)
          reject(new Error("Password hash operation timed out"))
        }
      }, 30000)
    }) as Promise<string>
  }

  /**
   * Verify a password against a hash using worker thread
   * PERFORMANCE: Offloads CPU-intensive operation from main thread
   */
  async verify(hash: string, password: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const id = this.generateRequestId()
      const worker = this.getNextWorker()

      this.pendingRequests.set(id, {
        resolve: resolve as (value: string | boolean) => void,
        reject,
      })

      worker.postMessage({
        id,
        type: "verify",
        password,
        hash,
      })

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id)
          reject(new Error("Password verify operation timed out"))
        }
      }, 30000)
    }) as Promise<boolean>
  }

  /**
   * Shutdown all workers
   */
  async shutdown(): Promise<void> {
    await Promise.all(this.workers.map((worker) => worker.terminate()))
    this.workers = []
    this.pendingRequests.clear()
  }

  /**
   * Get pool statistics
   */
  getStats() {
    return {
      poolSize: this.poolSize,
      pendingRequests: this.pendingRequests.size,
      workers: this.workers.length,
    }
  }
}

// Singleton instance
let workerPoolInstance: PasswordWorkerPool | null = null

/**
 * Get singleton worker pool instance
 */
export function getPasswordWorkerPool(): PasswordWorkerPool {
  if (!workerPoolInstance) {
    workerPoolInstance = new PasswordWorkerPool()
  }
  return workerPoolInstance
}

/**
 * Shutdown worker pool (for graceful shutdown)
 */
export async function shutdownPasswordWorkerPool(): Promise<void> {
  if (workerPoolInstance) {
    await workerPoolInstance.shutdown()
    workerPoolInstance = null
  }
}
