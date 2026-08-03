import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.user.updateMany({
    where: { email: 'kasemsaper562@gmail.com' },
    data: { is_super_admin: true }
  });
  
  if (result.count > 0) {
    await prisma.adminAccessRequest.updateMany({
      where: { user: { email: 'kasemsaper562@gmail.com' } },
      data: { status: 'approved' }
    });
    console.log("Success! Account is now superadmin.");
  } else {
    console.log("Error: User kasemsaper562@gmail.com not found.");
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
