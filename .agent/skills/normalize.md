---
name: normalize
description: Standardize inconsistent UI patterns, components, spacing, naming, and states. Use when the interface feels uneven, duplicated, or visually inconsistent.
user-invocable: true
argument-hint: "[target]"
---

Turn scattered UI decisions into a cohesive system.

## Focus Areas

- Inconsistent spacing or sizing
- Multiple versions of the same component
- Divergent button, input, badge, or card styles
- Conflicting naming and status patterns
- Inconsistent empty/loading/error states

## Method

1. Inventory repeated patterns.
2. Pick the strongest baseline pattern.
3. Consolidate tokens, variants, and behavior.
4. Replace one-off exceptions unless they are intentional.

## Preferred Outputs

- Shared tokens
- Reusable components
- Variant maps
- Consistent state handling

## Success Check

- Similar problems look and behave similarly.
- The UI feels authored by one system, not many patches.
