import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const password_hash = await bcrypt.hash('password123', 10)

  // Users
  const superAdmin = await prisma.user.upsert({
    where: { email: 'superadmin@demo.com' },
    update: { password_hash, is_super_admin: true },
    create: {
      email: 'superadmin@demo.com',
      full_name: 'Super Admin',
      password_hash,
      is_super_admin: true
    }
  })

  const admin = await prisma.user.upsert({
    where: { email: 'admin@demo.com' },
    update: { password_hash, is_super_admin: false },
    create: {
      email: 'admin@demo.com',
      full_name: 'Admin User',
      password_hash,
      is_super_admin: false
    }
  })

  const member = await prisma.user.upsert({
    where: { email: 'member@demo.com' },
    update: { password_hash, is_super_admin: false },
    create: {
      email: 'member@demo.com',
      full_name: 'Member User',
      password_hash,
      is_super_admin: false
    }
  })

  console.log('Users created')

  // Workspace
  const workspace = await prisma.workspace.upsert({
    where: { slug: 'demo-workspace' },
    update: {},
    create: {
      name: 'Demo Workspace',
      slug: 'demo-workspace',
      owner_id: superAdmin.id
    }
  })

  await prisma.workspaceMember.upsert({
    where: { workspace_id_user_id: { workspace_id: workspace.id, user_id: superAdmin.id } },
    update: { role: 'owner' },
    create: { workspace_id: workspace.id, user_id: superAdmin.id, role: 'owner' }
  })
  await prisma.workspaceMember.upsert({
    where: { workspace_id_user_id: { workspace_id: workspace.id, user_id: admin.id } },
    update: { role: 'admin' },
    create: { workspace_id: workspace.id, user_id: admin.id, role: 'admin' }
  })
  await prisma.workspaceMember.upsert({
    where: { workspace_id_user_id: { workspace_id: workspace.id, user_id: member.id } },
    update: { role: 'member' },
    create: { workspace_id: workspace.id, user_id: member.id, role: 'member' }
  })

  console.log('Workspace and members created')

  // Clients
  const client1 = await prisma.client.create({
    data: {
      workspace_id: workspace.id,
      name: 'Acme Corp',
      color: '#0075de'
    }
  })
  
  const client2 = await prisma.client.create({
    data: {
      workspace_id: workspace.id,
      name: 'Stark Industries',
      color: '#e11d48'
    }
  })

  // Projects
  const project1 = await prisma.project.create({
    data: {
      workspace_id: workspace.id,
      client_id: client1.id,
      name: 'Website Redesign',
      owner_id: admin.id,
      privacy: 'workspace_visible',
      default_view: 'board',
      status: 'on_track',
      color: '#60a5fa',
      members: {
        create: [
          { user_id: admin.id, role: 'admin' },
          { user_id: member.id, role: 'member' },
        ],
      }
    }
  })
  
  const project2 = await prisma.project.create({
    data: {
      workspace_id: workspace.id,
      client_id: client2.id,
      name: 'Q3 Marketing Campaign',
      owner_id: admin.id,
      privacy: 'workspace_visible',
      default_view: 'list',
      status: 'at_risk',
      color: '#f472b6',
      members: {
        create: [{ user_id: admin.id, role: 'admin' }],
      }
    }
  })

  // Sections and Tasks for Project 1
  const section1 = await prisma.section.create({
    data: { project_id: project1.id, name: 'To Do', position: 1 }
  })
  const section2 = await prisma.section.create({
    data: { project_id: project1.id, name: 'In Progress', position: 2 }
  })

  await prisma.task.create({
    data: {
      workspace_id: workspace.id,
      project_id: project1.id,
      section_id: section1.id,
      client_id: client1.id,
      title: 'Design Mockups',
      status: 'incomplete',
      creator_id: admin.id,
      assignee_id: member.id,
      position: 1
    }
  })

  await prisma.task.create({
    data: {
      workspace_id: workspace.id,
      project_id: project1.id,
      section_id: section2.id,
      client_id: client1.id,
      title: 'Setup Database',
      status: 'incomplete',
      creator_id: superAdmin.id,
      assignee_id: admin.id,
      position: 1
    }
  })
  
  // Section and Tasks for Project 2
  const section3 = await prisma.section.create({
    data: { project_id: project2.id, name: 'Planning', position: 1 }
  })
  await prisma.task.create({
    data: {
      workspace_id: workspace.id,
      project_id: project2.id,
      section_id: section3.id,
      client_id: client2.id,
      title: 'Identify Target Audience',
      status: 'incomplete',
      creator_id: admin.id,
      assignee_id: member.id,
      position: 1
    }
  })

  console.log('Clients, projects, and tasks created successfully!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
