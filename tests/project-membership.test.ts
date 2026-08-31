import assert from "node:assert/strict"
import test from "node:test"
import {
  effectiveProjectRole,
  isProjectRole,
  isWorkspaceAdmin,
  isWorkspaceRole,
  validateProjectMemberAssignments,
} from "../src/lib/project-membership"

test("project roles are limited to admin and member", () => {
  assert.equal(isProjectRole("admin"), true)
  assert.equal(isProjectRole("member"), true)
  assert.equal(isProjectRole("owner"), false)
  assert.equal(isProjectRole("user"), false)
  assert.equal(isProjectRole("editor"), false)
})

test("effective project ownership is derived from Project.owner_id", () => {
  assert.equal(effectiveProjectRole({ userId: "owner", ownerId: "owner", membershipRole: "admin" }), "owner")
  assert.equal(effectiveProjectRole({ userId: "admin", ownerId: "owner", membershipRole: "admin" }), "admin")
  assert.equal(effectiveProjectRole({ userId: "member", ownerId: "owner", membershipRole: "member" }), "member")
  assert.equal(effectiveProjectRole({ userId: "other", ownerId: "owner", membershipRole: null }), null)
})

test("workspace role validation is canonical", () => {
  assert.equal(isWorkspaceRole("owner"), true)
  assert.equal(isWorkspaceRole("admin"), true)
  assert.equal(isWorkspaceRole("member"), true)
  assert.equal(isWorkspaceRole("user"), false)
  assert.equal(isWorkspaceRole("guest"), false)
  assert.equal(isWorkspaceAdmin("owner"), true)
  assert.equal(isWorkspaceAdmin("admin"), true)
  assert.equal(isWorkspaceAdmin("member"), false)
})

test("project member assignments validate roles, uniqueness, and ownership", () => {
  assert.deepEqual(validateProjectMemberAssignments([
    { userId: "admin-1", role: "admin" },
    { userId: "member-1", role: "member" },
  ], "owner-1"), {
    assignments: [
      { userId: "admin-1", role: "admin" },
      { userId: "member-1", role: "member" },
    ],
  })

  assert.equal(validateProjectMemberAssignments([
    { userId: "member-1", role: "member" },
    { userId: "member-1", role: "admin" },
  ], "owner-1").error, "A user can only be added to a project once")
  assert.equal(validateProjectMemberAssignments([
    { userId: "owner-1", role: "member" },
  ], "owner-1").error, "The project owner is added automatically")
  assert.equal(validateProjectMemberAssignments([
    { userId: "member-1", role: "owner" },
  ], "owner-1").error, "Every project member needs a valid user and role")
})
