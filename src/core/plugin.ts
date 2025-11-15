/**
 * Plugin System for VSCode Web IDE
 * Provides extensibility and modularity
 */

import { EventEmitter } from "events"
import { Express } from "express"
import { Logger } from "@coder/logger"

export interface PluginMetadata {
  name: string
  version: string
  description?: string
  author?: string
  dependencies?: string[]
}

export interface PluginContext {
  app: Express
  wsRouter: Express
  config: any
  logger: Logger
  events: EventEmitter
  services: Map<string, any>
}

export interface IPlugin {
  metadata: PluginMetadata

  /**
   * Initialize the plugin
   * Called when the plugin is loaded
   */
  init(context: PluginContext): Promise<void>

  /**
   * Destroy the plugin
   * Called when the plugin is unloaded or server is shutting down
   */
  destroy(): Promise<void>

  /**
   * Optional: Health check for the plugin
   */
  healthCheck?(): Promise<boolean>
}

export class PluginManager {
  private plugins: Map<string, IPlugin> = new Map()
  private context: PluginContext
  private logger: Logger

  constructor(context: PluginContext) {
    this.context = context
    this.logger = context.logger
  }

  /**
   * Register a plugin
   */
  async registerPlugin(plugin: IPlugin): Promise<void> {
    const { name, version } = plugin.metadata

    if (this.plugins.has(name)) {
      throw new Error(`Plugin ${name} is already registered`)
    }

    this.logger.info(`Registering plugin: ${name}@${version}`)

    // Check dependencies
    if (plugin.metadata.dependencies) {
      for (const dep of plugin.metadata.dependencies) {
        if (!this.plugins.has(dep)) {
          throw new Error(`Plugin ${name} requires ${dep} which is not installed`)
        }
      }
    }

    try {
      await plugin.init(this.context)
      this.plugins.set(name, plugin)
      this.logger.info(`Successfully registered plugin: ${name}@${version}`)

      // Emit event
      this.context.events.emit("plugin:registered", { name, version })
    } catch (error) {
      this.logger.error(`Failed to register plugin ${name}:`, error)
      throw error
    }
  }

  /**
   * Unregister a plugin
   */
  async unregisterPlugin(name: string): Promise<void> {
    const plugin = this.plugins.get(name)

    if (!plugin) {
      throw new Error(`Plugin ${name} is not registered`)
    }

    this.logger.info(`Unregistering plugin: ${name}`)

    try {
      await plugin.destroy()
      this.plugins.delete(name)
      this.logger.info(`Successfully unregistered plugin: ${name}`)

      // Emit event
      this.context.events.emit("plugin:unregistered", { name })
    } catch (error) {
      this.logger.error(`Failed to unregister plugin ${name}:`, error)
      throw error
    }
  }

  /**
   * Get a registered plugin
   */
  getPlugin(name: string): IPlugin | undefined {
    return this.plugins.get(name)
  }

  /**
   * Get all registered plugins
   */
  getAllPlugins(): IPlugin[] {
    return Array.from(this.plugins.values())
  }

  /**
   * Check health of all plugins
   */
  async healthCheck(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>()

    for (const [name, plugin] of this.plugins) {
      if (plugin.healthCheck) {
        try {
          const healthy = await plugin.healthCheck()
          results.set(name, healthy)
        } catch (error) {
          this.logger.error(`Health check failed for plugin ${name}:`, error)
          results.set(name, false)
        }
      } else {
        results.set(name, true)
      }
    }

    return results
  }

  /**
   * Destroy all plugins
   */
  async destroyAll(): Promise<void> {
    this.logger.info("Destroying all plugins...")

    const pluginNames = Array.from(this.plugins.keys())

    for (const name of pluginNames) {
      await this.unregisterPlugin(name)
    }
  }
}

/**
 * Base plugin class for easier implementation
 */
export abstract class BasePlugin implements IPlugin {
  abstract metadata: PluginMetadata

  abstract init(context: PluginContext): Promise<void>

  async destroy(): Promise<void> {
    // Default implementation - can be overridden
  }

  async healthCheck(): Promise<boolean> {
    // Default implementation - can be overridden
    return true
  }
}
