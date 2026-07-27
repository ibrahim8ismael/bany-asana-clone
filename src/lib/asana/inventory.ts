import { AsanaApiError, AsanaClient, type AsanaClientOptions } from "@/lib/asana/client"

export interface AsanaWorkspaceSummary {
  gid: string
  name: string
  is_organization?: boolean
}

interface AsanaResource {
  gid: string
  name: string
}

interface AsanaProject extends AsanaResource {
  archived?: boolean
}

interface AsanaTask extends AsanaResource {
  resource_subtype?: string
  num_subtasks?: number
  num_attachments?: number
  custom_fields?: unknown[]
  tags?: unknown[]
  followers?: unknown[]
  dependencies?: unknown[]
  dependents?: unknown[]
}

export interface AsanaInventoryResult {
  scannedAt: string
  workspace: AsanaWorkspaceSummary
  counts: {
    users: number
    teams: number
    projects: number
    archivedProjects: number
    sections: number
    uniqueTasks: number
    customFields: number
    tags: number
    portfolios: number
    goals: number
  }
  features: {
    subtasks: number
    attachments: number
    tasksWithCustomFields: number
    tasksWithTags: number
    tasksWithFollowers: number
    dependencyLinks: number
    milestones: number
    approvals: number
  }
  projects: Array<{
    gid: string
    name: string
    archived: boolean
    tasks: number
    sections: number
  }>
  warnings: string[]
  truncated: boolean
}

interface InventoryOptions {
  clientOptions?: Omit<AsanaClientOptions, "accessToken">
  maxProjects?: number
  maxTasksPerProject?: number
  concurrency?: number
}

function resourcePath(segment: string, gid: string, suffix = "") {
  if (!/^[0-9]+$/.test(gid)) throw new Error(`Invalid Asana ${segment} GID`)
  return `/${segment}/${gid}${suffix}`
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await mapper(items[index])
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()))
  return results
}

function isOptionalResourceError(error: unknown) {
  return error instanceof AsanaApiError && [402, 403, 404].includes(error.status)
}

export async function discoverAsanaWorkspaces(
  accessToken: string,
  options?: Omit<AsanaClientOptions, "accessToken">
) {
  const client = new AsanaClient({ accessToken, ...options })
  return client.getAll<AsanaWorkspaceSummary>("/workspaces", {
    opt_fields: "name,is_organization",
  })
}

export async function runAsanaInventory(
  accessToken: string,
  workspace: AsanaWorkspaceSummary,
  options: InventoryOptions = {}
): Promise<AsanaInventoryResult> {
  const client = new AsanaClient({ accessToken, ...options.clientOptions })
  const maxProjects = options.maxProjects ?? 250
  const maxTasksPerProject = options.maxTasksPerProject ?? 25_000
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 5, 10))
  const warningSet = new Set<string>()

  async function optionalCollection<T>(label: string, path: string, params: Record<string, string | number | boolean> = {}) {
    try {
      return await client.getAll<T>(path, params)
    } catch (error) {
      if (!isOptionalResourceError(error)) throw error
      warningSet.add(`${label} could not be listed with this Asana account or plan.`)
      return []
    }
  }

  const workspacePath = resourcePath("workspaces", workspace.gid)
  const [users, teams, activeProjects, archivedProjects, customFields, tags, portfolios, goals] = await Promise.all([
    client.getAll<AsanaResource>("/users", { workspace: workspace.gid, opt_fields: "name,email" }),
    optionalCollection<AsanaResource>("Teams", `${workspacePath}/teams`, { opt_fields: "name" }),
    client.getCollection<AsanaProject>(`${workspacePath}/projects`, {
      archived: false,
      opt_fields: "name,archived",
    }, { maxItems: maxProjects }),
    client.getCollection<AsanaProject>(`${workspacePath}/projects`, {
      archived: true,
      opt_fields: "name,archived",
    }, { maxItems: maxProjects }),
    optionalCollection<AsanaResource>("Custom fields", `${workspacePath}/custom_fields`, { opt_fields: "name,resource_subtype" }),
    optionalCollection<AsanaResource>("Tags", `${workspacePath}/tags`, { opt_fields: "name,color" }),
    optionalCollection<AsanaResource>("Portfolios", "/portfolios", { workspace: workspace.gid, opt_fields: "name,archived" }),
    optionalCollection<AsanaResource>("Goals", "/goals", { workspace: workspace.gid, opt_fields: "name,status" }),
  ])

  const allProjects = [...activeProjects.data, ...archivedProjects.data]
  const uniqueProjects = [...new Map(allProjects.map((project) => [project.gid, project])).values()]
  const taskMap = new Map<string, AsanaTask>()
  let truncated = activeProjects.truncated || archivedProjects.truncated

  const projectRows = await mapWithConcurrency(uniqueProjects, concurrency, async (project) => {
    const projectPath = resourcePath("projects", project.gid)
    const [taskCollection, sections] = await Promise.all([
      client.getCollection<AsanaTask>(`${projectPath}/tasks`, {
        opt_fields: [
          "name",
          "resource_subtype",
          "num_subtasks",
          "num_attachments",
          "custom_fields",
          "tags",
          "followers",
          "dependencies",
          "dependents",
        ].join(","),
      }, { maxItems: maxTasksPerProject }),
      optionalCollection<AsanaResource>("Sections", `${projectPath}/sections`, { opt_fields: "name" }),
    ])

    if (taskCollection.truncated) truncated = true
    for (const task of taskCollection.data) taskMap.set(task.gid, task)

    return {
      gid: project.gid,
      name: project.name,
      archived: Boolean(project.archived),
      tasks: taskCollection.data.length,
      sections: sections.length,
    }
  })

  const tasks = [...taskMap.values()]
  const features = tasks.reduce<AsanaInventoryResult["features"]>((summary, task) => {
    summary.subtasks += task.num_subtasks || 0
    summary.attachments += task.num_attachments || 0
    summary.tasksWithCustomFields += task.custom_fields?.length ? 1 : 0
    summary.tasksWithTags += task.tags?.length ? 1 : 0
    summary.tasksWithFollowers += task.followers?.length ? 1 : 0
    summary.dependencyLinks += task.dependencies?.length || 0
    summary.milestones += task.resource_subtype === "milestone" ? 1 : 0
    summary.approvals += task.resource_subtype === "approval" ? 1 : 0
    return summary
  }, {
    subtasks: 0,
    attachments: 0,
    tasksWithCustomFields: 0,
    tasksWithTags: 0,
    tasksWithFollowers: 0,
    dependencyLinks: 0,
    milestones: 0,
    approvals: 0,
  })

  warningSet.add("Comments, activity stories, attachment files, and unprojected tasks require the deep inventory phase.")
  warningSet.add("Counts reflect objects visible to the Asana identity used for this scan.")
  if (truncated) warningSet.add("The quick inventory reached its safety limit; the migration worker must continue from checkpoints.")

  return {
    scannedAt: new Date().toISOString(),
    workspace,
    counts: {
      users: users.length,
      teams: teams.length,
      projects: activeProjects.data.length,
      archivedProjects: archivedProjects.data.length,
      sections: projectRows.reduce((sum, project) => sum + project.sections, 0),
      uniqueTasks: tasks.length,
      customFields: customFields.length,
      tags: tags.length,
      portfolios: portfolios.length,
      goals: goals.length,
    },
    features,
    projects: projectRows,
    warnings: [...warningSet],
    truncated,
  }
}
