# TaskFlow Internal-Use Readiness Backlog

**Reviewed snapshot:** July 29, 2026  
**Review basis:** `DEVELOPER_HANDOFF.md` and the packed repository snapshot.  
**Important:** Verify each ticket against the latest branch before filing, because the supplied code is a snapshot rather than a live checkout.

## Recommended GitHub labels

- Priorities: `priority:P0`, `priority:P1`, `priority:P2`
- Types: `type:bug`, `type:security`, `type:reliability`, `type:devops`, `type:test`, `type:ux`, `type:maintenance`
- Areas: `area:auth`, `area:permissions`, `area:database`, `area:tasks`, `area:quality`, `area:imports`, `area:files`, `area:notifications`

## Internal release rule

The application is ready for internal use when every P0 ticket is closed, the critical-flow smoke test passes on staging, and backups have been restored successfully at least once. P1 tickets may be deferred only when the affected feature is hidden or explicitly marked unsupported.

---

# P0 — Internal launch blockers

## Ticket 01 — Rotate exposed production credentials and invalidate affected sessions

**Labels:** `priority:P0`, `type:security`, `area:auth`, `area:database`  
**Size:** M

### Problem

The repository snapshot contains a production-style PostgreSQL connection string, a NextAuth session secret, and an Asana token-encryption key. These values must be considered compromised.

### Scope

- Rotate the PostgreSQL username/password.
- Rotate `NEXTAUTH_SECRET`.
- Invalidate all sessions signed with the old secret.
- Rotate `ASANA_TOKEN_ENCRYPTION_KEY`.
- Determine whether reusable Asana tokens were encrypted with the old key.
- Re-encrypt valid stored tokens or revoke/delete connections that cannot be migrated.
- Review deployment logs and CI artifacts for copies of the leaked values.

### Acceptance criteria

- None of the exposed values remains valid.
- Existing sessions created with the old NextAuth secret no longer authenticate.
- The application starts successfully with newly generated secrets.
- Any stored Asana token is either migrated safely or revoked.
- A short credential-rotation record is added to the internal operations documentation.

### Code areas

- `.env`
- Deployment environment configuration
- `src/lib/secret-crypto.ts`
- NextAuth configuration

---

## Ticket 02 — Remove hard-coded secrets and add automated secret scanning

**Labels:** `priority:P0`, `type:security`, `type:devops`  
**Size:** S

### Problem

Reusable secrets are present in `.env.example` and `docker-compose.yml`. Example configuration should never establish a shared authentication or encryption secret.

### Scope

- Replace committed secret values with obvious placeholders.
- Keep `.env` ignored and verify it is not tracked.
- Remove sensitive files from Git history when applicable.
- Add secret scanning to CI, such as Gitleaks or an equivalent tool.
- Add a pre-commit recommendation to the contributor documentation.
- Fail CI when a credential pattern is detected.

### Acceptance criteria

- No real or reusable secret exists in tracked configuration.
- `docker compose config` requires secrets to be supplied externally.
- CI fails on a test secret fixture that matches the configured detection rule.
- A clean repository scan reports no unresolved secrets.

### Code areas

- `.env.example`
- `docker-compose.yml`
- `.gitignore`
- CI workflow

---

## Ticket 03 — Replace `prisma db push` at application startup with versioned migrations

**Labels:** `priority:P0`, `type:reliability`, `type:devops`, `area:database`  
**Size:** M

### Problem

The Docker container runs `prisma db push` every time the application starts. This couples schema mutation to runtime startup and bypasses the controlled migration workflow.

### Scope

- Remove `prisma db push` from the Docker `CMD`.
- Run `prisma migrate deploy` as an explicit release or deployment step.
- Start the application only after the migration step succeeds.
- Ensure multiple application instances cannot race to mutate the schema.
- Document rollback expectations for data migrations.

### Acceptance criteria

- Application startup never calls `prisma db push`.
- A deployment with pending migrations applies them once using `prisma migrate deploy`.
- A failed migration prevents the new release from starting.
- Restarting an existing application instance does not modify the database schema.
- Staging deployment from an empty database succeeds.

