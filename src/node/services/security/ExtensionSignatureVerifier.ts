/**
 * Extension Signature Verification (Week 6 Optimization)
 * Prevents malicious extensions through cryptographic signature validation
 */

import crypto from "crypto"
import { promises as fs } from "fs"
import path from "path"

export interface SignatureInfo {
  algorithm: "RSA-SHA256" | "ECDSA-SHA256"
  signature: string
  publicKey: string
  timestamp: number
  extensionId: string
  version: string
}

export interface VerificationResult {
  valid: boolean
  trusted: boolean
  error?: string
  signatureInfo?: SignatureInfo
}

export interface TrustedPublisher {
  id: string
  name: string
  publicKey: string
  addedAt: Date
}

/**
 * Extension Signature Verifier
 * Validates extension signatures against trusted public keys
 */
export class ExtensionSignatureVerifier {
  private trustedPublishers = new Map<string, TrustedPublisher>()

  /**
   * Add a trusted publisher
   */
  addTrustedPublisher(publisher: TrustedPublisher): void {
    this.trustedPublishers.set(publisher.id, publisher)
  }

  /**
   * Remove a trusted publisher
   */
  removeTrustedPublisher(publisherId: string): void {
    this.trustedPublishers.delete(publisherId)
  }

  /**
   * Get all trusted publishers
   */
  getTrustedPublishers(): TrustedPublisher[] {
    return Array.from(this.trustedPublishers.values())
  }

  /**
   * Verify extension signature
   */
  async verifyExtension(extensionPath: string, signaturePath?: string): Promise<VerificationResult> {
    try {
      // Load signature file
      const sigPath = signaturePath || path.join(extensionPath, "signature.json")
      const signatureData = await fs.readFile(sigPath, "utf-8")
      const signatureInfo: SignatureInfo = JSON.parse(signatureData)

      // Check if publisher is trusted
      const isTrusted = this.isPublisherTrusted(signatureInfo.publicKey)

      // Verify signature
      const isValid = await this.verifySignature(extensionPath, signatureInfo)

      return {
        valid: isValid,
        trusted: isTrusted,
        signatureInfo,
      }
    } catch (error: any) {
      return {
        valid: false,
        trusted: false,
        error: error.message || "Signature verification failed",
      }
    }
  }

  /**
   * Verify cryptographic signature
   */
  private async verifySignature(extensionPath: string, signatureInfo: SignatureInfo): Promise<boolean> {
    try {
      // Read extension files (excluding signature.json)
      const files = await this.readExtensionFiles(extensionPath)

      // Create hash of extension content
      const hash = this.hashExtensionContent(files)

      // Verify signature using public key
      const verify = crypto.createVerify(this.getAlgorithm(signatureInfo.algorithm))
      verify.update(hash)
      verify.end()

      return verify.verify(signatureInfo.publicKey, signatureInfo.signature, "base64")
    } catch (error) {
      return false
    }
  }

  /**
   * Read all extension files (excluding signature)
   */
  private async readExtensionFiles(extensionPath: string): Promise<Map<string, Buffer>> {
    const files = new Map<string, Buffer>()

    async function readDir(dir: string, basePath: string): Promise<void> {
      const entries = await fs.readdir(dir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        const relativePath = path.relative(basePath, fullPath)

        // Skip signature file and node_modules
        if (relativePath === "signature.json" || relativePath.startsWith("node_modules")) {
          continue
        }

        if (entry.isDirectory()) {
          await readDir(fullPath, basePath)
        } else {
          const content = await fs.readFile(fullPath)
          files.set(relativePath, content)
        }
      }
    }

    await readDir(extensionPath, extensionPath)
    return files
  }

  /**
   * Create deterministic hash of extension content
   */
  private hashExtensionContent(files: Map<string, Buffer>): string {
    const hash = crypto.createHash("sha256")

    // Sort files by path for deterministic hashing
    const sortedFiles = Array.from(files.entries()).sort(([a], [b]) => a.localeCompare(b))

    for (const [filePath, content] of sortedFiles) {
      // Include file path and content
      hash.update(filePath)
      hash.update("\0") // Separator
      hash.update(content)
      hash.update("\0")
    }

    return hash.digest("hex")
  }

