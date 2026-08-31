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

## Production Development Rules

### Production-first mindset

This application is an internal production system used by the company. Treat
every edit as a production change, not as experimental development.

Prioritize:

- data integrity;
- workspace isolation;
- RBAC and permission correctness;
- backward compatibility;
- predictable user behavior;
- database safety;
- minimal regression risk; and
- maintainability over quick hacks.

Do not make speculative architectural rewrites unless they are necessary for
the requested change. Do not weaken permissions, validation, quality-review
rules, or workspace isolation to make a UI feature work. Before changing
behavior, understand the existing domain flow and reuse existing abstractions
wherever possible.

### Understand the affected flow before editing

Inspect the relevant implementation before modifying code. Trace the request
through shared domain modules, including permission helpers, workflow rules,
task placement, quality-review logic, Server Actions, Prisma models, shared
queries, and cache/revalidation behavior where applicable.

Do not duplicate business logic in individual UI components when a central
implementation exists. Fix root causes instead of hiding symptoms in the
frontend. Server Actions and API routes must independently authenticate,
authorize, validate workspace scope, and revalidate affected routes.

### Preserve production invariants

Every change must preserve these invariants:

- Project access determines visibility of project tasks; task assignment does
  not narrow access inside an accessible project.
- Personal-task permissions remain isolated from project-task permissions.
- Workspace boundaries must never leak data.
- Project administration and task-management permissions are enforced on the
  server, not only through UI visibility.
- Quality-controlled task states remain controlled by the quality workflow.
- Database operations that must succeed together use transactions.
- Schema changes use proper, reviewable migrations; do not rely on runtime
  `prisma db push` in production.
- Archived or deleted records must not accidentally reappear.
- Optimistic UI state must reconcile with authoritative server/database state
  and roll back safely on failure.

When behavior is ambiguous, prefer the safest interpretation for a production
internal tool and document the assumption in the handoff.

### Validate every change

After changing code, run validation appropriate to the affected behavior. At a
minimum, where applicable, run:

1. targeted regression tests;
2. `npm test`;
3. `npm run typecheck`;
4. `npm run lint`; and
5. `npm run build`.

Add or update regression tests for fixed bugs whenever the current test
architecture supports it. A change is not complete merely because the UI
appears to work. Verify the server/database result and the rendered workflow
when practical.

### Deployment completes a production edit

A requested production edit is not complete after source changes alone. Unless
the user explicitly disables deployment or deployment cannot be performed
safely, follow this lifecycle:

```text
Request
  -> inspect affected code
  -> implement the smallest correct change
  -> run validation
  -> fix failures
  -> deploy
  -> verify container and public health
  -> report the result
```

Use the repository deployment entrypoint instead of reconstructing individual
commands in each session:

```sh
./scripts/deploy-production.sh
```

The script validates the code, builds the production image before database
changes, takes a production database backup, applies versioned migrations when
present, runs the idempotent project-membership normalization, recreates only
`asana-web`, and verifies container plus public health. Use
`./scripts/deploy-production.sh --validate-only` when deployment has been
explicitly disabled. Never run demo seeds against production.
