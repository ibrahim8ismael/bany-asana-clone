import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`UPDATE "WorkspaceMember" SET role = 'admin' WHERE role IN ('owner', 'admin')`);
  await prisma.$executeRawUnsafe(`UPDATE "WorkspaceMember" SET role = 'user' WHERE role IN ('member', 'guest')`);

  await prisma.$executeRawUnsafe(`UPDATE "ProjectMember" SET role = 'admin' WHERE role IN ('owner', 'admin')`);
  await prisma.$executeRawUnsafe(`UPDATE "ProjectMember" SET role = 'user' WHERE role IN ('editor', 'commenter', 'viewer')`);

  await prisma.$executeRawUnsafe(`UPDATE "TeamMember" SET role = 'admin' WHERE role = 'owner'`);
  await prisma.$executeRawUnsafe(`UPDATE "TeamMember" SET role = 'user' WHERE role = 'member'`);

  console.log("Migration complete.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
