# TaskFlow

A collaborative work management app inspired by Asana, built with Next.js App Router, Prisma, and NextAuth.

## Architecture Summary
- **Frontend / Framework**: Next.js 16 App Router (React 19) inside `src/app`.
- **UI Components**: Radix primitives via `shadcn/ui` + Tailwind CSS.
- **Data Fetching / Mutations**: React Server Components for declarative data fetching + Next.js Server Actions/Interactive Client Components for mutations.
- **Database & ORM**: Prisma ORM with SQLite for local development by default.
- **Auth**: NextAuth.js (v4) with credentials logic for simplicity.

## Core Features
- **Project Views**: Includes highly interactive List (Spreadsheet), Board (Kanban drag-and-drop), Calendar, and Timeline (Gantt-like).
- **Task Drawer**: A unified side-drawer for editing task entities including custom fields, subtasks, descriptions, assignees, and comments.
- **Reporting**: Advanced features like Portfolios and Goals modeled tightly in Prisma schema and displayed elegantly on dashboards.

## Detailed Installation & Setup Instructions

### Environment Variables
Copy `.env.example` to `.env`:

```env
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-super-secret-key-for-nextauth"
DATABASE_URL="file:./dev.db"
```

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Prisma
Local development uses SQLite by default through `prisma/schema.prisma`. The SQLite file is runtime data and is intentionally excluded from Git; GitHub contains the schema and migrations needed to create it.

### 3. Create or Upgrade the Database
Generate Prisma Client and apply the versioned migrations:

```bash
npm run db:setup
```

This creates `prisma/dev.db` automatically on a fresh checkout, including on Windows where Prisma expects the SQLite file to exist before applying migrations. On a server, configure `DATABASE_URL` to persistent storage before running the same command. Do not commit SQLite database files, production records, or database backups to GitHub.

Check migration state at any time with:

```bash
npm run db:status
```

### 4. Seed Demo Data
Demo data is optional and development-only. Set a dedicated password with at least 12 characters, then populate a new local database:

```bash
SEED_DEMO_PASSWORD="choose-a-development-only-password"
npm run db:seed
```

Never run the demo seed against production.

### 5. Run the Dev Server
```bash
npm run dev
```
Navigate to `http://localhost:3000`, register a new account, or sign in as a seeded demo user when you intentionally created demo data.

## Quality Commands

```bash
npm run typecheck
npm run test
npm run build
npm run skills:build
```

## Key Product Decisions
- **Optimistic UI:** Used predominantly in drag-and-drop interactions on the Board view, rendering instant state changes during column shifts.
- **Relational Integrity:** Implemented heavy usage of `onDelete: Cascade` in the Prisma schema (`Workspace > Project > Task > Comments`) to mimic cascading archives akin to true PM tools. 
- **Monolithic Frontend:** Adopted the Next.js boundary split architecture, moving authentication into NextAuth middleware/hooks, to easily protect deep `(dashboard)` layouts.

## Local Skill Library

This repository includes a reusable prompt-based skill library in `skills/`.

- Skill files live at `skills/<name>.md`
- Shared references live at `skills/reference/*.md`
- Generated manifest lives at `skills/index.json`

Generate or refresh the manifest with:

```bash
npm run skills:build
```

Design-related skills rely on persisted design context. Capture that context first with `skills/teach-impeccable.md`, then store it in `.impeccable.md` or `CLAUDE.md`.
