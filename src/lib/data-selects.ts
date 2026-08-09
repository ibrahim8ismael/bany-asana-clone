import type { Prisma } from "@prisma/client"

export const USER_PUBLIC_SELECT = {
  id: true,
  full_name: true,
  email: true,
  avatar_url: true,
} satisfies Prisma.UserSelect
