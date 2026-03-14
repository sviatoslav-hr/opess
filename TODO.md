# TODO

## Features
- [ ] Show score (piece difference)
- [ ] Board should rotate accordingly to the current color (but also respect the rotation button)
- [ ] When doing an illegal move, show a visual feedback why that move is invalid (highlight some squares?)

## Refactoring

- [ ] Move game/trainer orchestration out of `src/routes/+page.svelte` into a dedicated controller/store. The page currently owns board state, opening validation, auto-play sequencing, alerts, and layout, which will make future board changes harder than necessary.

## Optimizations

Look into [0x88 algorithm](https://www.chessprogramming.org/0x88).

## Engine correctness

- [ ] Fix castling validation. Castling currently appears to rely on path clearance and rights only; it should also reject castling while in check, through check, or into check.
- [ ] Fix castling application so it does not create a rook if the rook is missing from the board. Castling should only be legal when the correct rook is actually present.
- [ ] Update castling rights when a rook is captured on its home square. Right now castling rights appear to change only when the rook moves.
- [ ] Add focused move-legality tests for castling, check detection, en passant, promotion, and pinned pieces. Current tests cover PGN/opening parsing more than engine correctness.

## FEN and notation

- [ ] Make FEN round-trip correctly. `boardToFen` currently writes non-standard turn values (`white`/`black`) while `parseFen` expects standard FEN values (`w`/`b`), which can break state restored from the textarea.
- [ ] Expand FEN validation to cover all fields, not just piece placement. The validator should check active color, castling rights, en passant target, halfmove clock, and fullmove number.

## Board UX and rendering

- [ ] Rework board input handling to use pointer-driven interactions instead of native HTML drag-and-drop. Pointer events will likely be simpler to control, easier to animate, and better suited for touch devices.
- [ ] Make the board layout responsive instead of relying on fixed `80px` tiles. This will improve usability on smaller screens and make future rendering changes less invasive.
- [ ] Delay any full canvas rewrite until the engine and interaction model are cleaned up. The current performance risk is more about move generation architecture than DOM rendering.
