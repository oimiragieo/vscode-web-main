/**
 * Multi-User Configuration Loader
 * Loads and validates multi-user deployment configuration
 */

import * as fs from "fs/promises"
import * as path from "path"
import * as yaml from "js-yaml"
import { DeploymentMode, MultiUserConfig, AuthProvider, SessionStoreType, IsolationStrategy, UserRole } from "../types"

export interface CodeServerArgs {
  // Existing args
  auth: string
  password?: string
  "hashed-password"?: string
  "user-data-dir": string
  "extensions-dir": string
  host: string
  port: number
  socket?: string
  cert?: string
  "cert-key"?: string

  // New multi-user args
  "deployment-mode"?: DeploymentMode
  "multi-user-config"?: string
}

export class MultiUserConfigLoader {
  private static readonly DEFAULT_CONFIG: MultiUserConfig = {
    auth: {
      provider: AuthProvider.Database,
      database: {
        type: "sqlite",
        path: "/var/lib/code-server/users.db",
      },
      session: {
        store: SessionStoreType.Memory,
        ttl: 86400, // 24 hours
      },
    },
    isolation: {
      strategy: IsolationStrategy.Directory,
      basePath: "/var/lib/code-server/users",
    },
    limits: {
      maxSessionsPerUser: 5,
      maxConcurrentConnections: 100,
      storageQuotaMB: 5000,
      memoryLimitMB: 2048,
      cpuLimitPercent: 50,
      maxExtensions: 100,
      maxWorkspaces: 10,
    },
    features: {
      auditLogging: true,
      usageAnalytics: false,
      adminDashboard: true,
    },
  }

  static async load(args: CodeServerArgs): Promise<MultiUserConfig | null> {
    // Check if multi-user mode is enabled
    const deploymentMode = this.getDeploymentMode(args)

    if (deploymentMode === DeploymentMode.Single) {
      return null // Single-user mode, no multi-user config needed
    }

    // Load configuration from file if specified
    let config: MultiUserConfig

    if (args["multi-user-config"]) {
      config = await this.loadFromFile(args["multi-user-config"])
    } else {
      // Use default configuration
      config = { ...this.DEFAULT_CONFIG }
    }

    // Override with environment variables
    config = this.applyEnvironmentOverrides(config)

    // Validate configuration
    this.validate(config)

    return config
  }

  private static getDeploymentMode(args: CodeServerArgs): DeploymentMode {
    // Check CLI argument
    if (args["deployment-mode"]) {
      return args["deployment-mode"]
    }

    // Check environment variable
    const envMode = process.env.CODE_SERVER_DEPLOYMENT_MODE
    if (envMode) {
      return envMode.toLowerCase() === "multi" ? DeploymentMode.Multi : DeploymentMode.Single
    }

    // Default to single-user mode for backward compatibility
    return DeploymentMode.Single
  }

  private static async loadFromFile(configPath: string): Promise<MultiUserConfig> {
    try {
      const content = await fs.readFile(configPath, "utf-8")
      const ext = path.extname(configPath).toLowerCase()

      let data: any

      if (ext === ".yaml" || ext === ".yml") {
        data = yaml.load(content)
      } else if (ext === ".json") {
        data = JSON.parse(content)
      } else {
        throw new Error(`Unsupported config file format: ${ext}. Use .yaml, .yml, or .json`)
      }

      // Merge with defaults
      return this.mergeWithDefaults(data)
    } catch (err) {
      throw new Error(`Failed to load multi-user config from ${configPath}: ${err}`)
    }
  }

  private static mergeWithDefaults(data: any): MultiUserConfig {
    return {
      auth: {
        ...this.DEFAULT_CONFIG.auth,
        ...data.auth,
        session: {
          ...this.DEFAULT_CONFIG.auth.session,
          ...data.auth?.session,
        },
      },
      isolation: {
        ...this.DEFAULT_CONFIG.isolation,
        ...data.isolation,
      },
      limits: {
        ...this.DEFAULT_CONFIG.limits,
        ...data.limits,
      },
      features: {
        ...this.DEFAULT_CONFIG.features,
        ...data.features,
      },
      scaling: data.scaling,
    }
  }

