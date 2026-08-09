import crypto from "node:crypto"

export function deterministicMigrationId(type: string, sourceKey: string): string {
  const digest = crypto
    .createHash("sha256")
    .update(`one-time-migration:${type}:${sourceKey}`)
    .digest("hex")
    .slice(0, 24)

  return `mig_${type}_${digest}`
}

export function getJsonlImportActorIdentity(workspaceId: string) {
  const id = deterministicMigrationId("jsonl-import-actor", workspaceId)

  return {
    id,
    fullName: "Asana JSONL Import",
    email: `${id}@import.invalid`,
  }
}
