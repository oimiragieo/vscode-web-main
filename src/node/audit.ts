/**
 * Audit Logger Initialization
 * Provides application-wide audit logging for security and compliance
 */

import { logger } from "@coder/logger"
import * as path from "path"
import { v4 as uuidv4 } from "uuid"
import { FileAuditLogger, AuditLogger } from "./services/audit/AuditLogger"
import { AuditEvent, AuditEventType } from "./services/types"
import { paths } from "./util"

let auditLogger: AuditLogger | null = null

/**
 * Initialize the audit logger
 * Creates a file-based audit logger with daily rotation
 */
export function initializeAuditLogger(): AuditLogger {
  if (auditLogger) {
    return auditLogger
  }

  const logDir = path.join(paths.data, "audit-logs")

  auditLogger = new FileAuditLogger({
    logDir,
    rotateDaily: true,
    maxFileSizeMB: 100,
  })

  logger.info(`✅ Audit logging activated - Logs stored in ${logDir}`)

  return auditLogger
}

/**
 * Get the global audit logger instance
 */
export function getAuditLogger(): AuditLogger | null {
  return auditLogger
}

/**
 * Helper function to create an audit event
 */
export function createAuditEvent(
  eventType: AuditEventType,
  req: any,
  status: "success" | "failure" | "error",
  metadata?: Record<string, any>,
  error?: string,
): AuditEvent {
  return {
    id: uuidv4(),
    timestamp: new Date(),
    eventType,
    ipAddress: (req.headers["x-forwarded-for"] as string) || req.connection?.remoteAddress || "unknown",
    userAgent: (req.headers["user-agent"] as string) || "unknown",
    status,
    metadata: metadata || {},
    error,
  }
}

/**
 * Log an audit event
 */
export async function logAuditEvent(event: AuditEvent): Promise<void> {
  if (!auditLogger) {
    logger.warn("Audit logger not initialized, event not logged:", event.eventType)
    return
  }

  try {
    await auditLogger.log(event)
  } catch (error) {
    logger.error("Failed to log audit event:", error)
  }
}
