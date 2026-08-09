import test from "node:test"
import assert from "node:assert/strict"
import { syncTaskInList, syncTaskInSections } from "@/lib/task-sync"

test("syncTaskInList removes tasks that are no longer visible", () => {
  const tasks = [
    { id: "1", title: "Task", assignee_id: "user-a", project_id: null },
  ]

  const next = syncTaskInList(tasks, { id: "1", title: "Task", assignee_id: "user-b", project_id: null }, { assigneeId: "user-a" })
  assert.equal(next.length, 0)
})

test("syncTaskInSections moves a task into its new section", () => {
  const sections = [
    { id: "todo", tasks: [{ id: "1", title: "Task", section_id: "todo", assignee_id: "user-a", project_id: "proj" }] },
    { id: "done", tasks: [] },
  ]

  const next = syncTaskInSections(
    sections,
    { id: "1", title: "Task", section_id: "done", assignee_id: "user-a", project_id: "proj" },
    { assigneeId: "user-a" }
  )

  assert.equal(next[0].tasks.length, 0)
  assert.equal(next[1].tasks.length, 1)
  assert.equal(next[1].tasks[0].id, "1")
})
