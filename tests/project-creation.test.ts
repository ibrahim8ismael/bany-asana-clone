import assert from "node:assert/strict"
import test from "node:test"
import { buildProjectCreateData, DEFAULT_PROJECT_SECTION } from "@/lib/project-creation"

test("ordinary project creation builds a Project linked to the selected client and no Task", () => {
  const data = buildProjectCreateData({
    name: "  Website Launch  ",
    deadline: null,
    defaultView: "board",
    workspaceId: "workspace-1",
    clientId: "client-1",
    ownerId: "user-1",
  })

  assert.equal(data.name, "Website Launch")
  assert.equal(data.workspace_id, "workspace-1")
  assert.equal(data.client_id, "client-1")
  assert.equal(data.status, "incomplete")
  assert.equal("task" in data, false)
  assert.equal("tasks" in data, false)
  assert.deepEqual(DEFAULT_PROJECT_SECTION, { name: "General", position: 1000 })
})
