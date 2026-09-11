# TODO

## Short-term

- [ ] Make short algebraic work in move history and in the Editor
- [ ] Check if editor works fine.
- [ ] Add export to PGN string from PGN nodes.
- [ ] Define Opening service layer in `$lib/chess` to manage openings.
- [ ] Move graph logic into `$lib/chess`

## Long-term

- [ ] Use chess board for manipulating the opening tree in the editor instead of custom node thing.
- [ ] When player tries to do an invalid move, highlight why is it invalid.

## Features

- Add restart/continue button when finished the opening
- [ ] Openings Editor
  - [ ] 2d editor that has opening visualized as a directed graph, where positions are nodes and moves are edges
  - [ ] To simplify, tree structure may be used instead of a graph
  - [ ] User should be able to add new moves
  - [ ] Nodes (positions) should be created automatically based on the move
  - [ ] Additional: If such position already exists, link it instead of creating a new node
- [ ] Show taken pieces and score (piece difference)
- [ ] Board should rotate accordingly to the current color (but also respect the rotation button)
- [ ] When doing an illegal move, show a visual feedback why that move is invalid (highlight some squares?)

## Refactoring

- [ ] Move game/trainer orchestration out of `src/routes/+page.svelte` into a dedicated controller/store. The page currently owns board state, opening validation, auto-play sequencing, alerts, and layout, which will make future board changes harder than necessary.
- [ ] Use one shared opening model for both the trainer and editor. The editor currently mutates only an internal tree, while the trainer reads `OpeningLine[]`; changes from the editor should update the same source of truth that the board uses.
- [ ] Move the editor `OpeningTree` types/building logic out of `Editor.svelte` into the chess/openings layer so board validation, editor rendering, import, and export all use the same compiled structure.
- [ ] Fix editor insertion parent links. `insertMove` currently pushes the new node into its own `prevMoves`; it should link to the parent node.
- [ ] Let the editor open the selected/current opening instead of always using `openings[0]`.

## Optimizations

- [ ] Split legal-move highlighting from full move creation. `getLegalMovesFrom` currently scans all 64 targets and builds full `Move` objects, including FEN/SAN work; highlight-only paths should generate pseudo-legal targets and run only the needed king-safety checks.
- [ ] Add a cheap `isSquareAttacked` helper and use it for king safety/castling instead of recursively calculating full opponent moves.
- [ ] Compile openings into a trie/tree with fast child lookups, such as `nextBySan`, `nextByMoveKey`, or `nextByFen`. Runtime trainer logic should not scan many duplicated PGN lines for every move.

## Engine correctness

- [ ] Fix castling validation. Castling currently appears to rely on path clearance and rights only; it should also reject castling while in check, through check, or into check.
- [ ] Fix castling application so it does not create a rook if the rook is missing from the board. Castling should only be legal when the correct rook is actually present.
- [ ] Update castling rights when a rook is captured on its home square. Right now castling rights appear to change only when the rook moves.
- [ ] Ensure queen-side castling checks every required empty square, including `b1`/`b8` where appropriate.
- [ ] Stop bypassing king-safety validation when importing PGN/algebraic moves. `calculateMoveFromAlgebraic` currently uses `ignoreAllowed: true` for pawn moves and castling, which can let illegal opening data into the trainer.
- [ ] Add focused move-legality tests for castling, check detection, en passant, promotion, and pinned pieces. Current tests cover PGN/opening parsing more than engine correctness.

## Board UX and rendering

- [ ] Cancel the editor animation frame loop when the editor component is destroyed. Switching between board and editor currently can leave old `requestAnimationFrame` loops running.
- [ ] Rework board input handling to use pointer-driven interactions instead of native HTML drag-and-drop. Pointer events will likely be simpler to control, easier to animate, and better suited for touch devices.
- [ ] Make the board layout responsive instead of relying on fixed `80px` tiles. This will improve usability on smaller screens and make future rendering changes less invasive.
- [ ] Delay any full canvas rewrite until the engine and interaction model are cleaned up. The current performance risk is more about move generation architecture than DOM rendering.

## Tests

Implement current `it.todo(...)` in tests.
