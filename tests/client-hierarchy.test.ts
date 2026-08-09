import assert from "node:assert/strict"
import test from "node:test"
import { DIRECT_CLIENT_TASK_SCOPE, keepDirectClientTasks } from "@/lib/client-hierarchy"

test("client hierarchy keeps direct tasks separate from project tasks", () => {
  const tasks = [
    { id: "direct", project_id: null },
    { id: "project-task", project_id: "project-1" },
  ]

  assert.deepEqual(keepDirectClientTasks(tasks), [{ id: "direct", project_id: null }])
  assert.deepEqual(DIRECT_CLIENT_TASK_SCOPE, {
    project_id: null,
    parent_task_id: null,
    archived: false,
  })
})
