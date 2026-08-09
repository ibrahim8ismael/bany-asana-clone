import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

const ENCRYPTION_VERSION = "v1"

function deriveKey(keyMaterial?: string) {
  const secret = keyMaterial || process.env.ASANA_TOKEN_ENCRYPTION_KEY
  if (!secret || secret.length < 32) {
    throw new Error("ASANA_TOKEN_ENCRYPTION_KEY must contain at least 32 characters")
  }

  return createHash("sha256").update(`taskflow:asana-token:${secret}`).digest()
}

export function encryptSecret(value: string, keyMaterial?: string) {
  if (!value) throw new Error("Cannot encrypt an empty secret")

  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", deriveKey(keyMaterial), iv)
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()

  return [
    ENCRYPTION_VERSION,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":")
}

export function decryptSecret(payload: string, keyMaterial?: string) {
  const [version, ivValue, authTagValue, encryptedValue] = payload.split(":")
  if (version !== ENCRYPTION_VERSION || !ivValue || !authTagValue || !encryptedValue) {
    throw new Error("Invalid encrypted secret")
  }

  try {
    const decipher = createDecipheriv("aes-256-gcm", deriveKey(keyMaterial), Buffer.from(ivValue, "base64url"))
    decipher.setAuthTag(Buffer.from(authTagValue, "base64url"))
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final(),
    ]).toString("utf8")
  } catch {
    throw new Error("Unable to decrypt secret")
  }
}
