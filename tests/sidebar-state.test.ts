import assert from "node:assert/strict"
import test from "node:test"
import { sidebarProjectWhere } from "@/lib/sidebar-data"
import {
  normalizeCollapsedClientIds,
  resolveInitialCollapsedClientIds,
  toggleCollapsedClientId,
} from "@/lib/sidebar-state"

test("new sidebar clients default to expanded after stored state is loaded", () => {
  const initialCollapsed = resolveInitialCollapsedClientIds({
    clientIds: ["client-a", "client-b"],
    collapsedStorageValue: null,
    legacyExpandedStorageValue: JSON.stringify(["client-a"]),
  })
  assert.deepEqual([...initialCollapsed], ["client-b"])

  const afterCreatingClient = normalizeCollapsedClientIds(initialCollapsed, ["client-a", "client-b", "client-c"])
  assert.equal(afterCreatingClient.has("client-b"), true)
  assert.equal(afterCreatingClient.has("client-c"), false, "a new client must not be collapsed implicitly")
})

test("collapsed sidebar state is explicit, versioned, and ignores removed clients", () => {
  const collapsed = resolveInitialCollapsedClientIds({
    clientIds: ["client-a", "client-c"],
    collapsedStorageValue: JSON.stringify(["client-b", "client-c"]),
    legacyExpandedStorageValue: null,
  })
  assert.deepEqual([...collapsed], ["client-c"])
  assert.equal(toggleCollapsedClientId(collapsed, "client-c").has("client-c"), false)
  assert.equal(toggleCollapsedClientId(collapsed, "client-a").has("client-a"), true)
})

test("sidebar project query keeps completed accessible projects visible", () => {
  const where = sidebarProjectWhere("user-1", false)
  assert.equal(where.archived, false)
  assert.equal("status" in where, false, "completion is not an access or navigation visibility rule")
  assert.deepEqual(where.OR, [
    { owner_id: "user-1" },
    { members: { some: { user_id: "user-1", role: { in: ["admin", "member"] } } } },
  ])
})
