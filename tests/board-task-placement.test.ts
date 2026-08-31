import assert from "node:assert/strict"
import test from "node:test"
import { resolveBoardTaskCreationPlacement } from "../src/lib/board-task-placement"

const sections = [
  { id: "section-backlog", name: "Backlog" },
  { id: "section-todo", name: "To Do" },
  { id: "section-progress", name: "In Progress" },
  { id: "section-done", name: "Done" },
]

test("the bucket Add task action persists directly in the selected project section", () => {
  assert.deepEqual(resolveBoardTaskCreationPlacement({
    bucket: { id: "section-progress", workflowStatus: null },
    sections,
    projectId: "project-a",
    workspaceId: "workspace-a",
  }), {
    success: true,
    input: {
      project_id: "project-a",
      section_id: "section-progress",
      workspace_id: "workspace-a",
      status: "incomplete",
    },
  })
})

test("workflow bucket creation persists the matching status and physical section in one write", () => {
  assert.deepEqual(resolveBoardTaskCreationPlacement({
    bucket: { id: "status:in_progress", workflowStatus: "in_progress" },
    sections,
    projectId: "project-a",
    workspaceId: "workspace-a",
  }), {
    success: true,
    input: {
      project_id: "project-a",
      section_id: "section-progress",
      workspace_id: "workspace-a",
      status: "in_progress",
    },
  })
})

test("empty buckets use the same persisted placement before and after refresh", () => {
  const input = {
    bucket: { id: "section-todo", workflowStatus: null },
    sections,
    projectId: "project-a",
    workspaceId: "workspace-a",
  } as const

  const initialPlacement = resolveBoardTaskCreationPlacement(input)
  const refreshedPlacement = resolveBoardTaskCreationPlacement({ ...input, sections: [...sections] })
  assert.deepEqual(initialPlacement, refreshedPlacement)
  assert.equal(initialPlacement.success, true)
  if (initialPlacement.success) assert.equal(initialPlacement.input.section_id, "section-todo")
})

test("bucket task creation fails safely when the project has no sections", () => {
  assert.deepEqual(resolveBoardTaskCreationPlacement({
    bucket: { id: "status:incomplete", workflowStatus: "incomplete" },
    sections: [],
    projectId: "project-a",
    workspaceId: "workspace-a",
  }), {
    success: false,
    error: "Add a project section before creating tasks",
  })
})
