import assert from "node:assert/strict"
import test from "node:test"
import { buildProjectCreateData, DEFAULT_PROJECT_SECTIONS } from "@/lib/project-creation"

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
  assert.deepEqual(DEFAULT_PROJECT_SECTIONS, [
    { name: "Backlog", position: 1000 },
    { name: "To Do", position: 2000 },
    { name: "In Progress", position: 3000 },
    { name: "In Review", position: 4000 },
    { name: "Needs Rework", position: 5000 },
    { name: "Done", position: 6000 },
  ])
})
