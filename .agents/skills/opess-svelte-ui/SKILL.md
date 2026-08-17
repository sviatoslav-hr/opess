---
name: opess-svelte-ui
description: Use when you need to create or modify Opess Svelte components, routes, styling, forms, board interactions, and other browser UI.
---

# Opess Svelte UI

Use this skill for UI work in `src/lib/components`, `src/routes`, and `src/app.css`.

## Component boundaries

- Put reusable UI in `src/lib/components`.
- Keep route components focused on page composition and feature orchestration.
- Keep chess rules, notation, and reusable opening logic in `src/lib/chess`. Components may call that logic but must not reimplement it.
- Before creating a component, check whether an existing component can be extended without making its API unclear.

## Svelte conventions

- Use Svelte 5 runes and event properties; do not introduce legacy reactive statements or `createEventDispatcher`.
- Define a typed `Props` interface and destructure props from `$props()`.
- Use callback props for component events and `Snippet` for renderable children.
- Use `$bindable` only when two-way binding is part of the component's intended public API.
- Use `$derived` for values computed from props or state. Do not initialize a normal variable from reactive props when it must update with them.
- Keep state local unless multiple components need to coordinate it. Lift shared state to the nearest feature owner rather than adding global state by default.

## Styling and interaction

- Use Tailwind utility classes and `cn` from `$lib/utils` for conditional or caller-supplied classes.
- Accept a `class?: string` prop on reusable visual components when callers need layout or appearance overrides.
- Preserve the existing visual language unless the task explicitly changes the design.
- Prefer semantic HTML and native controls. Ensure custom interactions support keyboard use, focus, and appropriate ARIA attributes.
- Make new layouts responsive; do not add fixed board or viewport dimensions unless the behavior requires them.

## Browser lifecycle

- Remember that the app is statically prerendered. Guard browser-only globals or access them from browser-only lifecycle code.
- Clean up timers, animation frames, listeners, observers, and temporary DOM nodes when a component is destroyed or an interaction ends.
