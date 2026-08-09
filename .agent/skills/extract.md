---
name: extract
description: Pull repeated UI patterns into shared components, tokens, and helpers. Use when the codebase has duplication or when a design system needs stronger reuse.
user-invocable: true
argument-hint: "[target]"
---

Convert repetition into reusable building blocks.

## Focus Areas

- Repeated component markup
- Duplicate style strings or tokens
- Similar logic repeated across pages
- Inconsistent variants of the same pattern

## Method

1. Find repeated structures.
2. Define the stable API for a shared abstraction.
3. Preserve flexibility through variants, not copy-paste.
4. Replace the repeated implementations incrementally.

## Never

- Extract too early when a pattern is not yet stable.
- Create abstract components with unclear purpose.
- Hide important behavior behind confusing prop APIs.

## Success Check

- The codebase has less duplication.
- Reuse improves consistency instead of reducing clarity.
