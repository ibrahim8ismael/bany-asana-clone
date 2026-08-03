import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, "..")
const skillsDir = path.join(repoRoot, "skills")
const outputFile = path.join(skillsDir, "index.json")

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)

  if (!match) {
    return { metadata: {}, body: markdown }
  }

  const [, frontmatter, body] = match
  const metadata = {}

  for (const rawLine of frontmatter.split(/\r?\n/)) {
    if (!rawLine.trim()) continue

    const separatorIndex = rawLine.indexOf(":")
    if (separatorIndex === -1) continue

    const key = rawLine.slice(0, separatorIndex).trim()
    let value = rawLine.slice(separatorIndex + 1).trim()

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    if (value === "true") metadata[key] = true
    else if (value === "false") metadata[key] = false
    else metadata[key] = value
  }

  return { metadata, body }
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function main() {
  await fs.mkdir(path.join(skillsDir, "reference"), { recursive: true })
  const skillEntries = await fs.readdir(skillsDir, { withFileTypes: true })
  const skillFiles = skillEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md")
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right))

  const parsedSkills = await Promise.all(
    skillFiles.map(async (fileName) => {
      const absolutePath = path.join(skillsDir, fileName)
      const markdown = await fs.readFile(absolutePath, "utf8")
      const { metadata, body } = parseFrontmatter(markdown)

      return {
        fileName,
        absolutePath,
        metadata,
        body,
      }
    })
  )

  const skillNames = parsedSkills.map(({ metadata, fileName }) => metadata.name || path.basename(fileName, ".md"))

  const referenceEntries = await fs.readdir(path.join(skillsDir, "reference"), { withFileTypes: true })
  const referenceFiles = referenceEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => `reference/${entry.name}`)
    .sort((left, right) => left.localeCompare(right))

  const manifest = {
    generatedAt: new Date().toISOString(),
    version: 1,
    skillCount: parsedSkills.length,
    referenceCount: referenceFiles.length,
    availableCommands: uniqueSorted(skillNames.map((name) => `/${name}`)),
    environment: {
      noticeFilePresent: await fileExists(path.join(repoRoot, "NOTICE.md")),
      designContextFilePresent: await fileExists(path.join(repoRoot, ".impeccable.md")),
    },
    skills: parsedSkills.map(({ fileName, metadata, body }) => {
      const name = metadata.name || path.basename(fileName, ".md")
      const dependentSkills = uniqueSorted(
        skillNames.filter((skillName) => {
          if (skillName === name) return false
          const pattern = new RegExp(`(^|[^A-Za-z0-9-])/${escapeRegExp(skillName)}(?![A-Za-z0-9-])`)
          return pattern.test(body)
        })
      )

      const referencedDocs = uniqueSorted(
        [...body.matchAll(/reference\/[A-Za-z0-9-]+\.md/g)].map((match) => match[0])
      )

      const externalFiles = uniqueSorted([
        ...(body.includes(".impeccable.md") ? [".impeccable.md"] : []),
        ...(body.includes("NOTICE.md") ? ["NOTICE.md"] : []),
        ...(body.includes("CLAUDE.md") ? ["CLAUDE.md"] : []),
      ])

      return {
        name,
        file: fileName,
        description: metadata.description || "",
        userInvocable: Boolean(metadata["user-invocable"]),
        argumentHint: metadata["argument-hint"] || null,
        license: metadata.license || null,
        dependencies: {
          skills: dependentSkills,
          references: referencedDocs,
          files: externalFiles,
        },
      }
    }),
    references: referenceFiles,
  }

  await fs.writeFile(outputFile, `${JSON.stringify(manifest, null, 2)}\n`, "utf8")
  console.log(`Generated ${path.relative(repoRoot, outputFile)}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