### Code areas

- `Dockerfile`
- `package.json`
- Prisma migrations
- Deployment workflow

---

## Ticket 04 — Make PostgreSQL the single documented and tested database configuration

**Labels:** `priority:P0`, `type:bug`, `type:devops`, `area:database`  
**Size:** M

### Problem

The Prisma schema and current environment examples use PostgreSQL, while parts of the README, handoff, and setup scripts still describe SQLite. A new developer cannot know which setup is authoritative.

### Scope

- Declare PostgreSQL as the supported database for development, staging, and production.
- Update README and developer handoff instructions.
- Remove or retire `ensure-sqlite-database.mjs`.
- Verify `.env.example`, Docker Compose, Prisma schema, migrations, and npm scripts agree.
- Use `npm ci`, not an undocumented alternative, in the clean-install instructions.
- Add a clean-bootstrap CI or scripted verification.

### Acceptance criteria

From a clean checkout, the documented commands:

1. start PostgreSQL,
2. install dependencies,
3. apply migrations,
4. optionally seed development data, and
5. start TaskFlow successfully.

No current document states that `prisma/schema.prisma` uses SQLite.

### Code areas

- `README.md`
- `DEVELOPER_HANDOFF.md`
- `.env.example`
- `prisma/schema.prisma`
- `scripts/ensure-sqlite-database.mjs`
- `docker-compose.yml`

---

## Ticket 05 — Add an explicit invite-only mode for internal deployment

**Labels:** `priority:P0`, `type:security`, `area:auth`  
**Size:** M

### Problem

Public registration is available, but password reset, email verification, MFA, bot protection, and mature account lifecycle controls are not implemented. Those features are not all required for internal use if registration is restricted.

### Scope

- Add an environment flag such as `ALLOW_PUBLIC_REGISTRATION=false`.
- When disabled, block the registration page and registration API.
- Permit account creation only through an authorized administrator workflow.
- Return a clear internal-use message instead of a generic error.
- Document how the first administrator is bootstrapped.

### Acceptance criteria

- With public registration disabled, unauthenticated users cannot create accounts through the UI or API.
- Workspace administrators can still add approved internal users.
- The first super administrator can be created through a documented secure process.
- Registration remains disabled by default in production configuration.

### Code areas

- Registration page and form
- `src/app/api/auth/register/route.ts`
- Account/member administration
- Environment configuration

---

## Ticket 06 — Fix workspace member onboarding and unusable generated passwords

**Labels:** `priority:P0`, `type:bug`, `type:security`, `area:auth`  
**Size:** M

### Problem

When an administrator adds a new email without supplying a password, the server generates a password with `Math.random()`, hashes it, discards the plaintext, and returns only success. The new user has no way to discover the password or sign in. The generated password is also not cryptographically strong.

### Scope

Choose the smallest internal-use solution:

- Require the administrator to enter a temporary password of sufficient strength, **or**
- Generate a cryptographically secure one-time password and display it once to the administrator.

Also:

- Add a `must_change_password` field or equivalent first-login requirement.
- Create the user and workspace membership in one transaction.
- Validate email format, name length, and password policy.
- Never write the temporary password to logs or notifications.
- Define behavior when the email already belongs to an existing user.

### Acceptance criteria

- A newly added user can sign in using a known temporary credential.
- The temporary credential is generated with a cryptographic random source when generated by the server.
- The user must choose a new password on first login.
- A failed membership creation does not leave an unintended orphan account.
- Duplicate membership attempts return a stable, user-friendly error.

### Code areas

- `src/actions/admin-actions.ts`
- Member-management UI
- Prisma `User` model
- Login flow

---

## Ticket 07 — Handle task, review, and ownership dependencies when removing a workspace member

**Labels:** `priority:P0`, `type:bug`, `type:reliability`, `area:permissions`  
**Size:** L

### Problem

Removing a workspace member transfers owned projects and deletes team/project memberships, but it does not resolve tasks assigned to that user, quality-review assignments, default reviewer settings, goal ownership, portfolio ownership, time entries, or personal tasks in the workspace. This can leave work assigned to a person who can no longer access it.

