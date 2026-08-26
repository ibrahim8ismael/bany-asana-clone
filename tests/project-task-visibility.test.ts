import assert from "node:assert/strict"
import test from "node:test"
import { mergeUnsectionedProjectTasksIntoSections } from "../src/lib/project-task-visibility"

test("Board and List retain unsectioned project tasks in their section-backed views", () => {
  const project = {
    id: "project-a",
    tasks: [
      { id: "legacy-unsectioned", position: 500 },
    ],
    sections: [
      {
        id: "section-a",
        tasks: [
          { id: "assigned-to-member-b", position: 1000 },
          { id: "assigned-to-member-a", position: 2000 },
        ],
      },
      { id: "section-b", tasks: [] },
    ],
  }

  const visibleProject = mergeUnsectionedProjectTasksIntoSections(project)
  assert.deepEqual(visibleProject.sections[0].tasks.map((task) => task.id), [
    "legacy-unsectioned",
    "assigned-to-member-b",
    "assigned-to-member-a",
  ])
  assert.equal(visibleProject.sections.flatMap((section) => section.tasks).length, 3)
})

test("section-backed project views remain unchanged when every task has a section", () => {
  const project = {
    tasks: [],
    sections: [{ id: "section-a", tasks: [{ id: "task-a", position: 1000 }] }],
  }

  assert.equal(mergeUnsectionedProjectTasksIntoSections(project), project)
})
