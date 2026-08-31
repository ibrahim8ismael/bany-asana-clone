# RBAC model

## Canonical roles

Workspace membership uses exactly:

- `owner`: the one workspace owner with full workspace control.
- `admin`: workspace resource and membership administration.
- `member`: normal workspace access.

Project ownership is authoritative in `Project.owner_id`. `ProjectMember.role`
stores only `admin` or `member`; the effective project role shown in the product
is `owner` when `user_id === Project.owner_id`, otherwise the stored project
membership role.

Every project owner and project member must belong to the project workspace.
Project membership is unique per `(project_id, user_id)`, and ownership transfer
upserts the new owner as `admin` and preserves the previous owner as `admin`.

## Authorization

Server actions resolve the authenticated user, require the project to be in the
user's active workspace, resolve that project's membership, and apply the
central helpers in `src/lib/permissions.ts`. Project members can work on tasks
within the normal workflow; only the effective owner and project admins can
change project settings or membership.

## Data normalization

Run the idempotent migration before deploying code that relies on this model:

```sh
npm run db:normalize-project-members
```

It normalizes legacy workspace roles (`user`, `guest`, and unknown values) to
`member`, normalizes legacy project roles (`owner`, `editor`, `commenter`, and
`viewer`) to `admin`/`member`, repairs missing workspace/project owners, removes
cross-workspace project memberships, enforces unique memberships, and installs
database role checks. The legacy `run-migration.ts` entry point delegates to
this same migration.
