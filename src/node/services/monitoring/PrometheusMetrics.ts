/**
 * Prometheus Metrics Collection (Week 6 Optimization)
 * Exposes production-ready metrics for monitoring and alerting
 */

import { Request, Response, NextFunction } from "express"
import * as os from "os"

export interface MetricLabels {
  [key: string]: string
}

export interface Metric {
  name: string
  type: "counter" | "gauge" | "histogram" | "summary"
  help: string
  value: number
  labels?: MetricLabels
}

/**
 * Histogram buckets for latency tracking (in milliseconds)
 */
const LATENCY_BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]

/**
 * Prometheus Metrics Registry
 * Collects and formats metrics in Prometheus exposition format
 */
export class MetricsRegistry {
  private counters = new Map<string, Map<string, number>>() // metric -> labels -> value
  private gauges = new Map<string, Map<string, number>>()
  private histograms = new Map<string, Map<string, { buckets: Map<number, number>; sum: number; count: number }>>()
  private metricMetadata = new Map<string, { type: string; help: string }>()

  /**
   * Increment a counter metric
   */
  incCounter(name: string, labels: MetricLabels = {}, value = 1): void {
    const labelKey = this.serializeLabels(labels)
    if (!this.counters.has(name)) {
      this.counters.set(name, new Map())
    }
    const current = this.counters.get(name)!.get(labelKey) || 0
    this.counters.get(name)!.set(labelKey, current + value)
  }

  /**
   * Set a gauge metric
   */
  setGauge(name: string, value: number, labels: MetricLabels = {}): void {
    const labelKey = this.serializeLabels(labels)
    if (!this.gauges.has(name)) {
      this.gauges.set(name, new Map())
    }
    this.gauges.get(name)!.set(labelKey, value)
  }

  /**
   * Observe a value in a histogram
   */
  observeHistogram(name: string, value: number, labels: MetricLabels = {}): void {
    const labelKey = this.serializeLabels(labels)
    if (!this.histograms.has(name)) {
      this.histograms.set(name, new Map())
    }
    if (!this.histograms.get(name)!.has(labelKey)) {
      const buckets = new Map<number, number>()
      LATENCY_BUCKETS.forEach((bucket) => buckets.set(bucket, 0))
      buckets.set(Infinity, 0)
      this.histograms.get(name)!.set(labelKey, { buckets, sum: 0, count: 0 })
    }

    const histogram = this.histograms.get(name)!.get(labelKey)!
    histogram.sum += value
    histogram.count += 1

    // Increment bucket counts
    for (const [bucket, count] of histogram.buckets) {
      if (value <= bucket) {
        histogram.buckets.set(bucket, count + 1)
      }
    }
  }

  /**
   * Register metric metadata
   */
  registerMetric(name: string, type: "counter" | "gauge" | "histogram" | "summary", help: string): void {
    this.metricMetadata.set(name, { type, help })
  }

  /**
   * Serialize labels to string key
   */
  private serializeLabels(labels: MetricLabels): string {
    if (Object.keys(labels).length === 0) return ""
    const pairs = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
    return `{${pairs.join(",")}}`
  }

  /**
   * Format metrics in Prometheus exposition format
   */
  getMetrics(): string {
    const lines: string[] = []

    // Counters
    for (const [name, labelMap] of this.counters) {
      const metadata = this.metricMetadata.get(name)
      if (metadata) {
        lines.push(`# HELP ${name} ${metadata.help}`)
        lines.push(`# TYPE ${name} ${metadata.type}`)
      }
      for (const [labelKey, value] of labelMap) {
        lines.push(`${name}${labelKey} ${value}`)
      }
    }

    // Gauges
    for (const [name, labelMap] of this.gauges) {
      const metadata = this.metricMetadata.get(name)
      if (metadata) {
        lines.push(`# HELP ${name} ${metadata.help}`)
        lines.push(`# TYPE ${name} ${metadata.type}`)
      }
      for (const [labelKey, value] of labelMap) {
        lines.push(`${name}${labelKey} ${value}`)
      }
    }

    // Histograms
    for (const [name, labelMap] of this.histograms) {
      const metadata = this.metricMetadata.get(name)
      if (metadata) {
        lines.push(`# HELP ${name} ${metadata.help}`)
        lines.push(`# TYPE ${name} ${metadata.type}`)
      }
      for (const [labelKey, histogram] of labelMap) {
        // Remove outer braces if present for proper label formatting
        const baseLabel = labelKey.replace(/^\{|\}$/g, "")
        const labelPrefix = baseLabel ? `{${baseLabel},` : "{"

        for (const [bucket, count] of histogram.buckets) {
          const le = bucket === Infinity ? "+Inf" : bucket.toString()
          lines.push(`${name}_bucket${labelPrefix}le="${le}"} ${count}`)
        }
        lines.push(`${name}_sum${labelKey} ${histogram.sum}`)
        lines.push(`${name}_count${labelKey} ${histogram.count}`)
      }
    }

    return lines.join("\n") + "\n"
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.counters.clear()
    this.gauges.clear()
    this.histograms.clear()
  }
}

