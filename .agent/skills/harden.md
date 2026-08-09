---
name: harden
description: Strengthen UX reliability with better edge states, validation, permissions, destructive action handling, and recovery paths. Use when the user wants a flow made safer, more robust, or more production-ready.
user-invocable: true
argument-hint: "[target]"
---

Improve the parts of the experience that break under real usage.

## Focus Areas

- Loading, empty, error, and offline states
- Form validation and inline guidance
- Destructive actions and undo paths
- Permission and role-based messaging
- Keyboard and accessibility fallbacks

## Method

1. Identify where users can fail or get blocked.
2. Add prevention before failure.
3. Add recovery after failure.
4. Make system status visible during long or risky operations.

## Never

- Leave users with a dead-end error.
- Rely on vague messages like "Something went wrong."
- Hide permission failures behind broken UI.

## Success Check

- Edge cases are handled explicitly.
- Risky actions are safer.
- Users can recover instead of restarting.
