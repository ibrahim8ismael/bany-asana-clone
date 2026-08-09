import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function nextClientName(workspaceId: string, baseName: string) {
  let candidate = baseName.trim() || 'Imported Client'
  let counter = 2

  while (await prisma.client.findFirst({ where: { workspace_id: workspaceId, name: candidate }, select: { id: true } })) {
    candidate = `${baseName} ${counter}`
    counter += 1
  }

  return candidate
}

async function main() {
  const projectsWithoutClients = await prisma.project.findMany({
    where: { client_id: null },
    select: {
      id: true,
      workspace_id: true,
      name: true,
      description: true,
      color: true,
    },
  })

  let createdClients = 0

  for (const project of projectsWithoutClients) {
    const clientName = await nextClientName(project.workspace_id, project.name)
    const client = await prisma.client.create({
      data: {
        workspace_id: project.workspace_id,
        name: clientName,
        notes: project.description,
        color: project.color || '#f97316',
      },
      select: { id: true },
    })

    await prisma.project.update({
      where: { id: project.id },
      data: { client_id: client.id },
    })

    await prisma.task.updateMany({
      where: { project_id: project.id },
      data: { client_id: client.id },
    })

    createdClients += 1
  }

  const projectsWithClients = await prisma.project.findMany({
    where: { client_id: { not: null } },
    select: { id: true, client_id: true },
  })

  for (const project of projectsWithClients) {
    await prisma.task.updateMany({
      where: {
        project_id: project.id,
        client_id: null,
      },
      data: { client_id: project.client_id },
    })
  }

  console.log(`Created ${createdClients} clients and linked existing projects/tasks.`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
