/**
 * Centralized Configuration Management
 * Provides validation and type-safe config access
 */

import { logger } from "@coder/logger"
import { promises as fs } from "fs"
import * as yaml from "js-yaml"
import * as path from "path"

export interface ConfigSchema {
  [key: string]: {
    type: "string" | "number" | "boolean" | "object" | "array"
    required?: boolean
    default?: any
    validate?: (value: any) => boolean
    description?: string
  }
}

export class ConfigManager<T extends Record<string, any>> {
  private config: Partial<T> = {}
  private schema: ConfigSchema
  private configPath?: string

  constructor(schema: ConfigSchema, configPath?: string) {
    this.schema = schema
    this.configPath = configPath
  }

  /**
   * Load configuration from file
   */
  async load(): Promise<void> {
    if (!this.configPath) {
      logger.debug("No config path provided, using defaults")
      this.applyDefaults()
      return
    }

    try {
      const ext = path.extname(this.configPath)
      const content = await fs.readFile(this.configPath, "utf-8")

      let parsed: any
      if (ext === ".json") {
        parsed = JSON.parse(content)
      } else if (ext === ".yaml" || ext === ".yml") {
        parsed = yaml.load(content)
      } else {
        throw new Error(`Unsupported config file format: ${ext}`)
      }

      this.config = parsed
      this.applyDefaults()
      this.validate()

      logger.info(`Configuration loaded from ${this.configPath}`)
    } catch (error: any) {
      if (error.code === "ENOENT") {
        logger.warn(`Config file not found: ${this.configPath}, using defaults`)
        this.applyDefaults()
      } else {
        throw error
      }
    }
  }

  /**
   * Save configuration to file
   */
  async save(): Promise<void> {
    if (!this.configPath) {
      throw new Error("No config path provided")
    }

    const ext = path.extname(this.configPath)
    let content: string

    if (ext === ".json") {
      content = JSON.stringify(this.config, null, 2)
    } else if (ext === ".yaml" || ext === ".yml") {
      content = yaml.dump(this.config)
    } else {
      throw new Error(`Unsupported config file format: ${ext}`)
    }

    await fs.writeFile(this.configPath, content, "utf-8")
    logger.info(`Configuration saved to ${this.configPath}`)
  }

  /**
   * Get a configuration value
   */
  get<K extends keyof T>(key: K): T[K] {
    return this.config[key] as T[K]
  }

  /**
   * Set a configuration value
   */
  set<K extends keyof T>(key: K, value: T[K]): void {
    const schemaEntry = this.schema[key as string]

    if (!schemaEntry) {
      logger.warn(`Setting unknown config key: ${String(key)}`)
    } else {
      // Validate type
      const actualType = Array.isArray(value) ? "array" : typeof value
      if (actualType !== schemaEntry.type) {
        throw new Error(`Invalid type for ${String(key)}: expected ${schemaEntry.type}, got ${actualType}`)
      }

      // Custom validation
      if (schemaEntry.validate && !schemaEntry.validate(value)) {
        throw new Error(`Validation failed for ${String(key)}`)
      }
    }

    this.config[key] = value
  }

  /**
   * Get all configuration
   */
  getAll(): Partial<T> {
    return { ...this.config }
  }

  /**
   * Apply default values
   */
  private applyDefaults(): void {
    for (const [key, schema] of Object.entries(this.schema)) {
      if (this.config[key] === undefined && schema.default !== undefined) {
        this.config[key] = schema.default
      }
    }
  }

  /**
   * Validate configuration
   */
  private validate(): void {
    const errors: string[] = []

    for (const [key, schema] of Object.entries(this.schema)) {
      const value = this.config[key]

      // Check required fields
      if (schema.required && value === undefined) {
        errors.push(`Required field missing: ${key}`)
        continue
      }

      // Skip validation if optional and not provided
      if (!schema.required && value === undefined) {
        continue
      }

      // Validate type
      const actualType = Array.isArray(value) ? "array" : typeof value
      if (actualType !== schema.type) {
        errors.push(`Invalid type for ${key}: expected ${schema.type}, got ${actualType}`)
      }

      // Custom validation
      if (schema.validate && !schema.validate(value)) {
        errors.push(`Validation failed for ${key}`)
      }
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join("\n")}`)
    }
  }

  /**
   * Merge with another configuration
   */
  merge(other: Partial<T>): void {
    this.config = { ...this.config, ...other }
    this.validate()
  }

  /**
   * Reset to defaults
   */
  reset(): void {
    this.config = {}
    this.applyDefaults()
  }
}

/**
 * Create a type-safe config manager
 */
export function createConfigManager<T extends Record<string, any>>(
  schema: ConfigSchema,
  configPath?: string,
): ConfigManager<T> {
  return new ConfigManager<T>(schema, configPath)
}