### Scope

Before removal, calculate and display affected records:

- assigned open tasks,
- quality reviews and reviewer assignments,
- project default-reviewer references,
- goals and portfolios owned,
- project/team ownership,
- personal tasks stored in that workspace.

Implement a minimal safe policy:

- block removal until required ownership is reassigned, or
- reassign selected records to a chosen replacement user,
- unassign optional task/reviewer references,
- preserve historical records.

Clear `active_workspace_id` when it references the removed workspace.

### Acceptance criteria

- No open task remains assigned to an inaccessible removed member unless explicitly allowed and documented.
- No project points to a removed default reviewer.
- Required owned entities are reassigned before removal completes.
- The removed user cannot access the workspace afterward.
- The removal operation is transactional.
- An audit record describes the reassignment/removal result.

### Code areas

- `removeWorkspaceMember`
- Prisma user relations
- Member-removal UI
- Quality review logic

---

## Ticket 08 — Replace destructive client deletion with a guarded data-safety workflow

**Labels:** `priority:P0`, `type:bug`, `type:reliability`, `area:database`  
**Size:** M

### Problem

Deleting a client explicitly deletes related tasks and then deletes the client, whose relationships can cascade into projects and their data. A single action can permanently remove projects, tasks, comments, reviews, and history.

### Scope

For internal use:

- Make archive the normal action.
- Hide or restrict hard delete to workspace owners or super administrators.
- Show a server-calculated dependency summary before deletion.
- Require the client name or another deliberate confirmation.
- Decide whether client deletion should delete projects or detach/archive them.
- Record an audit event.
- Add a retention delay or documented database-restore procedure.

### Acceptance criteria

- A normal workspace member cannot hard-delete a client.
- Confirmation displays the exact number of projects and tasks affected.
- The server repeats the authorization and dependency check at execution time.
- The selected data policy is covered by integration tests.
- Accidental deletion can be recovered through the documented backup process.

### Code areas

- `deleteClient`
- Client deletion modal
- Prisma cascade relationships
- Backup/restore documentation

---

## Ticket 09 — Define and fix task access through secondary project links

**Labels:** `priority:P0`, `type:bug`, `type:security`, `area:permissions`, `area:tasks`  
**Size:** L

### Problem

The data model supports `TaskProjectLink`, allowing one task to appear in multiple projects. The central task permission predicate visibly checks the primary `project` relationship but not secondary linked projects. Users may be unable to access tasks through a project they are allowed to view, or the product may behave inconsistently across views and search.

### Scope

Document one policy:

- **Primary-project security:** secondary links do not grant access, or
- **Any-linked-project security:** access to any linked project grants task access.

Apply the selected policy consistently to:

- task drawer,
- list/board/calendar/timeline,
- search,
- comments,
- attachments,
- exports,
- notifications,
- activity feed,
- quality review.

### Acceptance criteria

- The selected behavior is documented.
- A test covers access through a secondary project link.
- A deny test covers a user with access to neither primary nor linked projects.
- Search, export, task opening, and comments use the same policy.
- No cross-workspace project link can be created.

### Code areas

- `src/lib/permissions.ts`
- `TaskProjectLink`
- Search and export queries
- Project views

---

## Ticket 10 — Add integration tests for workspace isolation and role permissions

**Labels:** `priority:P0`, `type:test`, `type:security`, `area:permissions`  
**Size:** L

### Problem

Permission helpers exist, but unit-level predicate tests are not enough for a multi-tenant application. A regression in a query include, Server Action, or Route Handler can expose another workspace’s records.

### Scope

Run tests against a real PostgreSQL test database. Cover:

- workspace owner/admin/member/guest,
- project owner/admin/editor/commenter/viewer,
- private, team-visible, and workspace-visible projects,
- personal tasks,
- direct client tasks,
- reviewer access,
- secondary project links,
- member removal,
- CSV export/import authorization,
- admin-only operations.

### Acceptance criteria

- Every critical allow rule has a matching deny test.
- Tests prove users cannot read or mutate records from another workspace.
- Tests call the actual application functions or HTTP routes, not only handcrafted predicates.
- The suite runs in CI.
- A permission regression fails the build.

