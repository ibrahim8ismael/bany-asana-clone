import assert from "node:assert/strict"
import test from "node:test"
import {
  canInspectAllClientTasks,
  clientTaskMembershipWhere,
  clientTaskScopeWhere,
} from "../src/lib/client-task-scope"

test("client task membership includes direct, primary-project, and linked project tasks", () => {
  assert.deepEqual(clientTaskMembershipWhere("client-a"), {
    OR: [
      { client_id: "client-a" },
      { project: { client_id: "client-a" } },
      { task_links: { some: { project: { client_id: "client-a" } } } },
    ],
  })
})

test("client active and archived rows share the same workspace-isolated membership scope", () => {
  const active = clientTaskScopeWhere({
    clientId: "client-a",
    workspaceId: "workspace-a",
    archiveScope: "active",
    topLevelOnly: false,
  })
  const archived = clientTaskScopeWhere({
    clientId: "client-a",
    workspaceId: "workspace-a",
    archiveScope: "archived",
    topLevelOnly: false,
  })

  assert.equal(active.workspace_id, "workspace-a")
  assert.equal(active.archived, false)
  assert.equal(archived.workspace_id, "workspace-a")
  assert.equal(archived.archived, true)
  assert.deepEqual(active.AND, archived.AND)
  assert.equal("assignee" in active, false)
  assert.equal("assignee_id" in active, false)
})

test("workspace Admin and owner can inspect every client task regardless of assignee", () => {
  assert.equal(canInspectAllClientTasks({
    userId: "admin-a",
    workspaceOwnerId: "owner-a",
    workspaceRole: "admin",
  }), true)
  assert.equal(canInspectAllClientTasks({
    userId: "owner-a",
    workspaceOwnerId: "owner-a",
    workspaceRole: "member",
  }), true)
})

test("Super Admin gets the client inspection override while regular members do not", () => {
  assert.equal(canInspectAllClientTasks({
    userId: "super-a",
    workspaceOwnerId: "owner-a",
    workspaceRole: null,
    isSuperAdmin: true,
  }), true)
  assert.equal(canInspectAllClientTasks({
    userId: "member-a",
    workspaceOwnerId: "owner-a",
    workspaceRole: "member",
  }), false)
})

test("client task scope does not require an assignee so unresolved imports remain visible", () => {
  const where = clientTaskScopeWhere({ clientId: "client-a", workspaceId: "workspace-a" })
  assert.equal("assignee" in where, false)
  assert.equal("assignee_id" in where, false)
})
