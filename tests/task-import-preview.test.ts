import test from "node:test"
import assert from "node:assert/strict"
import { previewTaskImport } from "@/lib/task-import"

test("previewTaskImport detects custom field candidates from non-standard CSV columns", () => {
  const preview = previewTaskImport([
    "title,priority,Story Points,Sprint Name,Approved",
    "Task A,high,8,Sprint 12,Yes",
    "Task B,low,3,Sprint 12,No",
  ].join("\n"))

  assert.equal(preview.customFieldCandidates.length, 3)
  const candidateHeaders = preview.customFieldCandidates.map((candidate) => candidate.header).sort()
  assert.deepEqual(candidateHeaders, ["Approved", "Sprint Name", "Story Points"])
})

test("previewTaskImport preserves Backlog as a real task status", () => {
  const preview = previewTaskImport("title,status\nUnscheduled work,Backlog")

  assert.equal(preview.previewRows[0]?.status, "backlog")
})
