import assert from "node:assert/strict"
import test from "node:test"
import {
  projectAccessWhere,
  projectRoleGrantsAccess,
  projectTaskAccessWhere,
  requiredTaskUpdateAccess,
  taskAccessWhere,
  workspaceAccessWhere,
} from "../src/lib/permissions"

test("taskAccessWhere keeps project, direct-client, and personal access distinct", () => {
  const where = taskAccessWhere("user-1", "view")
  assert.ok(Array.isArray(where.OR))
  assert.equal(where.OR.length, 4)

  const [projectTask, directClientTask, personalTask, reviewerTask] = where.OR
  assert.equal("project" in projectTask, true)
  assert.deepEqual(directClientTask, {
    project_id: null,
    client: {
      workspace: {
        OR: [
          { owner_id: "user-1" },
          {
        members: {
          some: {
            user_id: "user-1",
            role: { in: ["owner", "admin", "member"] },
          },
            },
          },
        ],
      },
    },
  })
  assert.deepEqual(personalTask, {
    project_id: null,
    client_id: null,
    OR: [{ assignee_id: "user-1" }, { creator_id: "user-1" }],
  })
  assert.deepEqual(reviewerTask, {
    project_id: null,
    reviewer_id: "user-1",
    quality_required: true,
  })
})

test("quality reviewer access is read-only", () => {
  const where = taskAccessWhere("reviewer", "edit")
  assert.ok(Array.isArray(where.OR))
  assert.equal(where.OR.some((rule) => "reviewer_id" in rule), false)
})

test("Super Admin predicates grant global access at every resource layer", () => {
  assert.deepEqual(workspaceAccessWhere("super-admin", "admin", true), {})
  assert.deepEqual(projectAccessWhere("super-admin", "manage", true), {})
  assert.deepEqual(taskAccessWhere("super-admin", "manage", true), {})
})

test("normal users retain scoped workspace and project access", () => {
  assert.notDeepEqual(workspaceAccessWhere("user-1", "view"), {})
  assert.notDeepEqual(projectAccessWhere("user-1", "view"), {})
  assert.notDeepEqual(taskAccessWhere("user-1", "view"), {})
})

test("project access requires active-workspace membership in that project", () => {
  assert.deepEqual(projectAccessWhere("user-1", "view"), {
    workspace: {
      active_users: { some: { id: "user-1" } },
      members: { some: { user_id: "user-1", role: { in: ["owner", "admin", "member"] } } },
    },
    OR: [
      { owner_id: "user-1" },
      {
        members: {
          some: {
            user_id: "user-1",
            role: { in: ["admin", "member"] },
          },
        },
      },
    ],
  })

  assert.deepEqual(projectAccessWhere("user-1", "manage"), {
    workspace: {
      active_users: { some: { id: "user-1" } },
      members: { some: { user_id: "user-1", role: { in: ["owner", "admin", "member"] } } },
    },
    OR: [
      { owner_id: "user-1" },
      {
        members: {
          some: {
            user_id: "user-1",
            role: { in: ["admin"] },
          },
        },
      },
    ],
  })
})

test("workspace roles use owner, admin, and member vocabulary", () => {
  assert.deepEqual(workspaceAccessWhere("user-1", "view"), {
    OR: [
      { owner_id: "user-1" },
      {
        members: {
          some: {
            user_id: "user-1",
            role: { in: ["owner", "admin", "member"] },
          },
        },
      },
    ],
  })
})

test("project-task visibility comes from project access, never assignee or creator identity", () => {
  const memberAWhere = projectTaskAccessWhere("member-a", "view")
  const memberBWhere = projectTaskAccessWhere("member-b", "view")

  for (const where of [memberAWhere, memberBWhere]) {
    assert.deepEqual(where.project_id, { not: null })
    assert.equal("project" in where, true)
    assert.equal(JSON.stringify(where).includes("assignee_id"), false)
    assert.equal(JSON.stringify(where).includes("creator_id"), false)
  }

  assert.equal(projectRoleGrantsAccess({ role: "member", level: "view" }), true)
  assert.equal(projectRoleGrantsAccess({ role: null, level: "view" }), false)
})

test("project admins can manage every project task regardless of assignment", () => {
  const where = projectTaskAccessWhere("project-admin", "manage")

  assert.equal(projectRoleGrantsAccess({ role: "admin", level: "manage" }), true)
  assert.equal(JSON.stringify(where).includes("assignee_id"), false)
  assert.equal(JSON.stringify(where).includes("creator_id"), false)
  assert.deepEqual(where, {
    project_id: { not: null },
    project: projectAccessWhere("project-admin", "manage"),
  })
})

test("project members can edit normal task fields but cannot perform task administration", () => {
  assert.equal(projectRoleGrantsAccess({ role: "member", level: "edit" }), true)
  assert.equal(projectRoleGrantsAccess({ role: "member", level: "manage" }), false)
  assert.equal(requiredTaskUpdateAccess({ title: "Updated" }), "edit")
  assert.equal(requiredTaskUpdateAccess({ status: "in_progress" }), "edit")
  assert.equal(requiredTaskUpdateAccess({ priority: "high" }), "edit")
  assert.equal(requiredTaskUpdateAccess({ due_date: "2026-08-26" }), "edit")
  assert.equal(requiredTaskUpdateAccess({ assignee_id: "member-b" }), "manage")
  assert.equal(requiredTaskUpdateAccess({ section_id: "section-b" }), "manage")
})

test("project owners and Super Admin retain project-management override access", () => {
  assert.equal(projectRoleGrantsAccess({ role: null, isOwner: true, level: "manage" }), true)
  assert.equal(projectRoleGrantsAccess({ role: null, isSuperAdmin: true, level: "manage" }), true)
})
