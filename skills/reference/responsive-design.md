# Responsive Design Reference

## Goals

- Adapt, do not just shrink.
- Preserve core functionality across devices.

## Baseline Breakpoints

- Mobile: 320-767px
- Tablet: 768-1023px
- Desktop: 1024px+

Use content-driven breakpoints when layout quality demands it.

## Core Rules

- Touch targets should be at least 44x44px.
- Avoid horizontal scrolling for primary content.
- Reflow navigation and dense layouts to fit device context.
- Test portrait and landscape for mobile and tablet.

## Good Techniques

- Container queries for reusable components
- `clamp()` for fluid spacing and type
- Flexible grids with `minmax()`
- Progressive disclosure on smaller screens

## Avoid

- Hiding important actions on mobile
- Rigid fixed-width layouts
- Hover-only critical interactions
