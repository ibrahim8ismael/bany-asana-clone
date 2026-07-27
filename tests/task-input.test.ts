import assert from "node:assert/strict"
import test from "node:test"
import { parseTaskUpdateInput } from "../src/lib/task-input"

test("parseTaskUpdateInput accepts and normalizes supported fields", () => {
  const result = parseTaskUpdateInput({
    title: "  Ship migration  ",
    status: "in_progress",
    priority: "high",
    due_date: "2026-08-01",
    assignee_id: "user-1",
  })

  assert.equal(result.success, true)
  if (!result.success) return
  assert.deepEqual(result.data, {
    title: "Ship migration",
    status: "in_progress",
    priority: "high",
    due_date: "2026-08-01",
    assignee_id: "user-1",
  })
})

test("parseTaskUpdateInput rejects mass-assignment fields", () => {
  const result = parseTaskUpdateInput({
    title: "Valid title",
    workspace_id: "other-workspace",
    creator_id: "other-user",
  })

  assert.deepEqual(result, {
    success: false,
    error: "Invalid task update fields",
  })
})

test("parseTaskUpdateInput rejects invalid status and dates", () => {
  assert.equal(parseTaskUpdateInput({ status: "deleted" }).success, false)
  assert.equal(parseTaskUpdateInput({ due_date: "not-a-date" }).success, false)
  assert.equal(parseTaskUpdateInput({ title: "   " }).success, false)
})
