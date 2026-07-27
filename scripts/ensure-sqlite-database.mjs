import "dotenv/config"
import { mkdir, open } from "node:fs/promises"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required before setting up the database.")
}

if (!databaseUrl.startsWith("file:") || databaseUrl === "file::memory:") {
  process.exit(0)
}

const schemaDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..", "prisma")
const sqlitePath = decodeURIComponent(databaseUrl.slice("file:".length).split("?")[0])
const databasePath = isAbsolute(sqlitePath)
  ? sqlitePath
  : resolve(schemaDirectory, sqlitePath)

await mkdir(dirname(databasePath), { recursive: true })
const handle = await open(databasePath, "a")
await handle.close()

console.log(`SQLite database file is ready at ${databasePath}`)
