/**
 * User Isolation Manager
 * Handles user environment setup and resource isolation
 */

import * as path from "path"
import * as fs from "fs/promises"
import { ResourceLimits, ResourceType, ResourceUsage, QuotaStatus, UserEnvironment } from "../types"

export interface IsolationStrategy {
  // User environment setup
  initializeUserEnvironment(userId: string): Promise<UserEnvironment>
  destroyUserEnvironment(userId: string): Promise<void>

  // Resource access
  getUserDataPath(userId: string): string
  getUserSettingsPath(userId: string): string
  getUserExtensionsPath(userId: string): string
  getUserWorkspacesPath(userId: string): string
  getUserLogsPath(userId: string): string

  // Resource management
  enforceStorageQuota(userId: string): Promise<void>
  getResourceUsage(userId: string): Promise<ResourceUsage>
  checkQuota(userId: string, resource: ResourceType): Promise<QuotaStatus>

  // Cleanup
  cleanupIdleResources(idleThresholdMinutes: number): Promise<number>
}

// ============================================================================
// Directory-Based Isolation Strategy
// ============================================================================

export interface DirectoryIsolationConfig {
  basePath: string
  defaultLimits: ResourceLimits
}

export class DirectoryIsolationStrategy implements IsolationStrategy {
  constructor(private config: DirectoryIsolationConfig) {}

  async initializeUserEnvironment(userId: string): Promise<UserEnvironment> {
    const basePath = this.getUserBasePath(userId)
    const paths = {
      data: this.getUserDataPath(userId),
      settings: this.getUserSettingsPath(userId),
      extensions: this.getUserExtensionsPath(userId),
      workspaces: this.getUserWorkspacesPath(userId),
      logs: this.getUserLogsPath(userId),
    }

    // Create directories
    for (const dirPath of Object.values(paths)) {
      await fs.mkdir(dirPath, { recursive: true, mode: 0o700 })
    }

    // Create default settings file
    const defaultSettings = {
      "workbench.colorTheme": "Default Dark+",
      "editor.fontSize": 14,
      "editor.tabSize": 2,
    }

    const settingsFile = path.join(paths.settings, "settings.json")
    try {
      await fs.access(settingsFile)
    } catch {
      // File doesn't exist, create it
      await fs.writeFile(settingsFile, JSON.stringify(defaultSettings, null, 2))
    }

    // Create user info file
    const userInfoFile = path.join(basePath, "user-info.json")
    await fs.writeFile(
      userInfoFile,
      JSON.stringify(
        {
          userId,
          createdAt: new Date().toISOString(),
          version: "1.0",
        },
        null,
        2,
      ),
    )

    const environment: UserEnvironment = {
      userId,
      basePath,
      paths,
      limits: this.config.defaultLimits,
      createdAt: new Date(),
    }

    return environment
  }

  async destroyUserEnvironment(userId: string): Promise<void> {
    const basePath = this.getUserBasePath(userId)

    try {
      await fs.rm(basePath, { recursive: true, force: true })
    } catch (err) {
      console.error(`Failed to destroy user environment for ${userId}:`, err)
      throw err
    }
  }

  getUserDataPath(userId: string): string {
    return path.join(this.getUserBasePath(userId), "data")
  }

  getUserSettingsPath(userId: string): string {
    return path.join(this.getUserBasePath(userId), "settings")
  }

  getUserExtensionsPath(userId: string): string {
    return path.join(this.getUserBasePath(userId), "extensions")
  }

  getUserWorkspacesPath(userId: string): string {
    return path.join(this.getUserBasePath(userId), "workspaces")
  }

  getUserLogsPath(userId: string): string {
    return path.join(this.getUserBasePath(userId), "logs")
  }

  async enforceStorageQuota(userId: string): Promise<void> {
    const usage = await this.getResourceUsage(userId)

    if (usage.storage.used > usage.storage.limit) {
      throw new Error(
        `Storage quota exceeded for user ${userId}. Used: ${this.formatBytes(usage.storage.used)}, Limit: ${this.formatBytes(usage.storage.limit)}`,
      )
    }
  }

