---
name: teach-impeccable
description: Gather and persist the audience, use cases, tone, and constraints required by repository design skills when that context is missing.
user-invocable: true
argument-hint: "[product or feature]"
---

Capture reusable design context so future frontend work does not invent product strategy from code.

## Required Context

Collect from the user when it is not already documented:

- Target audience
- Primary use cases or jobs to be done
- Brand personality and tone

Collect visual references, supported devices, accessibility needs, performance constraints, and existing brand assets when relevant.

## Persist It

Create or update `.impeccable.md` with this concise structure:

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

Preserve valid existing context. Record uncertainty as `TBD` rather than guessing. The skill is complete when the minimum context needed by the frontend design workflow is reusable without asking the same foundational questions again.
