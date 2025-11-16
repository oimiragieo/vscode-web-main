/**
 * Password Hashing Worker
 * Offloads CPU-intensive argon2 operations to worker threads
 * Expected: 200-400ms reduction per auth sequence
 */

import * as argon2 from "argon2"
import { parentPort } from "worker_threads"

interface WorkerMessage {
  id: string
  type: "hash" | "verify"
  password: string
  hash?: string
}

interface WorkerResponse {
  id: string
  success: boolean
  result?: string | boolean
  error?: string
}

// Handle messages from main thread
parentPort?.on("message", async (message: WorkerMessage) => {
  try {
    let result: string | boolean

    switch (message.type) {
      case "hash":
        result = await argon2.hash(message.password)
        break

      case "verify":
        if (!message.hash) {
          throw new Error("Hash required for verify operation")
        }
        result = await argon2.verify(message.hash, message.password)
        break

      default:
        throw new Error(`Unknown operation type: ${(message as any).type}`)
    }

    const response: WorkerResponse = {
      id: message.id,
      success: true,
      result,
    }

    parentPort?.postMessage(response)
  } catch (error: any) {
    const response: WorkerResponse = {
      id: message.id,
      success: false,
      error: error.message,
    }

    parentPort?.postMessage(response)
  }
})
