import assert from "node:assert/strict"
import test from "node:test"
import { USER_PUBLIC_SELECT } from "../src/lib/data-selects"

test("public user select never exposes authentication or privilege fields", () => {
  assert.deepEqual(Object.keys(USER_PUBLIC_SELECT).sort(), [
    "avatar_url",
    "email",
    "full_name",
    "id",
  ])
  assert.equal("password_hash" in USER_PUBLIC_SELECT, false)
  assert.equal("is_super_admin" in USER_PUBLIC_SELECT, false)
})