  async getResourceUsage(userId: string): Promise<ResourceUsage> {
    const basePath = this.getUserBasePath(userId)
    const storageUsed = await this.getDirectorySize(basePath)

    return {
      userId,
      timestamp: new Date(),
      storage: {
        used: storageUsed,
        limit: this.config.defaultLimits.maxStorageMB * 1024 * 1024,
      },
      sessions: {
        active: 0, // Will be populated by session store
        limit: this.config.defaultLimits.maxSessions,
      },
      connections: {
        current: 0, // Will be populated by connection manager
        limit: this.config.defaultLimits.maxConcurrentConnections,
      },
    }
  }

  async checkQuota(userId: string, resource: ResourceType): Promise<QuotaStatus> {
    const usage = await this.getResourceUsage(userId)

    let current: number
    let limit: number

    switch (resource) {
      case ResourceType.Storage:
        current = usage.storage.used
        limit = usage.storage.limit
        break
      case ResourceType.Sessions:
        current = usage.sessions.active
        limit = usage.sessions.limit
        break
      case ResourceType.Connections:
        current = usage.connections.current
        limit = usage.connections.limit
        break
      default:
        throw new Error(`Unsupported resource type: ${resource}`)
    }

    return {
      resource,
      current,
      limit,
      available: Math.max(0, limit - current),
      exceeded: current >= limit,
    }
  }

  async cleanupIdleResources(idleThresholdMinutes: number): Promise<number> {
    // Clean up temporary files, old logs, etc.
    let cleaned = 0
    const usersPath = this.config.basePath

    try {
      const userDirs = await fs.readdir(usersPath)

      for (const userDir of userDirs) {
        const userPath = path.join(usersPath, userDir)
        const logsPath = path.join(userPath, "logs")

        try {
          // Clean old log files
          const logFiles = await fs.readdir(logsPath)
          const now = Date.now()
          const thresholdMs = idleThresholdMinutes * 60 * 1000

          for (const logFile of logFiles) {
            const logPath = path.join(logsPath, logFile)
            const stats = await fs.stat(logPath)

            if (now - stats.mtime.getTime() > thresholdMs) {
              await fs.unlink(logPath)
              cleaned++
            }
          }
        } catch {
          // Logs directory might not exist
        }
      }
    } catch {
      // Users directory might not exist
    }

    return cleaned
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private getUserBasePath(userId: string): string {
    // Sanitize userId to prevent path traversal
    const sanitized = userId.replace(/[^a-zA-Z0-9\-_]/g, "")
    return path.join(this.config.basePath, sanitized)
  }

  private async getDirectorySize(dirPath: string): Promise<number> {
    let totalSize = 0

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name)

        if (entry.isDirectory()) {
          totalSize += await this.getDirectorySize(fullPath)
        } else if (entry.isFile()) {
          const stats = await fs.stat(fullPath)
          totalSize += stats.size
        }
      }
    } catch {
      // Directory might not exist
    }

    return totalSize
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return "0 Bytes"

    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`
  }
}

// ============================================================================
// Container-Based Isolation Strategy (Placeholder for Phase 2)
// ============================================================================

export interface ContainerIsolationConfig {
  runtime: "docker" | "podman"
  image: string
  network: string
  defaultLimits: ResourceLimits
}

export class ContainerIsolationStrategy implements IsolationStrategy {
  constructor(private config: ContainerIsolationConfig) {
    throw new Error("ContainerIsolationStrategy not yet implemented. Use DirectoryIsolationStrategy for Phase 1.")
  }

  async initializeUserEnvironment(userId: string): Promise<UserEnvironment> {
    throw new Error("Not implemented")
  }

  async destroyUserEnvironment(userId: string): Promise<void> {
    throw new Error("Not implemented")
  }

  getUserDataPath(userId: string): string {
    throw new Error("Not implemented")
  }

  getUserSettingsPath(userId: string): string {
    throw new Error("Not implemented")
  }

  getUserExtensionsPath(userId: string): string {
    throw new Error("Not implemented")
  }

  getUserWorkspacesPath(userId: string): string {
    throw new Error("Not implemented")
  }

  getUserLogsPath(userId: string): string {
    throw new Error("Not implemented")
  }

  async enforceStorageQuota(userId: string): Promise<void> {
    throw new Error("Not implemented")
  }

  async getResourceUsage(userId: string): Promise<ResourceUsage> {
    throw new Error("Not implemented")
  }

  async checkQuota(userId: string, resource: ResourceType): Promise<QuotaStatus> {
    throw new Error("Not implemented")
  }

  async cleanupIdleResources(idleThresholdMinutes: number): Promise<number> {
    throw new Error("Not implemented")
  }
}
