import type { PlayerColor } from '$lib/chess/board';
import type { Move } from '$lib/chess/moves';

export interface Opening {
	name: string;
	color: PlayerColor;
	lines: OpeningLine[];
}

export interface OpeningLine {
	name: string;
	moves: Move[];
}

export const londonSystemPgn = `
[Name "London System"]
1. d4 {Queen's Pawn Opening} d5 {Black responds with Queen's Pawn Defense}
2. c4 {Best move: Taking control of the center} c6
3. Nf3 {Developing knight to f3} Nf6
4. Nc3 {Developing knight to c3} e6
5. Bg5 {Developing bishop to g5, pinning the knight} Nbd7
6. e3 {Supporting the d4 pawn and preparing to develop the dark-squared bishop} Be7
7. Bd3 {Developing bishop to d3, aiming at h7} O-O
`.trim();

export const fullTestPgn = `
[Name "Full test for PGN format"]
1. a4 h5
2. a5 h4
3. a6 h3
4. axb7 hxg2
5. bxa8=Q gxh1=Q
6. e4 e6
7. e5 d5
8. exd6 Bxd6
9. Nc3 Nf6
10. Be3 O-O
11. Qf3 Nc6
12. O-O-O Qxd1+
13. Qxd1 Bb7
14. Nf3 Nd5
15. Nb5 Nbd4
`.trim();
