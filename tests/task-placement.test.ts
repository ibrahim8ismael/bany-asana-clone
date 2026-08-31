import assert from "node:assert/strict"
import test from "node:test"
import { nextTaskPosition, resolveTaskPlacement } from "../src/lib/task-placement"

const clientA = { id: "client-a", workspace_id: "workspace-a" }
const clientB = { id: "client-b", workspace_id: "workspace-a" }
const projectA = { id: "project-a", workspace_id: "workspace-a", client_id: "client-a" }
const sectionA = { id: "section-a", project_id: "project-a", user_id: null, project: projectA }

test("direct client tasks persist without a project or section", () => {
  assert.deepEqual(resolveTaskPlacement({
    project: null,
    client: clientA,
    section: null,
    fallbackWorkspaceId: null,
  }), {
    success: true,
    workspaceId: "workspace-a",
    clientId: "client-a",
    projectId: null,
    sectionId: null,
  })
})

test("project task placement derives client, project, section, and workspace together", () => {
  assert.deepEqual(resolveTaskPlacement({
    project: projectA,
    client: clientA,
    section: sectionA,
    fallbackWorkspaceId: null,
  }), {
    success: true,
    workspaceId: "workspace-a",
    clientId: "client-a",
    projectId: "project-a",
    sectionId: "section-a",
  })
})

test("a task cannot use a project belonging to another client", () => {
  const result = resolveTaskPlacement({ project: projectA, client: clientB, section: sectionA, fallbackWorkspaceId: null })
  assert.deepEqual(result, { success: false, error: "Project does not belong to that client" })
})

test("task relationships cannot cross workspaces", () => {
  const result = resolveTaskPlacement({
    project: projectA,
    client: { id: "client-a", workspace_id: "workspace-b" },
    section: null,
    fallbackWorkspaceId: null,
  })
  assert.equal(result.success, false)
  if (!result.success) assert.match(result.error, /workspace/i)
})

test("a project can be inferred from its section without turning the section into workflow state", () => {
  const result = resolveTaskPlacement({ project: null, client: null, section: sectionA, fallbackWorkspaceId: null })
  assert.deepEqual(result, {
    success: true,
    workspaceId: "workspace-a",
    clientId: "client-a",
    projectId: "project-a",
    sectionId: "section-a",
  })
})

test("new tasks receive the next stable position inside their persisted section", () => {
  assert.equal(nextTaskPosition(null), 1000)
  assert.equal(nextTaskPosition(undefined), 1000)
  assert.equal(nextTaskPosition(2000), 3000)
})
