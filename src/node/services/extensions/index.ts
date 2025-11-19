/**
 * Extension Optimizations Integration
 * Provides performance improvements for extension loading and memory management
 */

import { logger } from "@coder/logger"
import { getExtensionCache, getExtensionPreloader } from "./ExtensionCache"
import { getExtensionMemoryMonitor } from "./ExtensionMemoryMonitor"
import { getMetricsRegistry } from "../monitoring/PrometheusMetrics"

/**
 * Extension Optimization Manager
 * Centralized management of all extension optimizations
 */
export class ExtensionOptimizationManager {
  private cache = getExtensionCache()
  private preloader = getExtensionPreloader()
  private memoryMonitor = getExtensionMemoryMonitor()
  private monitoringInterval: NodeJS.Timeout | null = null

  /**
   * Initialize extension optimizations
   */
  initialize(): void {
    logger.info("Initializing extension optimizations...")

    // Start memory monitoring for the main process
    // Monitor with 512MB limit (will warn at 435MB, critical at 486MB)
    this.memoryMonitor.monitorExtension("vscode-server", 512)

    // Hook into memory monitor events
    this.memoryMonitor.on("warning", (event) => {
      logger.warn(
        `Memory warning: ${event.extensionId} using ${event.usage.toFixed(2)}MB (${event.percentage.toFixed(1)}% of ${event.limit}MB limit)`,
      )

      // Track in metrics
      const metricsRegistry = getMetricsRegistry()
      metricsRegistry.setGauge("extension_memory_warning", 1, { extension: event.extensionId })
    })

    this.memoryMonitor.on("critical", (event) => {
      logger.error(
        `Memory critical: ${event.extensionId} using ${event.usage.toFixed(2)}MB (${event.percentage.toFixed(1)}% of ${event.limit}MB limit)`,
      )

      // Track in metrics
      const metricsRegistry = getMetricsRegistry()
      metricsRegistry.setGauge("extension_memory_critical", 1, { extension: event.extensionId })
    })

    this.memoryMonitor.on("limit-exceeded", (event) => {
      logger.error(
        `Memory limit exceeded: ${event.extensionId} using ${event.usage.toFixed(2)}MB (exceeded ${event.limit}MB limit)`,
      )

      // Track in metrics
      const metricsRegistry = getMetricsRegistry()
      metricsRegistry.incCounter("extension_memory_limit_exceeded", { extension: event.extensionId })
    })

    // Report cache stats periodically
    this.monitoringInterval = setInterval(
      () => {
        this.reportStats()
      },
      60000, // Every 60 seconds
    )

    logger.info("✅ Extension optimizations initialized")
    logger.info(`  - Extension cache: active (max 100 extensions)`)
    logger.info(`  - Memory monitor: active (512MB limit)`)
    logger.info(`  - Predictive loader: active`)
  }

  /**
   * Report statistics to metrics and logs
   */
  private reportStats(): void {
    const cacheStats = this.cache.getStats()
    const metricsRegistry = getMetricsRegistry()

    // Cache statistics
    metricsRegistry.setGauge("extension_cache_size", cacheStats.size)
    metricsRegistry.setGauge("extension_cache_hit_rate", cacheStats.hitRate)
    metricsRegistry.incCounter("extension_cache_hits_total", {}, cacheStats.hits)
    metricsRegistry.incCounter("extension_cache_misses_total", {}, cacheStats.misses)

    // Memory usage
    const monitored = this.memoryMonitor.getMonitoredExtensions()
    for (const extensionId of monitored) {
      const usage = this.memoryMonitor.getCurrentUsage(extensionId)
      if (usage) {
        const usageMB = usage.usage.heapUsed / 1024 / 1024
        metricsRegistry.setGauge("extension_memory_usage_mb", usageMB, { extension: extensionId })
      }
    }

    // Log summary
    logger.debug(
      `Extension cache: ${cacheStats.size} cached, ${cacheStats.hits} hits, ${cacheStats.misses} misses (${(cacheStats.hitRate * 100).toFixed(1)}% hit rate)`,
    )
  }

  /**
   * Get extension cache instance
   */
  getCache() {
    return this.cache
  }

  /**
   * Get memory monitor instance
   */
  getMemoryMonitor() {
    return this.memoryMonitor
  }

  /**
   * Get predictive loader instance
   */
  getPreloader() {
    return this.preloader
  }

  /**
   * Dispose and cleanup
   */
  dispose(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
      this.monitoringInterval = null
    }

    this.memoryMonitor.dispose()
    logger.info("Extension optimizations disposed")
  }
}

/**
 * Global extension optimization manager
 */
let globalManager: ExtensionOptimizationManager | null = null

export function getExtensionOptimizationManager(): ExtensionOptimizationManager {
  if (!globalManager) {
    globalManager = new ExtensionOptimizationManager()
  }
  return globalManager
}

export function initializeExtensionOptimizations(): ExtensionOptimizationManager {
  const manager = getExtensionOptimizationManager()
  manager.initialize()
  return manager
}

// Re-export individual services for direct use
export { getExtensionCache, getExtensionPreloader } from "./ExtensionCache"
export { getExtensionMemoryMonitor } from "./ExtensionMemoryMonitor"
export { MessageCoalescer, BidirectionalCoalescer, PriorityMessageCoalescer } from "./MessageCoalescer"
