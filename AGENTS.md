# Opess Project Guidelines

The role of this file is to describe common mistakes and confusion points that agents might encounter as they work in this project. If you ever encounter something in the project that surprises you, please alert the developer working with you and indicate that this is the case in the Agent.md file to help prevent future agents from having the same issue.

Opess is a SvelteKit application for learning chess openings.

## Tooling

- Use `pnpm`; prefer running commands prefixed with `pnpm`.
- The application uses Svelte 5, TypeScript, Vite, and Tailwind CSS 4.
- Use the `$lib` alias for imports from `src/lib`.
- Stop any Vite dev or preview server you start before finishing the task, unless
  the user explicitly asks to leave it running. Do not stop servers you did not start.

## Structure

- `src/lib/chess`: chess state, move generation, notation, FEN/PGN parsing,
  and opening logic.
- `src/lib/components`: reusable board and application UI.
- `src/routes`: SvelteKit pages and application composition.

Keep chess rules and notation independent of the UI. Put reusable domain logic in
`src/lib/chess`, not in Svelte components or route files.

## Validation

Run the narrowest relevant validation first:

- `pnpm test -- <test-file>` for affected unit tests
- `pnpm test` for the complete unit-test suite
- `pnpm lint` for TypeScript and Svelte diagnostics
- `pnpm build` for production and static-rendering changes

The repository may contain unrelated existing failures. Do not fix or reformat
unrelated files; report failures that are outside the scope of the change.

## Unexpected project behavior

- `moveToLongAlgebraic` produces display notation that `calculateMoveFromAlgebraic`
  does not accept for every capture. Use `moveToAlgebraic` with the position before
  the move when feeding formatted moves back into the parser.
- `moveToAlgebraic` needs generated legal moves to disambiguate SAN correctly.
  After loading a fresh board from FEN, call `generateLegalMoves` before formatting.

This file should document recurring mistakes, non-obvious behavior, and common sources of confusion for agents working in this repository.

If, during normal work, an assumption about the project turns out to be wrong, or you encounter project-specific behavior that required non-obvious investigation to understand:

1. Tell the developer what was unexpected and why.
2. Suggest adding a short note to `AGENTS.md` if it is likely to help future agents.
3. Do not add one-off task details, speculation, or information already documented elsewhere.
