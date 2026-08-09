import test from "node:test"
import assert from "node:assert/strict"
import { tasksToCsv } from "@/lib/task-export"

test("tasksToCsv generates correct CSV content", () => {
  const tasks = [
    {
      id: "task-1",
      title: "Fix login bug",
      status: "todo",
      priority: "high",
      due_date: new Date("2023-12-01T00:00:00Z"),
      description_rich_text: "Users cannot login",
      assignee_id: "user-1",
      creator_id: "user-2",
      parent_task_id: null,
      reviewer_id: null,
      project_id: "proj-1",
      client_id: null,
      section_id: "sec-1",
      workspace_id: "ws-1",
      created_at: new Date("2023-11-20T00:00:00Z"),
      updated_at: new Date("2023-11-21T00:00:00Z"),
      quality_required: false,
      quality_state: "none",
      quality_score: null,
      first_quality_grade: null,
      final_quality_grade: null,
      rework_count: 0,
      quality_blocker_count: 0,
      assignee: { id: "user-1", full_name: "Alice", email: "alice@example.com" },
      project: { id: "proj-1", name: "App v2" },
      section: { id: "sec-1", name: "Backlog" },
      tags: []
    }
  ] as any[]

  const csv = tasksToCsv(tasks)

  // Validate header
  const lines = csv.trim().split("\n")
  assert.equal(lines.length, 2)
  assert.ok(lines[0].includes("title,description,status,priority"))

  // Validate content
  const row = lines[1]
  assert.ok(row.includes("Fix login bug"))
  assert.ok(row.includes("todo"))
  assert.ok(row.includes("high"))
  assert.ok(row.includes("Alice"))
  assert.ok(row.includes("App v2"))
  assert.ok(row.includes("Backlog"))
})
