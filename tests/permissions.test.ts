import assert from "node:assert/strict"
import test from "node:test"
import { taskAccessWhere } from "../src/lib/permissions"

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
                role: { in: ["owner", "admin", "member", "guest"] },
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
    reviewer_id: "user-1",
    quality_required: true,
  })
})

test("quality reviewer access is read-only", () => {
  const where = taskAccessWhere("reviewer", "edit")
  assert.ok(Array.isArray(where.OR))
  assert.equal(where.OR.some((rule) => "reviewer_id" in rule), false)
})
