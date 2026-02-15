import type { PlayerColor } from '$lib/chess/board';
import type { Move } from '$lib/chess/moves';
import { parsePGNMoves } from '$lib/chess/pgn';

export interface Opening {
	name: string;
	fen?: string;
	color: PlayerColor;
	lines: OpeningLine[];
}

export interface OpeningLine {
	name: string;
	moves: Move[];
}

export function getOpenings(): Opening[] {
	const openings: Opening[] = [];

	addOpening({
		name: 'London System',
		color: 'white',
		lines: londonSystemLines
	});

	type OpeningParams = Omit<Opening, 'lines'> & { lines: string[] };
	function addOpening(params: OpeningParams): void {
		const { name, color, lines: linesRaw } = params;
		const lines: OpeningLine[] = linesRaw.map((lineStr, index) => {
			const { moves, tags } = parsePGNMoves(lineStr);
			const name = tags['Name'] || `Line ${index + 1}`;
			return { name, moves };
		});
		const opening: Opening = { name, color, lines };
		openings.push(opening);
	}
	return openings;
}

const londonSystemLines = [
	`
[Name "London System 1"]
1. d4 {Queen's Pawn Opening} d5 {Black responds with Queen's Pawn Defense}
2. c4 {Best move: Taking control of the center} c6
3. Nf3 {Developing knight to f3} Nf6
4. Nc3 {Developing knight to c3} e6
5. Bg5 {Developing bishop to g5, pinning the knight} Nbd7
6. e3 {Supporting the d4 pawn and preparing to develop the dark-squared bishop} Be7
7. Bd3 {Developing bishop to d3, aiming at h7} O-O
`,
	`
[Name "London System 2"]
1. d4 {Queen's Pawn Opening} d5 {Black responds with Queen's Pawn Defense}
2. c4 {Best move: Taking control of the center} c6
3. Nf3 {Developing knight to f3} Nf6
4. Nc3 {Developing knight to c3} e6
5. Bg5 {Developing bishop to g5, pinning the knight} Nbd7
6. e3 {Supporting the d4 pawn and preparing to develop the dark-squared bishop} Be7
7. Bd3 {Developing bishop to d3, aiming at h7} dxc4 {Black captures the pawn on c4, challenging White's control of the center}
`
].map((line) => line.trim());