  /**
   * Check if publisher is trusted
   */
  private isPublisherTrusted(publicKey: string): boolean {
    for (const publisher of this.trustedPublishers.values()) {
      if (publisher.publicKey === publicKey) {
        return true
      }
    }
    return false
  }

  /**
   * Get crypto algorithm string
   */
  private getAlgorithm(algorithm: SignatureInfo["algorithm"]): string {
    switch (algorithm) {
      case "RSA-SHA256":
        return "RSA-SHA256"
      case "ECDSA-SHA256":
        return "sha256"
      default:
        throw new Error(`Unsupported algorithm: ${algorithm}`)
    }
  }

  /**
   * Load trusted publishers from file
   */
  async loadTrustedPublishers(filePath: string): Promise<void> {
    try {
      const data = await fs.readFile(filePath, "utf-8")
      const publishers: TrustedPublisher[] = JSON.parse(data)

      for (const publisher of publishers) {
        this.addTrustedPublisher({
          ...publisher,
          addedAt: new Date(publisher.addedAt),
        })
      }
    } catch (error) {
      // File doesn't exist or is invalid, start with empty trust store
    }
  }

  /**
   * Save trusted publishers to file
   */
  async saveTrustedPublishers(filePath: string): Promise<void> {
    const publishers = this.getTrustedPublishers()
    await fs.writeFile(filePath, JSON.stringify(publishers, null, 2))
  }
}

/**
 * Extension Signature Generator
 * For extension publishers to sign their extensions
 */
export class ExtensionSignatureGenerator {
  private privateKey: string
  private publicKey: string

  constructor(privateKey: string, publicKey: string) {
    this.privateKey = privateKey
    this.publicKey = publicKey
  }

  /**
   * Generate key pair for signing
   */
  static async generateKeyPair(algorithm: "rsa" | "ec" = "rsa"): Promise<{ privateKey: string; publicKey: string }> {
    return new Promise((resolve, reject) => {
      if (algorithm === "rsa") {
        crypto.generateKeyPair(
          "rsa",
          {
            modulusLength: 4096,
            publicKeyEncoding: { type: "spki", format: "pem" },
            privateKeyEncoding: { type: "pkcs8", format: "pem" },
          },
          (err, publicKey, privateKey) => {
            if (err) reject(err)
            else resolve({ publicKey, privateKey })
          },
        )
      } else {
        crypto.generateKeyPair(
          "ec",
          {
            namedCurve: "secp256k1",
            publicKeyEncoding: { type: "spki", format: "pem" },
            privateKeyEncoding: { type: "pkcs8", format: "pem" },
          },
          (err, publicKey, privateKey) => {
            if (err) reject(err)
            else resolve({ publicKey, privateKey })
          },
        )
      }
    })
  }

  /**
   * Sign an extension
   */
  async signExtension(
    extensionPath: string,
    extensionId: string,
    version: string,
    algorithm: SignatureInfo["algorithm"] = "RSA-SHA256",
  ): Promise<SignatureInfo> {
    // Read extension files
    const verifier = new ExtensionSignatureVerifier()
    const files = await (verifier as any).readExtensionFiles(extensionPath)

    // Hash extension content
    const hash = (verifier as any).hashExtensionContent(files)

    // Sign hash
    const sign = crypto.createSign(algorithm === "RSA-SHA256" ? "RSA-SHA256" : "sha256")
    sign.update(hash)
    sign.end()

    const signature = sign.sign(this.privateKey, "base64")

    const signatureInfo: SignatureInfo = {
      algorithm,
      signature,
      publicKey: this.publicKey,
      timestamp: Date.now(),
      extensionId,
      version,
    }

    // Save signature file
    const signaturePath = path.join(extensionPath, "signature.json")
    await fs.writeFile(signaturePath, JSON.stringify(signatureInfo, null, 2))

    return signatureInfo
  }
}

/**
 * Global extension signature verifier instance
 */
let globalVerifier: ExtensionSignatureVerifier | null = null

export function getExtensionSignatureVerifier(): ExtensionSignatureVerifier {
  if (!globalVerifier) {
    globalVerifier = new ExtensionSignatureVerifier()
  }
  return globalVerifier
}
