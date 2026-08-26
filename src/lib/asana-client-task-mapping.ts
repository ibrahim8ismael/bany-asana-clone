export type AsanaTaskClientSource = {
  effective_primary_project_gid?: string | null
}

export function resolveAsanaTaskClientId(
  task: AsanaTaskClientSource,
  clientIdByProjectGid: ReadonlyMap<string, string>,
) {
  const projectGid = String(task.effective_primary_project_gid || "").trim()
  return projectGid ? clientIdByProjectGid.get(projectGid) ?? null : null
}
