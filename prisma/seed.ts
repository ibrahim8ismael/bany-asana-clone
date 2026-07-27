import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding demo data...');

  const demoPasswordPlain = process.env.SEED_DEMO_PASSWORD;
  if (!demoPasswordPlain || demoPasswordPlain.length < 12) {
    throw new Error('SEED_DEMO_PASSWORD must contain at least 12 characters before running the demo seed.');
  }

  // Hash the explicitly supplied development-only password for all seed users.
  const demoPassword = await bcrypt.hash(demoPasswordPlain, 10);

  // 1. Create Users
  const alice = await prisma.user.create({
    data: {
      full_name: 'Alice Admin',
      email: 'alice@example.com',
      avatar_url: 'https://i.pravatar.cc/150?u=alice',
      password_hash: demoPassword,
      is_super_admin: true,
      timezone: 'America/New_York',
    },
  });

  const bob = await prisma.user.create({
    data: {
      full_name: 'Bob Builder',
      email: 'bob@example.com',
      avatar_url: 'https://i.pravatar.cc/150?u=bob',
      password_hash: demoPassword,
      timezone: 'America/Los_Angeles',
    },
  });

  const charlie = await prisma.user.create({
    data: {
      full_name: 'Charlie Designer',
      email: 'charlie@example.com',
      avatar_url: 'https://i.pravatar.cc/150?u=charlie',
      password_hash: demoPassword,
      timezone: 'Europe/London',
    },
  });

  // 2. Create Workspace
  const workspace = await prisma.workspace.create({
    data: {
      name: 'Acme Corp',
      slug: 'acme-corp',
      owner_id: alice.id,
      logo_url: 'https://ui-avatars.com/api/?name=Acme+Corp&background=random',
    },
  });

  // Add members
  await prisma.workspaceMember.createMany({
    data: [
      { workspace_id: workspace.id, user_id: alice.id, role: 'owner' },
      { workspace_id: workspace.id, user_id: bob.id, role: 'member' },
      { workspace_id: workspace.id, user_id: charlie.id, role: 'member' },
    ],
  });

  // 3. Create Teams
  const engineeringTeam = await prisma.team.create({
    data: {
      workspace_id: workspace.id,
      name: 'Engineering',
      description: 'The builders of Acme.',
      created_by: alice.id,
    },
  });

  const designTeam = await prisma.team.create({
    data: {
      workspace_id: workspace.id,
      name: 'Design',
      description: 'Making Acme beautiful.',
      created_by: charlie.id,
    },
  });

  await prisma.teamMember.createMany({
    data: [
      { team_id: engineeringTeam.id, user_id: alice.id, role: 'owner' },
      { team_id: engineeringTeam.id, user_id: bob.id, role: 'member' },
      { team_id: designTeam.id, user_id: charlie.id, role: 'owner' },
    ],
  });

  // 4. Create Clients
  const frontendClient = await prisma.client.create({
    data: {
      workspace_id: workspace.id,
      name: 'Ahmed Trading',
      email: 'ops@ahmedtrading.example',
      notes: 'Ongoing web delivery client with mixed direct work and project-based work.',
      color: '#f97316',
    },
  });

  const designClient = await prisma.client.create({
    data: {
      workspace_id: workspace.id,
      name: 'Sara Studio',
      email: 'hello@sarastudio.example',
      notes: 'Design-focused client with structured project delivery.',
      color: '#3b82f6',
    },
  });

  // 5. Create Projects
  const boardProject = await prisma.project.create({
    data: {
      workspace_id: workspace.id,
      client_id: frontendClient.id,
      team_id: engineeringTeam.id,
      name: 'Frontend Rewrite',
      description: 'Moving to Next.js',
      color: '#ff5733',
      icon: 'stack',
      owner_id: alice.id,
      privacy: 'team_visible',
      default_view: 'board',
    },
  });

  const listProject = await prisma.project.create({
    data: {
      workspace_id: workspace.id,
      client_id: designClient.id,
      team_id: designTeam.id,
      name: 'Design System V2',
      description: 'Updating our shadcn/ui library',
      color: '#33bcff',
      icon: 'palette',
      owner_id: charlie.id,
      privacy: 'workspace_visible',
      default_view: 'list',
    },
  });

  await prisma.projectMember.createMany({
    data: [
      { project_id: boardProject.id, user_id: alice.id, role: 'owner' },
      { project_id: boardProject.id, user_id: bob.id, role: 'editor' },
      { project_id: listProject.id, user_id: charlie.id, role: 'owner' },
      { project_id: listProject.id, user_id: alice.id, role: 'viewer' },
    ],
  });

  // 6. Create Sections
  const [todo, inProgress, done] = await Promise.all([
    prisma.section.create({ data: { project_id: boardProject.id, name: 'To Do', position: 1000 } }),
    prisma.section.create({ data: { project_id: boardProject.id, name: 'In Progress', position: 2000 } }),
    prisma.section.create({ data: { project_id: boardProject.id, name: 'Done', position: 3000 } }),
  ]);

  const [backlog, active, completed] = await Promise.all([
    prisma.section.create({ data: { project_id: listProject.id, name: 'Backlog', position: 1000 } }),
    prisma.section.create({ data: { project_id: listProject.id, name: 'Active Design', position: 2000 } }),
    prisma.section.create({ data: { project_id: listProject.id, name: 'Approved', position: 3000 } }),
  ]);

  // 7. Create Custom Fields
  const priorityField = await prisma.customField.create({
    data: {
      workspace_id: workspace.id,
      name: 'P-Level',
      type: 'single_select',
    },
  });

  const [p1, p2, p3] = await Promise.all([
    prisma.customFieldOption.create({ data: { custom_field_id: priorityField.id, label: 'P1', color: 'red', position: 1 } }),
    prisma.customFieldOption.create({ data: { custom_field_id: priorityField.id, label: 'P2', color: 'yellow', position: 2 } }),
    prisma.customFieldOption.create({ data: { custom_field_id: priorityField.id, label: 'P3', color: 'blue', position: 3 } }),
  ]);

  // 8. Create Tasks
  const task1 = await prisma.task.create({
    data: {
      workspace_id: workspace.id,
      project_id: boardProject.id,
      section_id: todo.id,
      title: 'Initialize Next.js project',
      description_rich_text: 'Setup Next.js 14 with App Router and Tailwind CSS',
      status: 'incomplete',
      priority: 'high',
      assignee_id: alice.id,
      creator_id: alice.id,
      due_date: new Date(new Date().setDate(new Date().getDate() + 2)),
      position: 1000,
    },
  });

  const task2 = await prisma.task.create({
    data: {
      workspace_id: workspace.id,
      project_id: boardProject.id,
      section_id: inProgress.id,
      title: 'Configure shadcn/ui components',
      description_rich_text: 'Add primitive components from shadcn UI library.',
      status: 'incomplete',
      priority: 'medium',
      assignee_id: bob.id,
      creator_id: alice.id,
      position: 1000,
    },
  });

  const task3 = await prisma.task.create({
    data: {
      workspace_id: workspace.id,
      client_id: designClient.id,
      project_id: listProject.id,
      section_id: backlog.id,
      title: 'Design new branding assets',
      description_rich_text: 'Create SVG graphics for the new logo suite.',
      status: 'incomplete',
      priority: 'high',
      assignee_id: charlie.id,
      creator_id: charlie.id,
      due_date: new Date(new Date().setDate(new Date().getDate() + 5)),
      position: 1000,
    },
  });

  await prisma.task.create({
    data: {
      workspace_id: workspace.id,
      client_id: frontendClient.id,
      title: 'Confirm final domain and hosting plan',
      description_rich_text: 'Direct client follow-up that does not need a dedicated project yet.',
      status: 'in_progress',
      priority: 'medium',
      assignee_id: bob.id,
      creator_id: alice.id,
      due_date: new Date(new Date().setDate(new Date().getDate() + 1)),
      position: 1000,
    },
  });

  // Assign Custom Field Values
  await prisma.taskCustomFieldValue.create({
    data: {
      task_id: task1.id,
      custom_field_id: priorityField.id,
      value_json: JSON.stringify(p1.id),
    },
  });

  await prisma.taskCustomFieldValue.create({
    data: {
      task_id: task2.id,
      custom_field_id: priorityField.id,
      value_json: JSON.stringify(p2.id),
    },
  });

  // Comments
  await prisma.comment.create({
    data: {
      task_id: task1.id,
      author_id: alice.id,
      body_rich_text: 'I have started the initialization and it looks good so far.',
    },
  });

  // Dependencies
  await prisma.taskDependency.create({
    data: {
      blocking_task_id: task1.id,
      blocked_task_id: task2.id,
    },
  });

  // Goals
  await prisma.goal.create({
    data: {
      workspace_id: workspace.id,
      team_id: engineeringTeam.id,
      owner_id: alice.id,
      name: 'Reach 100k Monthly Active Users',
      description: 'Scale the platform to 100,000 MAU by end of Q4.',
      status: 'on_track',
      target_type: 'number',
      target_value: 100000,
      current_value: 62000,
      due_date: new Date(new Date().setMonth(new Date().getMonth() + 3)),
    },
  });

  await prisma.goal.create({
    data: {
      workspace_id: workspace.id,
      team_id: designTeam.id,
      owner_id: charlie.id,
      name: 'Complete Design System V2 Rollout',
      description: 'Migrate all components to the new design system.',
      status: 'at_risk',
      target_type: 'percentage',
      target_value: 100,
      current_value: 45,
      due_date: new Date(new Date().setMonth(new Date().getMonth() + 1)),
    },
  });

  await prisma.goal.create({
    data: {
      workspace_id: workspace.id,
      owner_id: bob.id,
      name: 'Reduce Page Load Time to < 2s',
      description: 'Optimize frontend bundle size and server response times.',
      status: 'on_track',
      target_type: 'number',
      target_value: 2,
      current_value: 2.8,
      due_date: new Date(new Date().setMonth(new Date().getMonth() + 2)),
    },
  });

  console.log(`Demo Data Seeded successfully!`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
