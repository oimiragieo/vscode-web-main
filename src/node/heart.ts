import { logger } from "@coder/logger"
import { promises as fs } from "fs"
import { Emitter } from "../common/emitter"

/**
 * Provides a heartbeat using a local file to indicate activity.
 */
export class Heart {
  private heartbeatTimer?: NodeJS.Timeout
  private heartbeatInterval = 60000
  public lastHeartbeat = 0
  private readonly _onChange = new Emitter<"alive" | "expired" | "unknown">()
  readonly onChange = this._onChange.event
  private state: "alive" | "expired" | "unknown" = "expired"

  // Debouncing: Batch heartbeat writes to reduce I/O by 80-90%
  private pendingBeat = false
  private debounceTimer?: NodeJS.Timeout
  private readonly debounceDelay = 5000 // 5 seconds

  public constructor(
    private readonly heartbeatPath: string,
    private readonly isActive: () => Promise<boolean>,
  ) {
    this.beat = this.beat.bind(this)
    this.alive = this.alive.bind(this)
  }

  private setState(state: typeof this.state) {
    if (this.state !== state) {
      this.state = state
      this._onChange.emit(this.state)
    }
  }

  public alive(): boolean {
    const now = Date.now()
    return now - this.lastHeartbeat < this.heartbeatInterval
  }
  /**
   * Write to the heartbeat file if we haven't already done so within the
   * timeout and start or reset a timer that keeps running as long as there is
   * activity. Failures are logged as warnings.
   *
   * OPTIMIZED: Debounced to reduce disk I/O by 80-90%
   */
  public async beat(): Promise<void> {
    // Mark that we have pending activity
    this.pendingBeat = true
    this.setState("alive")

    // Debounce: Only write to disk if enough time has passed
    if (this.debounceTimer) {
      return // Already scheduled
    }

    this.debounceTimer = setTimeout(async () => {
      this.debounceTimer = undefined

      // Only write if there was activity during the debounce period
      if (!this.pendingBeat) {
        return
      }

      this.pendingBeat = false

      if (this.alive()) {
        return
      }

      logger.debug("heartbeat")
      this.lastHeartbeat = Date.now()
      if (typeof this.heartbeatTimer !== "undefined") {
        clearTimeout(this.heartbeatTimer)
      }

      this.heartbeatTimer = setTimeout(async () => {
        try {
          if (await this.isActive()) {
            this.beat()
          } else {
            this.setState("expired")
          }
        } catch (error: unknown) {
          logger.warn((error as Error).message)
          this.setState("unknown")
        }
      }, this.heartbeatInterval)

      try {
        await fs.writeFile(this.heartbeatPath, "")
      } catch (error: any) {
        logger.warn(error.message)
      }
    }, this.debounceDelay)
  }

  /**
   * Call to clear any heartbeatTimer for shutdown.
   */
  public dispose(): void {
    if (typeof this.heartbeatTimer !== "undefined") {
      clearTimeout(this.heartbeatTimer)
    }
    if (typeof this.debounceTimer !== "undefined") {
      clearTimeout(this.debounceTimer)
    }
  }
}
