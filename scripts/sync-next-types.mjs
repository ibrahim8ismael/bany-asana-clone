import { access, copyFile, mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, "..")

const from = path.join(root, ".next", "dev", "types", "cache-life.d.ts")
const to = path.join(root, ".next", "types", "cache-life.d.ts")

async function exists(filePath) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

if (await exists(from) && !(await exists(to))) {
  await mkdir(path.dirname(to), { recursive: true })
  await copyFile(from, to)
} else if (!(await exists(to))) {
  await mkdir(path.dirname(to), { recursive: true })
  await writeFile(to, "export {}\n", "utf8")
}
