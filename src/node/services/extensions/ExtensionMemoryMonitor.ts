/**
 * Extension Memory Monitoring (Week 4 Optimization)
 * Enforces memory limits and prevents OOM crashes from extensions
 */

import { EventEmitter } from "events"
import { logger } from "@coder/logger"

export interface MemoryUsage {
  rss: number // Resident Set Size (total memory)
  heapTotal: number // Total heap allocated
  heapUsed: number // Heap actually used
  external: number // C++ objects bound to JavaScript
  arrayBuffers: number // ArrayBuffer and SharedArrayBuffer memory
}

export interface ExtensionMemoryInfo {
  extensionId: string
  usage: MemoryUsage
  limit: number // Limit in MB
  timestamp: Date
}

export interface ExtensionMemoryEvent {
  extensionId: string
  usage: number // Current usage in MB
  limit: number // Limit in MB
  percentage: number // Usage as percentage of limit
}

/**
 * Monitors memory usage and enforces limits
 * Emits events when extensions approach or exceed limits
 */
export class ExtensionMemoryMonitor extends EventEmitter {
  private limits = new Map<string, number>() // extensionId -> limit in MB
  private usageHistory = new Map<string, MemoryUsage[]>() // Track history for trends
  private monitoringIntervals = new Map<string, NodeJS.Timeout>()
  private readonly checkIntervalMs = 10000 // Check every 10 seconds
  private readonly warningThreshold = 0.85 // Warn at 85% of limit
  private readonly criticalThreshold = 0.95 // Critical at 95% of limit
  private readonly historyLength = 10 // Keep last 10 measurements

  /**
   * Start monitoring an extension's memory usage
   * @param extensionId Unique identifier for the extension
   * @param limitMB Memory limit in megabytes
   */
  monitorExtension(extensionId: string, limitMB: number): void {
    this.limits.set(extensionId, limitMB)
    this.usageHistory.set(extensionId, [])

    // Clear existing interval if any
    const existing = this.monitoringIntervals.get(extensionId)
    if (existing) {
      clearInterval(existing)
    }

    // Start monitoring
    const interval = setInterval(() => {
      this.checkMemoryUsage(extensionId)
    }, this.checkIntervalMs)

    this.monitoringIntervals.set(extensionId, interval)

    logger.debug(`Started monitoring extension ${extensionId} with ${limitMB}MB limit`)
  }

  /**
   * Stop monitoring an extension
   */
  stopMonitoring(extensionId: string): void {
    const interval = this.monitoringIntervals.get(extensionId)
    if (interval) {
      clearInterval(interval)
      this.monitoringIntervals.delete(extensionId)
    }

    this.limits.delete(extensionId)
    this.usageHistory.delete(extensionId)

    logger.debug(`Stopped monitoring extension ${extensionId}`)
  }

  /**
   * Check current memory usage for an extension
   */
  private checkMemoryUsage(extensionId: string): void {
    const limit = this.limits.get(extensionId)
    if (!limit) {
      return
    }

    // Get current memory usage
    // Note: In a real implementation, this would need to track per-extension memory
    // For now, we use process.memoryUsage() as a baseline
    const usage = process.memoryUsage()

    // Store in history
    this.addToHistory(extensionId, usage)

    // Calculate usage in MB
    const usageMB = usage.heapUsed / 1024 / 1024
    const percentage = usageMB / limit

    const event: ExtensionMemoryEvent = {
      extensionId,
      usage: usageMB,
      limit,
      percentage: percentage * 100,
    }

    // Emit appropriate events based on usage
    if (percentage >= 1.0) {
      logger.error(`Extension ${extensionId} exceeded memory limit: ${usageMB.toFixed(2)}MB / ${limit}MB`)
      this.emit("limit-exceeded", event)
      this.emit("kill-extension", { extensionId, usage: usageMB, limit })
    } else if (percentage >= this.criticalThreshold) {
      logger.warn(
        `Extension ${extensionId} approaching memory limit (critical): ${usageMB.toFixed(2)}MB / ${limit}MB (${(percentage * 100).toFixed(1)}%)`,
      )
      this.emit("critical", event)
    } else if (percentage >= this.warningThreshold) {
      logger.warn(
        `Extension ${extensionId} approaching memory limit (warning): ${usageMB.toFixed(2)}MB / ${limit}MB (${(percentage * 100).toFixed(1)}%)`,
      )
      this.emit("warning", event)
    }

    // Emit general usage event for monitoring dashboards
    this.emit("usage", event)
  }

  /**
   * Add memory measurement to history
   */
  private addToHistory(extensionId: string, usage: MemoryUsage): void {
    const history = this.usageHistory.get(extensionId) || []
    history.push(usage)

    // Keep only last N measurements
    if (history.length > this.historyLength) {
      history.shift()
    }

    this.usageHistory.set(extensionId, history)
  }

  /**
   * Get current memory usage for an extension
   */
  getCurrentUsage(extensionId: string): ExtensionMemoryInfo | null {
    const limit = this.limits.get(extensionId)
    const history = this.usageHistory.get(extensionId)

    if (!limit || !history || history.length === 0) {
      return null
    }

    const latestUsage = history[history.length - 1]

    return {
      extensionId,
      usage: latestUsage,
      limit,
      timestamp: new Date(),
    }
  }

  /**
   * Get memory usage trend for an extension
   * Returns true if memory usage is increasing
   */
  isMemoryIncreasing(extensionId: string): boolean {
    const history = this.usageHistory.get(extensionId)
    if (!history || history.length < 3) {
      return false // Not enough data
    }

    // Calculate average of first half vs second half
    const mid = Math.floor(history.length / 2)
    const firstHalf = history.slice(0, mid)
    const secondHalf = history.slice(mid)

    const avgFirst = firstHalf.reduce((sum, u) => sum + u.heapUsed, 0) / firstHalf.length
    const avgSecond = secondHalf.reduce((sum, u) => sum + u.heapUsed, 0) / secondHalf.length

    // Memory is increasing if second half average is 10% higher than first half
    return avgSecond > avgFirst * 1.1
  }

  /**
   * Get all monitored extensions
   */
  getMonitoredExtensions(): string[] {
    return Array.from(this.limits.keys())
  }

  /**
   * Update memory limit for an extension
   */
  updateLimit(extensionId: string, newLimitMB: number): void {
    if (this.limits.has(extensionId)) {
      this.limits.set(extensionId, newLimitMB)
      logger.debug(`Updated memory limit for ${extensionId}: ${newLimitMB}MB`)
    }
  }

  /**
   * Stop all monitoring and cleanup
   */
  dispose(): void {
    for (const [extensionId] of this.monitoringIntervals) {
      this.stopMonitoring(extensionId)
    }
    this.removeAllListeners()
  }
}

/**
 * Global extension memory monitor instance
 */
let globalMonitor: ExtensionMemoryMonitor | null = null

export function getExtensionMemoryMonitor(): ExtensionMemoryMonitor {
  if (!globalMonitor) {
    globalMonitor = new ExtensionMemoryMonitor()
  }
  return globalMonitor
}
