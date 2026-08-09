import test from "node:test"
import assert from "node:assert/strict"
import { parseCsv, stringifyCsv } from "@/lib/csv"

test("parseCsv handles quoted commas and newlines", () => {
  const rows = parseCsv('title,description\n"Task 1","Line 1, still line 1"\n"Task 2","Line a\nLine b"')

  assert.equal(rows.length, 2)
  assert.equal(rows[0].title, "Task 1")
  assert.equal(rows[0].description, "Line 1, still line 1")
  assert.equal(rows[1].description, "Line a\nLine b")
})

test("stringifyCsv escapes special characters", () => {
  const csv = stringifyCsv(["title", "description"], [{ title: 'Task "A"', description: "Hello, world" }])
  assert.match(csv, /"Task ""A"""/)
  assert.match(csv, /"Hello, world"/)
})
