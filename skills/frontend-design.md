---
name: frontend-design
description: Design or refine TaskFlow frontend components and flows with production-grade interaction, hierarchy, accessibility, and visual consistency while avoiding generic AI aesthetics.
user-invocable: true
argument-hint: "[page, component, or flow]"
license: Apache 2.0. Based on Anthropic's frontend-design skill. See NOTICE.md for attribution.
---

Create frontend work that feels intentional, fast, and native to the product rather than like a detached redesign.

## Context First

Before design work, confirm these are documented:

- Target audience and usage context
- Primary jobs users are trying to complete
- Brand personality and tone

Use this order:

1. Read any `## Design Context` already present in the active instructions.
2. Read `.impeccable.md` from the repository root.
3. If the required context is still missing, stop and follow `/teach-impeccable` before designing.

Do not infer product strategy or audience solely from existing code.

## TaskFlow Direction

For this repository, preserve the established dark, utilitarian work-management interface unless the user explicitly requests a broader redesign.

- Optimize for frequent, low-friction operational use.
- Keep hierarchy clear before making the interface decorative.
- Prefer compact inline actions and progressive disclosure over extra modals.
- Reuse existing color, spacing, typography, component, and interaction conventions.
- Make changes local to the requested workflow; do not restyle unrelated surfaces.

## Interaction Rules

- Put actions where their effect occurs. An action that creates an item in a bucket belongs inside that bucket.
- Keep high-frequency actions visible and lightweight; reveal secondary controls on focus or hover only when keyboard users retain equivalent access.
- Use optimistic state only when failure can be rolled back cleanly and a useful inline error is shown.
- Preserve user input while a request is pending or fails.
- Provide explicit loading, empty, disabled, success, and error states where the interaction needs them.
- Use Server Actions and server authorization as the source of truth. UI affordances may explain permissions but never replace enforcement.
- Do not expose controls that imply an operation is available when the domain workflow forbids it.

## Visual Rules

- Use spacing, weight, and contrast to establish reading order.
- Keep supporting text quieter than labels and primary content without reducing readability.
- Avoid unnecessary containers and nested cards; flatten hierarchy where grouping is already obvious.
- Avoid decorative gradients, glow effects, glassmorphism, oversized icon tiles, and identical generic card grids.
- Do not make every action primary. Use text, ghost, secondary, and destructive treatments according to consequence.
- Motion must explain state change. Prefer short transform/opacity transitions and respect reduced motion.

## Accessibility and Responsive Behavior

- Use semantic buttons, labels, headings, lists, and form controls.
- Every icon-only control needs an accessible name and visible focus treatment.
- Maintain keyboard operation, logical focus order, and adequate target sizes.
- Do not encode state using color alone.
- Adapt controls for narrow layouts rather than removing critical functionality.
- Keep horizontal work surfaces usable with deliberate overflow and stable column widths.

## Implementation Check

Before finishing:

1. Verify the complete user journey, including empty and populated states.
2. Confirm optimistic UI matches authoritative server data after refresh.
3. Confirm permission-denied and domain-controlled states are understandable.
4. Check keyboard access, focus, labels, and responsive behavior.
5. Run the repository's relevant tests, lint, typecheck, build, and browser verification.
6. Review the result for generic AI styling or unrelated visual drift.
