export const SIDEBAR_COLLAPSED_CLIENTS_STORAGE_KEY = "sidebar-collapsed-clients-v2"
export const LEGACY_SIDEBAR_EXPANDED_CLIENTS_STORAGE_KEY = "sidebar-expanded-clients-v1"

function parseStoredIds(rawValue: string | null): string[] | null {
  if (rawValue === null) return null

  try {
    const parsedValue = JSON.parse(rawValue)
    return Array.isArray(parsedValue)
      ? parsedValue.filter((value): value is string => typeof value === "string")
      : null
  } catch {
    return null
  }
}

export function normalizeCollapsedClientIds(
  collapsedClientIds: Iterable<string>,
  clientIds: readonly string[]
) {
  const validClientIds = new Set(clientIds)
  return new Set([...collapsedClientIds].filter((clientId) => validClientIds.has(clientId)))
}

export function resolveInitialCollapsedClientIds({
  clientIds,
  collapsedStorageValue,
  legacyExpandedStorageValue,
}: {
  clientIds: readonly string[]
  collapsedStorageValue: string | null
  legacyExpandedStorageValue: string | null
}) {
  const storedCollapsedIds = parseStoredIds(collapsedStorageValue)
  if (storedCollapsedIds) return normalizeCollapsedClientIds(storedCollapsedIds, clientIds)

  const legacyExpandedIds = parseStoredIds(legacyExpandedStorageValue)
  if (!legacyExpandedIds) return new Set<string>()

  const expandedIds = new Set(legacyExpandedIds)
  return new Set(clientIds.filter((clientId) => !expandedIds.has(clientId)))
}

export function toggleCollapsedClientId(collapsedClientIds: ReadonlySet<string>, clientId: string) {
  const next = new Set(collapsedClientIds)
  if (next.has(clientId)) next.delete(clientId)
  else next.add(clientId)
  return next
}