### Code areas

- `tests/`
- `src/lib/permissions.ts`
- Server Actions
- API Route Handlers

---

## Ticket 11 — Make core mutations and activity logging transactionally consistent

**Labels:** `priority:P0`, `type:bug`, `type:reliability`, `area:database`  
**Size:** L

### Problem

Several operations save the primary record and then write activity/history or synchronize project status afterward. If logging or synchronization fails, the action can return an error even though the main change was already committed. A user retry can create duplicates.

Examples include task creation, task movement, project creation, comment creation, and section deletion.

### Scope

For each critical mutation:

- Put required database changes and audit records in one Prisma transaction, or
- Commit the business change and make non-critical logging explicitly best-effort without returning a false failure.
- Make notifications retryable through an outbox or equivalent queued record where practical.
- Add idempotency protection to create/import operations that may be retried.

### Acceptance criteria

- A forced activity-log failure cannot produce “operation failed” after the primary record was silently saved.
- Section task reassignment and section deletion are atomic.
- Project plus default sections are created atomically.
- Critical audit entries are stored with their mutation.
- Retry tests do not create duplicate records.

### Code areas

- `src/actions/server-actions.ts`
- `src/actions/comment-actions.ts`
- `src/actions/quality-actions.ts`
- `src/lib/activity.ts`

---

## Ticket 12 — Persist avatars and uploaded files across deployments

**Labels:** `priority:P0`, `type:bug`, `type:reliability`, `area:files`  
**Size:** M

### Problem

Avatar uploads are written into the application’s local `public` directory. Container replacement or multi-instance deployment can make uploaded files disappear or appear only on one instance.

### Scope

For the smallest internal deployment, choose one:

- mount a documented persistent volume to the upload directory, or
- use S3-compatible/object storage.

Also:

- delete/reconcile replaced avatars,
- keep file metadata in the database,
- validate file type and size,
- document backup behavior for uploaded files.

### Acceptance criteria

- An uploaded avatar remains available after an application redeploy and container replacement.
- Two application instances serve the same file.
- Replacing an avatar does not indefinitely leak old files.
- Invalid or oversized images are rejected.
- File storage is included in backup/recovery documentation.

### Code areas

- Avatar upload Route Handler
- Deployment volume/object-storage configuration
- User profile actions

---

## Ticket 13 — Add rate limiting to sensitive endpoints

**Labels:** `priority:P0`, `type:security`, `area:auth`, `area:imports`, `area:files`  
**Size:** M

### Problem

Login, registration, imports, uploads, and sensitive administrator actions have no visible request throttling. Internal applications still face password guessing, accidental import loops, and misuse by compromised accounts.

### Scope

Add per-IP and, where authenticated, per-user limits for:

- login,
- registration,
- password changes,
- avatar upload,
- CSV preview/import,
- member creation,
- super-admin requests/reviews.

Return `429` with a clear retry response. Use a shared store when running more than one instance.

### Acceptance criteria

- Repeated failed logins are throttled.
- Import and upload limits are enforced server-side.
- Legitimate use remains practical.
- Limits work across multiple application instances.
- Rate-limit events are logged without credentials or sensitive payloads.

---

## Ticket 14 — Validate and restrict task attachment URLs

**Labels:** `priority:P0`, `type:security`, `type:bug`, `area:files`  
**Size:** S

### Problem

Task attachments accept an arbitrary `file_url` and render it as a clickable link. Dangerous schemes such as `javascript:` or unexpected `data:` URLs are not rejected.

### Scope

- Parse attachment URLs on the server.
- Allow only approved protocols, minimally `https:` and optionally `http:` for local development.
- Reject credentials embedded in URLs if not required.
- Enforce length limits on URL and filename.
- Show the hostname to users.
- Keep `noopener noreferrer` behavior on external links.

### Acceptance criteria

- `javascript:`, `data:`, `file:`, malformed, and overlong URLs are rejected.
- Valid HTTPS links continue to work.
- Tests cover allowed and denied schemes.
- Existing invalid records are identified and disabled or cleaned.

