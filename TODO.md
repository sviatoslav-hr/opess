# TODO

## Features
- [ ] When opponent move is autoplayed, add transition animation to it (intead of immediate change)
- [ ] Show the history of moves.
- [ ] Add undo feature
- [x] Make square highlighting better (source, target, allowed, etc.)
- [ ] Show score (piece difference)
- [ ] Board should rotate accordingly to the current color (but also respect the rotation button)
- [ ] When doing an illegal move, show a visual feedback why that move is invalid (highlight some squares?)
- [x] En-passant capturing doesn't work.
- [x] Pawn doesn't auto-promote to queen.
- [x] Check should force you to make your king safe (block, move king, etc.). You should not be able to do any other move.
- [x] Pinned to king pieces should not be able to move.
- [x] On every move calculate all possible moves for every piece to highlight them on a board. (Could also be useful for validation).

## Refactoring

- [ ] Rewrite fillAllowedMoves function.

## Optimizations

Look into [0x88 algorithm](https://www.chessprogramming.org/0x88).