  private static applyEnvironmentOverrides(config: MultiUserConfig): MultiUserConfig {
    // Auth provider
    if (process.env.CODE_SERVER_AUTH_PROVIDER) {
      config.auth.provider = process.env.CODE_SERVER_AUTH_PROVIDER as AuthProvider
    }

    // Database configuration
    if (process.env.CODE_SERVER_DB_TYPE) {
      config.auth.database = config.auth.database || {}
      config.auth.database.type = process.env.CODE_SERVER_DB_TYPE as any
    }

    if (process.env.CODE_SERVER_DB_HOST) {
      config.auth.database = config.auth.database || {}
      config.auth.database.host = process.env.CODE_SERVER_DB_HOST
    }

    if (process.env.CODE_SERVER_DB_PORT) {
      config.auth.database = config.auth.database || {}
      config.auth.database.port = parseInt(process.env.CODE_SERVER_DB_PORT, 10)
    }

    if (process.env.CODE_SERVER_DB_NAME) {
      config.auth.database = config.auth.database || {}
      config.auth.database.database = process.env.CODE_SERVER_DB_NAME
    }

    if (process.env.CODE_SERVER_DB_USER) {
      config.auth.database = config.auth.database || {}
      config.auth.database.username = process.env.CODE_SERVER_DB_USER
    }

    if (process.env.CODE_SERVER_DB_PASSWORD) {
      config.auth.database = config.auth.database || {}
      config.auth.database.password = process.env.CODE_SERVER_DB_PASSWORD
    }

    if (process.env.CODE_SERVER_DB_PATH) {
      config.auth.database = config.auth.database || {}
      config.auth.database.path = process.env.CODE_SERVER_DB_PATH
    }

    // Session store
    if (process.env.CODE_SERVER_SESSION_STORE) {
      config.auth.session.store = process.env.CODE_SERVER_SESSION_STORE as SessionStoreType
    }

    if (process.env.CODE_SERVER_SESSION_TTL) {
      config.auth.session.ttl = parseInt(process.env.CODE_SERVER_SESSION_TTL, 10)
    }

    // Redis configuration
    if (process.env.CODE_SERVER_REDIS_HOST) {
      config.auth.session.redis = config.auth.session.redis || { host: "", port: 6379 }
      config.auth.session.redis.host = process.env.CODE_SERVER_REDIS_HOST
    }

    if (process.env.CODE_SERVER_REDIS_PORT) {
      config.auth.session.redis = config.auth.session.redis || { host: "localhost", port: 6379 }
      config.auth.session.redis.port = parseInt(process.env.CODE_SERVER_REDIS_PORT, 10)
    }

    if (process.env.CODE_SERVER_REDIS_PASSWORD) {
      config.auth.session.redis = config.auth.session.redis || { host: "localhost", port: 6379 }
      config.auth.session.redis.password = process.env.CODE_SERVER_REDIS_PASSWORD
    }

    // Isolation strategy
    if (process.env.CODE_SERVER_ISOLATION_STRATEGY) {
      config.isolation.strategy = process.env.CODE_SERVER_ISOLATION_STRATEGY as IsolationStrategy
    }

    if (process.env.CODE_SERVER_ISOLATION_BASE_PATH) {
      config.isolation.basePath = process.env.CODE_SERVER_ISOLATION_BASE_PATH
    }

    // Resource limits
    if (process.env.CODE_SERVER_MAX_SESSIONS_PER_USER) {
      config.limits.maxSessionsPerUser = parseInt(process.env.CODE_SERVER_MAX_SESSIONS_PER_USER, 10)
    }

    if (process.env.CODE_SERVER_STORAGE_QUOTA_MB) {
      config.limits.storageQuotaMB = parseInt(process.env.CODE_SERVER_STORAGE_QUOTA_MB, 10)
    }

    return config
  }

  private static validate(config: MultiUserConfig): void {
    // Validate auth provider
    if (!Object.values(AuthProvider).includes(config.auth.provider)) {
      throw new Error(`Invalid auth provider: ${config.auth.provider}`)
    }

    // Validate database config for database auth provider
    if (config.auth.provider === AuthProvider.Database) {
      if (!config.auth.database) {
        throw new Error("Database configuration required for database auth provider")
      }

      if (!config.auth.database.type) {
        throw new Error("Database type is required")
      }

      if (config.auth.database.type === "sqlite" && !config.auth.database.path) {
        throw new Error("Database path is required for SQLite")
      }

      if (config.auth.database.type !== "sqlite") {
        if (!config.auth.database.host) {
          throw new Error("Database host is required")
        }
        if (!config.auth.database.database) {
          throw new Error("Database name is required")
        }
      }
    }

    // Validate session store
    if (!Object.values(SessionStoreType).includes(config.auth.session.store)) {
      throw new Error(`Invalid session store type: ${config.auth.session.store}`)
    }

    if (config.auth.session.store === SessionStoreType.Redis && !config.auth.session.redis) {
      throw new Error("Redis configuration required for Redis session store")
    }

    // Validate isolation strategy
    if (!Object.values(IsolationStrategy).includes(config.isolation.strategy)) {
      throw new Error(`Invalid isolation strategy: ${config.isolation.strategy}`)
    }

    if (!config.isolation.basePath) {
      throw new Error("Isolation base path is required")
    }

    // Validate resource limits
    if (config.limits.maxSessionsPerUser < 1) {
      throw new Error("maxSessionsPerUser must be at least 1")
    }

    if (config.limits.maxConcurrentConnections < 1) {
      throw new Error("maxConcurrentConnections must be at least 1")
    }

    if (config.limits.storageQuotaMB < 100) {
      throw new Error("storageQuotaMB must be at least 100 MB")
    }
  }

  /**
   * Create initial admin user
   */
  static async createInitialAdmin(
    authService: any,
    config: { username: string; email: string; password: string },
  ): Promise<void> {
    try {
      const existingAdmin = await authService.getUserByUsername(config.username)
      if (existingAdmin) {
        console.log(`Admin user "${config.username}" already exists`)
        return
      }

      await authService.createUser({
        username: config.username,
        email: config.email,
        password: config.password,
        roles: [UserRole.Admin],
      })

      console.log(`Created initial admin user: ${config.username}`)
    } catch (err) {
      console.error("Failed to create initial admin user:", err)
      throw err
    }
  }
}