### Code areas

- `addTaskAttachment`
- Task drawer attachment UI
- Prisma attachment records

---

## Ticket 15 — Prevent CSV formula injection in exported task files

**Labels:** `priority:P0`, `type:security`, `area:imports`  
**Size:** S

### Problem

User-controlled task fields are exported directly to CSV. Spreadsheet programs may interpret cells beginning with `=`, `+`, `-`, or `@` as formulas when the file is opened.

### Scope

- Neutralize dangerous leading characters in exported text cells.
- Apply protection after trimming only when appropriate; do not corrupt normal numeric/date fields.
- Add tests for malicious task titles, descriptions, user names, project names, and tags.
- Document the chosen escaping behavior.

### Acceptance criteria

- Exported user-controlled cells cannot execute spreadsheet formulas.
- Normal CSV quoting remains valid.
- Tests cover all dangerous prefixes and quoted values.
- Existing import/export round-trip tests still pass.

### Code areas

- `src/lib/csv.ts`
- `src/lib/task-export.ts`
- CSV tests

---

## Ticket 16 — Add CSV import size, row, and execution limits

**Labels:** `priority:P0`, `type:security`, `type:reliability`, `area:imports`  
**Size:** M

### Problem

The import API accepts JSON containing the full CSV text without a visible request-size or row-count limit. A very large payload can consume excessive memory and database time.

### Scope

- Reject unsupported `mode` and `targetType` values.
- Limit request bytes, CSV characters, rows, columns, and field lengths.
- Limit custom-field creation per import.
- Return validation errors before performing database writes.
- Consider processing imports in bounded batches.
- Log summary metrics, not full CSV content.

### Acceptance criteria

- Oversized payloads fail with `413` or a clear validation response.
- Excessive row/column counts are rejected before import.
- Invalid modes cannot fall through to execution.
- Limits are documented and tested.
- Importing the maximum supported file succeeds on staging.

### Code areas

- `src/app/api/import/tasks/route.ts`
- `src/lib/task-import.ts`
- Import UI and tests

---

## Ticket 17 — Add duplicate/retry protection and audit records to CSV imports

**Labels:** `priority:P0`, `type:bug`, `type:reliability`, `area:imports`  
**Size:** L

### Problem

Retrying an import after a timeout or uncertain response can create duplicate tasks. Production imports should be idempotent or explicitly reversible.

### Scope

- Generate an import run ID before execution.
- Store source filename, target, requester, status, counts, and safe error summaries.
- Calculate a source hash or require an idempotency key.
- Warn or block an identical completed import into the same target.
- Make failed imports clearly resumable or safely restartable.
- Do not store raw secrets or unnecessarily retain full CSV contents.

### Acceptance criteria

- Retrying the same import request does not silently duplicate tasks.
- Each execution has a visible status and summary.
- Partial failure is recorded.
- The administrator can identify exactly which run created records.
- Integration tests cover retry and rollback/failure behavior.

### Code areas

- `ImportRun`
- `ImportIssue`
- CSV import route and executor

---

## Ticket 18 — Stop returning raw database and internal exception messages to users

**Labels:** `priority:P0`, `type:security`, `type:bug`  
**Size:** M

### Problem

Many Server Actions return `error.message` directly. Prisma errors, constraint names, filesystem paths, or implementation details may be exposed to the UI.

### Scope

- Introduce stable application error codes/messages.
- Log internal exceptions with a correlation ID.
- Return only safe user-facing messages.
- Map common conflicts, validation errors, permission errors, and not-found errors.
- Preserve actionable errors without exposing stack traces or database details.

### Acceptance criteria

- A forced Prisma constraint error does not expose SQL, table, field, or filesystem details.
- Logs contain the internal error and correlation ID.
- The UI displays a stable actionable message.
- Permission errors do not reveal whether an inaccessible record exists.

### Code areas

- Server Actions
- API Route Handlers
- Shared error utility

---

## Ticket 19 — Add consistent server-side validation for all create operations

**Labels:** `priority:P0`, `type:bug`, `area:tasks`  
**Size:** M

### Problem

