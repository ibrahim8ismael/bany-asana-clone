/**
 * Legacy entry point retained for operators who used `tsx run-migration.ts`.
 *
 * The old script rewrote workspace members to the invalid `user` role and
 * rewrote project members to roles that are no longer supported. Keep the
 * canonical migration in one place instead of maintaining a second, unsafe
 * migration path.
 */
import "./scripts/normalize-project-member-roles"
