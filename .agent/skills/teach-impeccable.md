---
name: teach-impeccable
description: Gather and persist the design context that all design skills depend on. Use before design work when audience, use cases, tone, or brand direction are missing.
user-invocable: true
argument-hint: "[product or feature]"
---

Capture the design context once so every other design skill can reuse it consistently.

## Goal

Create or update a persistent `## Design Context` section that future skills can read from:

- `CLAUDE.md`
- `.impeccable.md`

If both exist, keep them in sync.

## Required Inputs

You must collect these from the user if they are not already available:

- Target audience
- Primary use cases / jobs to be done
- Brand personality / tone

Also collect when relevant:

- Visual references or competitors
- Accessibility constraints
- Performance constraints
- Supported platforms / devices
- Existing brand colors / typography
- What should feel unforgettable about the experience

CRITICAL: Do not infer design context from the codebase alone. Ask for it.

## Output Format

Write a concise, reusable context block like this:

```md
## Design Context

### Audience
- ...

### Use Cases
- ...

### Brand Tone
- ...

### Constraints
- ...

### Visual Direction
- ...
```

## Rules

- Prefer short bullets over long paragraphs.
- Preserve existing valid context and only update what changed.
- If the user is unsure, record that uncertainty explicitly instead of guessing.
- If context is partial, save what is known and mark missing items as `TBD`.

## Completion Criteria

You're done when:

- `CLAUDE.md` or `.impeccable.md` contains a usable `## Design Context` section.
- Future design skills can proceed without re-asking foundational context.

Remember: this skill exists to prevent generic design output. Clear context first, design second.
