<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Local Skills

This repository includes a local skill library in `skills/`.

- If the user invokes a slash command that matches `skills/<name>.md`, read that skill file and follow it.
- Use `skills/index.json` when present to discover available skills, dependencies, and reference docs.
- For design work, load `skills/frontend-design.md` first, then any dependent skill files and referenced docs.
- If a design skill requires context and `.impeccable.md` does not contain it yet, follow `skills/teach-impeccable.md` before proceeding.
- Preserve `CLAUDE.md`, `AGENTS.md`, `.impeccable.md`, and `skills/` as the persistent instruction layer for future sessions.