/**
 * Global metrics registry
 */
const globalRegistry = new MetricsRegistry()

// Register standard metrics
globalRegistry.registerMetric("http_requests_total", "counter", "Total number of HTTP requests")
globalRegistry.registerMetric("http_request_duration_ms", "histogram", "HTTP request duration in milliseconds")
globalRegistry.registerMetric("http_responses_total", "counter", "Total number of HTTP responses by status code")
globalRegistry.registerMetric("process_cpu_usage_percent", "gauge", "Process CPU usage percentage")
globalRegistry.registerMetric("process_memory_bytes", "gauge", "Process memory usage in bytes")
globalRegistry.registerMetric("process_heap_bytes", "gauge", "Process heap usage in bytes")
globalRegistry.registerMetric("active_connections", "gauge", "Number of active connections")
globalRegistry.registerMetric(
  "extension_activation_duration_ms",
  "histogram",
  "Extension activation duration in milliseconds",
)
globalRegistry.registerMetric("extension_memory_bytes", "gauge", "Extension memory usage in bytes")
globalRegistry.registerMetric("cache_hits_total", "counter", "Total number of cache hits")
globalRegistry.registerMetric("cache_misses_total", "counter", "Total number of cache misses")
globalRegistry.registerMetric("session_count", "gauge", "Number of active sessions")

export function getMetricsRegistry(): MetricsRegistry {
  return globalRegistry
}

/**
 * Express middleware to collect HTTP metrics
 */
export function metricsMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now()

    // Increment request counter
    globalRegistry.incCounter("http_requests_total", {
      method: req.method,
      path: normalizePathForMetrics(req.path),
    })

    // Hook into response finish event
    res.on("finish", () => {
      const duration = Date.now() - startTime

      // Record duration histogram
      globalRegistry.observeHistogram("http_request_duration_ms", duration, {
        method: req.method,
        path: normalizePathForMetrics(req.path),
        status: res.statusCode.toString(),
      })

      // Record response counter
      globalRegistry.incCounter("http_responses_total", {
        method: req.method,
        status: res.statusCode.toString(),
        statusClass: `${Math.floor(res.statusCode / 100)}xx`,
      })
    })

    next()
  }
}

/**
 * Normalize URL path for metrics (remove IDs, UUIDs, etc.)
 */
function normalizePathForMetrics(path: string): string {
  return (
    path
      // Replace UUIDs
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id")
      // Replace numeric IDs
      .replace(/\/\d+/g, "/:id")
      // Replace hash-like strings
      .replace(/\/[a-f0-9]{32,}/g, "/:hash")
  )
}

/**
 * Collect system metrics
 */
export function collectSystemMetrics(): void {
  const memUsage = process.memoryUsage()

  // CPU usage (requires previous measurement, approximate)
  const cpuUsage = process.cpuUsage()
  const cpuPercent = ((cpuUsage.user + cpuUsage.system) / 1000000 / os.cpus().length) * 100

  globalRegistry.setGauge("process_cpu_usage_percent", cpuPercent)
  globalRegistry.setGauge("process_memory_bytes", memUsage.rss, { type: "rss" })
  globalRegistry.setGauge("process_memory_bytes", memUsage.heapTotal, { type: "heap_total" })
  globalRegistry.setGauge("process_memory_bytes", memUsage.heapUsed, { type: "heap_used" })
  globalRegistry.setGauge("process_memory_bytes", memUsage.external, { type: "external" })
  globalRegistry.setGauge("process_heap_bytes", memUsage.heapUsed)

  // System memory
  const totalMem = os.totalmem()
  const freeMem = os.freemem()
  globalRegistry.setGauge("system_memory_bytes", totalMem, { type: "total" })
  globalRegistry.setGauge("system_memory_bytes", freeMem, { type: "free" })
  globalRegistry.setGauge("system_memory_bytes", totalMem - freeMem, { type: "used" })
}

/**
 * Start periodic system metrics collection
 */
export function startMetricsCollection(intervalMs = 10000): NodeJS.Timeout {
  collectSystemMetrics() // Collect immediately
  return setInterval(() => {
    collectSystemMetrics()
  }, intervalMs)
}

/**
 * Stop metrics collection
 */
export function stopMetricsCollection(interval: NodeJS.Timeout): void {
  clearInterval(interval)
}

/**
 * Express route handler for /metrics endpoint
 */
export function metricsHandler(req: Request, res: Response): void {
  // Collect latest system metrics
  collectSystemMetrics()

  res.setHeader("Content-Type", "text/plain; version=0.0.4")
  res.send(globalRegistry.getMetrics())
}
