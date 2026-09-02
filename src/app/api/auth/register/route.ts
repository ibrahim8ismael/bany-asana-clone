import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function toBaseSlug(value: string) {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return base || "workspace"
}

async function findCompanyWorkspaceTx(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) {
  const envSlug = process.env.COMPANY_WORKSPACE_SLUG?.trim() || process.env.DEFAULT_WORKSPACE_SLUG?.trim() || ""
  if (envSlug) {
    const bySlug = await tx.workspace.findUnique({ where: { slug: envSlug } })
    if (bySlug) return bySlug
  }
  return tx.workspace.findFirst({ orderBy: [{ created_at: "asc" }, { id: "asc" }] })
}

async function getUniqueWorkspaceSlugTx(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  base: string,
) {
  let candidate = base
  let counter = 1
  while (true) {
    const existing = await tx.workspace.findUnique({ where: { slug: candidate } })
    if (!existing) return candidate
    candidate = `${base}-${counter}`
    counter += 1
  }
}

export async function POST(req: Request) {
  try {
    const { fullName, email, password } = await req.json()
    const normalizedEmail = String(email || "").trim().toLowerCase()
    const normalizedName = String(fullName || "").trim()
    
    if (!normalizedName || !normalizedEmail || !password) {
      return NextResponse.json({ message: "Missing required fields" }, { status: 400 })
    }

    if (normalizedName.length < 2) {
      return NextResponse.json({ message: "Use at least 2 characters for your full name" }, { status: 400 })
    }

    if (!emailPattern.test(normalizedEmail)) {
      return NextResponse.json({ message: "Enter a valid email address" }, { status: 400 })
    }

    if (String(password).length < 8) {
      return NextResponse.json({ message: "Password must be at least 8 characters" }, { status: 400 })
    }
    
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    })
    
    if (existingUser) {
      return NextResponse.json({ message: "An account with this email already exists" }, { status: 400 })
    }
    
    const hashedPassword = await bcrypt.hash(password, 10)

    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          full_name: normalizedName,
          email: normalizedEmail,
          password_hash: hashedPassword,
          avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(normalizedName)}&background=random`,
        },
      })

      // Single-workspace mode: new signups join the company workspace.
      // Primary workspace is looked up by env slug or oldest workspace.
      const companyWorkspace = await findCompanyWorkspaceTx(tx)

      if (companyWorkspace) {
        await tx.workspaceMember.create({
          data: {
            workspace_id: companyWorkspace.id,
            user_id: createdUser.id,
            role: "member",
          },
        })

        await tx.user.update({
          where: { id: createdUser.id },
          data: { active_workspace_id: companyWorkspace.id },
        })
      } else {
        // Bootstrap: first user in a fresh database creates the company workspace as owner.
        const workspaceName = "Company Workspace"
        const slug = await getUniqueWorkspaceSlugTx(tx, toBaseSlug(workspaceName))
        const workspace = await tx.workspace.create({
          data: {
            name: workspaceName,
            slug,
            owner_id: createdUser.id,
          },
        })

        await tx.workspaceMember.create({
          data: {
            workspace_id: workspace.id,
            user_id: createdUser.id,
            role: "owner",
          },
        })

        await tx.user.update({
          where: { id: createdUser.id },
          data: { active_workspace_id: workspace.id },
        })
      }

      return createdUser
    })
    
    return NextResponse.json({ message: "User created", user: { id: user.id, email: user.email } }, { status: 201 })
  } catch (error) {
    console.error("Registration error:", error)
    return NextResponse.json({ message: "Internal server error" }, { status: 500 })
  }
}