Task updates have structured validation, but several create operations accept untrimmed, empty, overlong, or invalid values. Examples include task titles, subtask titles, section names, project default views/statuses, colors, positions, comments, and client fields.

### Scope

Create reusable schemas or parsers for:

- task creation,
- subtask creation,
- project creation/update,
- client creation/update,
- section creation,
- comments,
- attachments,
- member creation.

Validate enumerated values, string lengths, emails, URLs, dates, colors, and finite positions.

### Acceptance criteria

- Empty or whitespace-only task, subtask, project, client, section, and comment names are rejected.
- Overlong values are rejected with clear messages.
- Unknown status/default-view/role values cannot reach Prisma.
- NaN/Infinity positions are rejected.
- Validation tests cover each mutation boundary.

---

## Ticket 20 — Formalize and enforce task/quality workflow transitions

**Labels:** `priority:P0`, `type:bug`, `type:reliability`, `area:quality`, `area:tasks`  
**Size:** L

### Problem

Task status and quality state form related state machines. Invalid combinations or race conditions can occur unless every transition is centrally enforced.

### Scope

Define allowed transitions for:

- incomplete/in progress/complete,
- quality ready/submitted/needs rework/approved/approved with notes,
- reopening approved work,
- changing reviewer or assignee,
- moving a task between projects with different quality policies,
- due date and rework due date behavior.

Enforce transitions on the server within transactions.

### Acceptance criteria

- Invalid transitions are rejected regardless of the UI used.
- Completing a quality-required task follows one documented path.
- Reopening approved work has documented score/review behavior.
- Concurrent submissions or reviews cannot create duplicate review cycles.
- End-to-end tests cover each transition and deny case.
- SLA date behavior is tested with at least two time zones.

### Code areas

- `src/actions/quality-actions.ts`
- `updateTask`
- Quality models and tests

---

## Ticket 21 — Add database backup, restore verification, health checks, and error monitoring

**Labels:** `priority:P0`, `type:reliability`, `type:devops`  
**Size:** M

### Problem

Internal users will store operational work in the system, but there is no demonstrated backup/restore procedure, application health endpoint, or production error monitoring.

### Scope

- Enable automated PostgreSQL backups.
- Document and test a restore into an isolated environment.
- Back up persistent file storage.
- Add liveness and readiness endpoints.
- Add error tracking and structured logs.
- Monitor database connectivity and migration state.
- Define who receives alerts.

### Acceptance criteria

- A backup is restored successfully and verified with sample records.
- Health endpoints distinguish “process alive” from “ready to serve.”
- Unhandled server errors appear in the selected monitoring system.
- Logs do not contain passwords, tokens, full import payloads, or secrets.
- The recovery procedure identifies an owner and expected recovery steps.

---

## Ticket 22 — Add critical-flow end-to-end tests and a staging release checklist

**Labels:** `priority:P0`, `type:test`, `type:reliability`  
**Size:** L

### Problem

The existing test suite does not demonstrate that complete user journeys work together.

### Scope

Automate at least:

1. administrator adds a user,
2. user signs in and changes temporary password,
3. create client/project/task,
4. assign and update task,
5. submit for quality review,
6. request rework,
7. resubmit and approve,
8. comment and delete own comment,
9. archive/restore client,
10. export CSV,
11. preview and execute a bounded import,
12. deny a viewer’s edit attempt,
13. deny cross-workspace access.

### Acceptance criteria

- Tests run against staging-like PostgreSQL.
- The suite passes in CI or as a required pre-release job.
- Failed tests preserve useful logs/screenshots without secrets.
- A documented staging checklist includes migrations, backups, health, login, permissions, and core workflows.

---

# P1 — Fix soon or hide before internal launch

## Ticket 23 — Make search use the central task permission policy

**Labels:** `priority:P1`, `type:bug`, `area:permissions`, `area:tasks`  
**Size:** M

### Problem

Search duplicates task-access logic instead of using the central predicate. It omits at least quality-reviewer access and secondary project-link semantics.

### Scope

