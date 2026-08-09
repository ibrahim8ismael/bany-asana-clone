import { randomUUID } from "node:crypto"
import { mkdir, unlink, writeFile } from "node:fs/promises"
import { dirname, resolve, sep } from "node:path"
import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"

const MAX_AVATAR_BYTES = 2 * 1024 * 1024
const MIME_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
} as const

function hasValidImageSignature(bytes: Uint8Array, mimeType: keyof typeof MIME_EXTENSIONS) {
  if (mimeType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  }

  if (mimeType === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    return bytes.length >= signature.length && signature.every((byte, index) => bytes[index] === byte)
  }

  if (mimeType === "image/webp") {
    return bytes.length >= 12
      && String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF"
      && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
  }

  if (mimeType === "image/gif") {
    const signature = String.fromCharCode(...bytes.subarray(0, 6))
    return signature === "GIF87a" || signature === "GIF89a"
  }

  return false
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const avatar = formData.get("avatar")
    if (!(avatar instanceof File)) {
      return NextResponse.json({ error: "Choose an avatar image" }, { status: 400 })
    }

    const mimeType = avatar.type.toLowerCase() as keyof typeof MIME_EXTENSIONS
    const extension = MIME_EXTENSIONS[mimeType]
    if (!extension) {
      return NextResponse.json({ error: "Avatar must be a JPEG, PNG, WebP, or GIF image" }, { status: 400 })
    }
    if (avatar.size === 0 || avatar.size > MAX_AVATAR_BYTES) {
      return NextResponse.json({ error: "Avatar must be 2MB or smaller" }, { status: 400 })
    }

    const bytes = new Uint8Array(await avatar.arrayBuffer())
    if (!hasValidImageSignature(bytes, mimeType)) {
      return NextResponse.json({ error: "The selected file does not match its image type" }, { status: 400 })
    }

    const uploadDirectory = resolve(process.cwd(), "public", "uploads", "avatars")
    const fileName = `${randomUUID()}.${extension}`
    const filePath = resolve(uploadDirectory, fileName)
    if (!filePath.startsWith(`${uploadDirectory}${sep}`) || dirname(filePath) !== uploadDirectory) {
      return NextResponse.json({ error: "Invalid upload path" }, { status: 400 })
    }

    await mkdir(uploadDirectory, { recursive: true })
    await writeFile(filePath, bytes, { flag: "wx" })

    const avatarUrl = `/uploads/avatars/${fileName}`
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { avatar_url: avatarUrl },
      })
    } catch (error) {
      await unlink(filePath).catch(() => undefined)
      throw error
    }

    return NextResponse.json({ avatarUrl })
  } catch {
    return NextResponse.json({ error: "Avatar upload failed" }, { status: 500 })
  }
}
