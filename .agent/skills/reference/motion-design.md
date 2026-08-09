# Motion Design Reference

## Goals

- Clarify state changes.
- Add feedback without slowing users down.
- Respect reduced-motion preferences.

## Duration Guide

- 100-150ms: Press / toggle feedback
- 200-300ms: Hover / show-hide / menus
- 300-500ms: Panels, accordions, drawers
- 500-800ms: Hero or page entrance moments

## Easing

- Prefer smooth ease-out curves like quart, quint, or expo.
- Exit motion should usually be faster than entrance motion.

## Performance Rules

- Animate `transform` and `opacity` first.
- Avoid animating width, height, top, left, margin, and padding when possible.
- Keep major animations purposeful and limited.

## Accessibility

- Provide reduced-motion fallbacks.
- Do not use animation as the only signal.

## Common Mistakes

- Bounce or elastic easing everywhere
- Long feedback animations
- Animating too many elements at once