- Replace duplicated search authorization with the central task policy.
- Include tasks available because the user is the assigned quality reviewer.
- Apply the selected multi-homing policy.
- Keep workspace scoping and archived filters.
- Add allow/deny tests.

### Acceptance criteria

- Every task a user can legitimately open can be found by title.
- Search never returns a task the user cannot open.
- Reviewer and secondary-project-link tests pass.
- Search results remain scoped to the active workspace.

### Code areas

- `getSearchResults`
- `taskAccessWhere`

---

## Ticket 24 — Validate comments and refresh the UI after deletion

**Labels:** `priority:P1`, `type:bug`, `type:ux`, `area:tasks`  
**Size:** S

### Problem

Comment creation accepts empty or excessively large text, and comment deletion does not revalidate the task/project views. The UI can continue showing a deleted comment until another refresh.

### Scope

- Trim comments.
- Reject empty and overlong comments.
- Verify task access before deletion in addition to author ownership.
- Revalidate all relevant task paths after deletion.
- Add tests for create/delete permissions and UI refresh.

### Acceptance criteria

- Empty comments are rejected.
- Deleted comments disappear immediately after the operation completes.
- A removed workspace member cannot mutate a comment through a stale ID.
- Comment limits are documented in validation code.

---

## Ticket 25 — Hide or clearly disable unfinished modules and misleading controls

**Labels:** `priority:P1`, `type:ux`, `type:bug`  
**Size:** M

### Problem

Several visible routes and controls imply functionality that does not exist:

- general Dashboard redirects to Reporting,
- Portfolios redirects to Clients,
- project Dashboard redirects elsewhere,
- Inbox displays “Archive soon,”
- Project Overview displays “Resource links coming soon,”
- Teams have models but no complete management flow,
- several schema-only features have no user journey.

For internal use, misleading navigation creates support burden and user distrust.

### Scope

- Remove unfinished items from the sidebar and project tabs, or label them clearly as unavailable.
- Return an intentional “not enabled” page instead of an unrelated redirect when direct URLs are used.
- Do not build Forms, Automations, Templates, Portfolios, or realtime features as part of this ticket.
- Add a simple feature-flag/config mechanism if needed.

### Acceptance criteria

- Navigation contains only supported internal-use features.
- No visible button says “soon.”
- Direct access to disabled routes gives a clear explanation.
- Supported routes do not redirect to semantically unrelated modules.
- Product documentation lists the intentionally unsupported features.

---

## Ticket 26 — Fix Goals display defects or remove Goals from the internal release

**Labels:** `priority:P1`, `type:bug`, `type:ux`  
**Size:** S

### Problem

Goals are read-only and the handoff identifies an encoding defect. A visible module that cannot be maintained by users is likely to become stale.

### Scope

Choose one:

- hide Goals from internal navigation, or
- keep the read-only page, fix encoding, and label the data source/maintenance method clearly.

Do not build complete Goals CRUD unless it is explicitly part of the internal MVP.

### Acceptance criteria

- No mojibake/encoding artifact is visible.
- Users understand whether Goals are read-only.
- An empty Goals page does not imply a missing creation button by mistake.
- Navigation matches the chosen product scope.

---

## Ticket 27 — Correct Inbox read behavior and remove the archive placeholder

**Labels:** `priority:P1`, `type:bug`, `type:ux`, `area:notifications`  
**Size:** M

### Problem

Opening Inbox marks all currently unread, non-snoozed notifications as read before the user interacts with individual items. The page also exposes a disabled archive control.

### Scope

For minimal internal use:

- mark an item read when opened, or provide an explicit “Mark all read” action,
- remove the archive control until archive is implemented,
- preserve unread count consistency across tabs/layout,
- keep snoozed notification behavior consistent.

### Acceptance criteria

- Merely opening Inbox does not unexpectedly clear all unread items unless the user selects “Mark all read.”
- The unread badge updates correctly.
- No disabled “Archive soon” control is visible.
- Read-state behavior is covered by an integration test.

---

## Ticket 28 — Fix lint issues honestly and add lint to CI

**Labels:** `priority:P1`, `type:maintenance`, `type:test`  
**Size:** L

### Problem

