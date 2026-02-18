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

export interface OpeningMoveValidationResult {
	valid: boolean;
	matchedLineIndexes: number[];
	errorMessage?: string;
}

export interface ExpectedOpeningMove {
	lineIndex: number;
	lineName: string;
	move: Move;
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

export function getOpeningLineIndexes(opening: Opening): number[] {
	return opening.lines.map((_, index) => index);
}

export function validateOpeningMove(
	opening: Opening,
	move: Move,
	moveIndex: number,
	activeLineIndexes: number[]
): OpeningMoveValidationResult {
	const lineIndexes =
		activeLineIndexes.length > 0 ? activeLineIndexes : getOpeningLineIndexes(opening);
	const expectedMoves = getExpectedOpeningMoves(opening, moveIndex, lineIndexes);

	// Opening line is finished, allow free play.
	if (expectedMoves.length === 0) {
		return { valid: true, matchedLineIndexes: lineIndexes };
	}

	const matchedMoves = expectedMoves.filter((expected) => isSameMove(expected.move, move));
	if (matchedMoves.length > 0) {
		return {
			valid: true,
			matchedLineIndexes: matchedMoves.map((match) => match.lineIndex)
		};
	}

	return {
		valid: false,
		matchedLineIndexes: lineIndexes,
		errorMessage: formatOpeningMoveMismatchError(opening.name, move, expectedMoves)
	};
}

export function getExpectedOpeningMoves(
	opening: Opening,
	moveIndex: number,
	activeLineIndexes: number[]
): ExpectedOpeningMove[] {
	const lineIndexes =
		activeLineIndexes.length > 0 ? activeLineIndexes : getOpeningLineIndexes(opening);
	return lineIndexes
		.map((lineIndex) => {
			const line = opening.lines[lineIndex];
			const expectedMove = line?.moves[moveIndex];
			if (!line || !expectedMove) return null;
			return { lineIndex, lineName: line.name, move: expectedMove };
		})
		.filter((entry): entry is ExpectedOpeningMove => entry !== null);
}

function isSameMove(a: Move, b: Move): boolean {
	return (
		a.from.equals(b.from) &&
		a.to.equals(b.to) &&
		a.castling === b.castling &&
		a.promotion === b.promotion
	);
}

function formatOpeningMoveMismatchError(
	openingName: string,
	actualMove: Move,
	expectedMoves: ExpectedOpeningMove[]
): string {
	const expectedMoveHints = Array.from(
		new Set(
			expectedMoves.map(({ lineName, move }) => {
				const comment = move.comment?.trim();
				if (comment) return `${move.algebraic} (${comment})`;
				if (expectedMoves.length > 1) return `${move.algebraic} (${lineName})`;
				return move.algebraic;
			})
		)
	);
	const expectedStr = expectedMoveHints.join(' or ');
	return `Move "${actualMove.algebraic}" does not match ${openingName}. Expected ${expectedStr}.`;
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