The handoff reports significant lint failures, and the repository includes a script that inserts `eslint-disable-next-line` directives automatically. Suppressing every finding is not equivalent to fixing it and can hide React effect and type-safety defects.

### Scope

- Remove the automatic suppression script from normal workflows.
- Inventory existing suppressions and justify or eliminate each one.
- Replace high-risk `any` usage in core components with shared types.
- Fix React effect/dependency violations rather than suppressing them.
- Add `npm run lint` to CI.
- Permit narrowly scoped, documented exceptions only.

### Acceptance criteria

- `npm run lint` passes without bulk-generated suppressions.
- CI fails when a new lint error is introduced.
- Core task, client, board, and drawer components no longer rely on broad `any` types.
- Remaining suppressions have an inline explanation.

### Code areas

- `fix-lints.mjs`
- `lint-results.json`
- large client components
- CI workflow

---

## Ticket 29 — Add pagination or hard limits to large workspace queries

**Labels:** `priority:P1`, `type:reliability`, `type:performance`  
**Size:** L

### Problem

Several pages load complete client/task collections or broad activity datasets. Internal datasets can still grow enough to make pages slow or memory-heavy.

### Scope

Prioritize:

- clients and their projects/tasks,
- My Tasks,
- Inbox,
- reporting breakdowns,
- member lists,
- search result limits already present but should remain indexed.

Add cursor pagination or an explicit safe maximum with “load more.”

### Acceptance criteria

- No primary page loads an unbounded task/client/member collection.
- Queries use appropriate indexes.
- A staging dataset with the expected first-year volume remains responsive.
- Pagination preserves permissions and active-workspace scoping.

---

## Ticket 30 — Run the production container as a non-root user and add container readiness checks

**Labels:** `priority:P1`, `type:security`, `type:devops`  
**Size:** S

### Problem

The production Docker image does not visibly switch to a non-root runtime user and has no container health check.

### Scope

- Create/use an unprivileged runtime user.
- Ensure required runtime files are readable and upload storage is writable only where needed.
- Add a health check against the readiness endpoint.
- Confirm graceful shutdown behavior.

### Acceptance criteria

- The application process is not PID-owned by root inside the container.
- The container becomes healthy only when the database and application are ready.
- Upload/storage permissions remain functional.
- Restart and shutdown behavior is verified.

---

# P2 — Useful after the internal release is stable

## Ticket 31 — Add basic keyboard and accessibility coverage to dialogs, drawers, and drag-and-drop

**Labels:** `priority:P2`, `type:ux`  
**Size:** M

### Acceptance criteria

- Dialogs and drawers trap/restore focus correctly.
- Core operations are possible without a mouse.
- Drag-and-drop has a keyboard or non-drag alternative.
- Form errors are announced and associated with inputs.
- Critical controls meet basic touch-target and contrast requirements.

---

## Ticket 32 — Add notification retention and cleanup policy

**Labels:** `priority:P2`, `type:reliability`, `area:notifications`  
**Size:** S

### Acceptance criteria

- Notification retention duration is documented.
- Old read notifications can be purged safely.
- Purging does not remove audit history required for operations.
- Cleanup runs as a controlled scheduled job.

---

# Suggested milestones

## Milestone 1 — Security containment

Tickets 01–02.

## Milestone 2 — Deployable PostgreSQL baseline

Tickets 03–04, 12, 21, and 30.

## Milestone 3 — Internal identity and permission safety

Tickets 05–10 and 13.

## Milestone 4 — Data and workflow correctness

Tickets 11, 14–20, and 22.

## Milestone 5 — Internal-use cleanup

Tickets 23–29.

# Definition of ready for internal users

- All P0 tickets are closed.
- Public registration is disabled unless explicitly approved.
- A clean staging deployment succeeds from an empty database.
- Backup restoration has been tested.
- Cross-workspace authorization tests pass.
- The administrator can add a user who can actually sign in.
- Member removal does not orphan active work.
- Client deletion cannot silently destroy operational history.
- Core task and quality-review journeys pass end to end.
- Unsupported features are hidden.
- Monitoring and health checks are active.
