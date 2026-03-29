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
	pgn: string;
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
		const extendsPreviousLinePrefix = ';...';
		const lines: OpeningLine[] = [];
		for (let [index, lineStr] of params.lines.entries()) {
			if (lineStr.startsWith(extendsPreviousLinePrefix)) {
				lineStr = lineStr.substring(extendsPreviousLinePrefix.length).trim();
				const prevLineStr = lines[index - 1].pgn;
				if (!prevLineStr) {
					const msg = `Line ${index} (${params.name}) starts with ';...' but there is no previous line to inherit from.`;
					throw new Error(msg);
				}
				const newMoveNumber = parseInt(lineStr.split('.')[0]);
				if (isNaN(newMoveNumber)) {
					const msg = `Line ${index} (${params.name}) starts with ';...' but does not specify a valid move number. Line: "${lineStr}"`;
					throw new Error(msg);
				}
				const prevLineSplit = prevLineStr.split('\n');
				const prevMoveIndex = prevLineSplit.findIndex((part) =>
					part.trimStart().startsWith(`${newMoveNumber - 1}.`)
				);
				if (prevMoveIndex === -1) {
					const msg = `Line ${index} (${params.name}) starts with ';...' and specifies move number ${newMoveNumber}, but the previous line does not contain that move number. Line: "${lineStr}" Previous line: "${prevLineStr}"`;
					throw new Error(msg);
				}
				const commonLineStr = prevLineSplit.slice(0, prevMoveIndex + 1).join('\n');
				lineStr = `${commonLineStr}\n${lineStr}`;
			}
			const { moves, tags } = parsePGNMoves(lineStr);
			const name = tags['Name'] ? tags['Name'] + ` [${index + 1}]` : `Line ${index + 1}`;
			lines.push({ name, moves, pgn: lineStr });
		}
		const opening: Opening = { name: params.name, color: params.color, lines };
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
[Name "Main line, Queen's Gambit Declined: Modern Variation"]
1. d4 {Queen's Pawn Opening} d5 {Black responds with Queen's Pawn Defense}
2. c4 {Best move: Taking control of the center} c6
3. Nf3 {Developing knight to f3} Nf6
4. Nc3 {Developing knight to c3} e6
5. Bg5 {Developing bishop to g5, pinning the knight} Nbd7
6. e3 {Supporting the d4 pawn and preparing to develop the dark-squared bishop} Be7
7. Bd3 {Developing bishop to d3, aiming at h7} dxc4 {Black captures the pawn on c4, challenging White's control of the center}
8. Bxc4 {Recapturing the pawn on c4 with the bishop, maintaining central presence} b5 {Black tries to expand on the queenside and gain space, attacking the bishop}
9. Bd3 {Retreating the bishop to d3, keeping it active and eyeing h7} Bb7 {Black develops the bishop}
10. O-O {White castles, ensuring king safety and connecting the rooks}
`,
	`;...
10. Rc1 {White develops the rook, preparing to challenge the c-file}
`,
	// NOTE: [9. Bb3] is worse than [9. Bd3] because it gives Black the option to play ...a5, gaining space on the queenside
	`;...
9. Bd3 {Retreating the bishop to d3, keeping it active and eyeing h7} O-O {Black castles, ensuring king safety}
10. O-O {White castles, ensuring king safety and connecting the rooks}
`,
	`;...
10. Rc1 {White develops the rook, preparing to challenge the c-file}
`,
	`;...
8. Bxc4 {Recapturing the pawn on c4 with the bishop, maintaining central presence} O-O {Black castles, ensuring king safety}
9. O-O {White castles, ensuring king safety} h6 {Black challenges the bishop on g5, trying to break the pin on the knight}
10. Bh4 {White retreats the bishop to h4, maintaining the pin on the knight and keeping pressure on}
`,
	`;...
10. Bf4 {White retreats the bishop to f4, keeping it active and maintaining pressure on the center}
`,
	`;...
9. O-O {White castles, ensuring king safety} Nd5 {Black develops the knight to d5, challenging White's control of the center and preparing to exchange pieces}
10. Bxe7 {White captures the bishop on e7, simplifying the position and maintaining central control}
`,
	`;...
9. O-O {White castles, ensuring king safety} b5 {Black tries to expand on the queenside and gain space, attacking the bishop}
10. Bd3 {White retreats the bishop to d3, keeping it active and maintaining pressure on the center}
`,
	`;...
9. O-O {White castles, ensuring king safety} c5 {Black strikes at the center, challenging White's control and trying to open lines for the pieces}
10. dxc5 {White captures the pawn on c5, maintaining material balance and opening lines for the pieces}
`,
	`;...
9. O-O {White castles, ensuring king safety} a6 {Black prepares to expand on the queenside and gain space, supporting a potential ...b5 push}
10. e4 {White strikes at the center, preparing to attack knight on f6 and gain space in the center}
`,
	`;...
8. Bxc4 {Recapturing the pawn on c4 with the bishop, maintaining central presence} Nd5 {Black develops the knight to d5, challenging White's control of the center and preparing to exchange pieces}
9. Bxe7 {White captures the bishop on e7, simplifying the position and maintaining central control} Qxe7 {Black recaptures the bishop on e7}
10. O-O {White castles, ensuring king safety}
`,
	`;...
8. Bxc4 {Recapturing the pawn on c4 with the bishop, maintaining central presence} Nb6 {Black develops the knight to b6, attacking the bishop and trying to gain control of the c4 square}
9. Bd3 {Retreating the bishop to d3, keeping it active and eyeing h7} O-O {Black castles, ensuring king safety}
10. O-O {White castles, ensuring king safety}
`,
	`;...
9. Bd3 {Retreating the bishop to d3, keeping it active and eyeing h7} Nfd5 {Black develops the knight to d5, challenging White's control of the center and preparing to exchange pieces}
10. Bxe7 {White captures the bishop on e7, simplifying the position and maintaining central control}
`,
	`;...
9. Bd3 {Retreating the bishop to d3, keeping it active and eyeing h7} Nbd5 {Black develops the knight to d5, challenging White's control of the center and preparing to exchange pieces}
10. O-O {White castles, ensuring king safety}
`,
	`;...
8. Bxc4 {Recapturing the pawn on c4 with the bishop, maintaining central presence} Qa5 {Black develops the queen to a5, pinning the knight on c3 and eyeing the g5 bishop}
9. O-O {White castles, ensuring king safety} O-O {Black castles, ensuring king safety}
10. a3 {White prepares to challenge the queen on a5}
`,
	`;...
9. O-O {White castles, ensuring king safety} h6 {Black challenges the bishop on g5, trying to break the pin on the knight}
10. Bh4 {White retreats the bishop to h4, maintaining the pin on the knight and keeping pressure on}
`,
	`;...
9. O-O {White castles, ensuring king safety} Nb6 {Black moves the king to b6, attacking the bishop on c4 and trying to gain control of the c4 square}
10. Bd3 {White retreats the bishop to d3, keeping it active and eyeing h7}
`,
	`;...
9. O-O {White castles, ensuring king safety} Nh5 {Black moves the knight to h5 by mistake, allowing White to take the bishop and forcing Black to lose castling rights}
10. Bxe7 {White captures the bishop on e5, forcing Black to lose castling rights}
`,
	`;...
9. O-O {White castles, ensuring king safety} Ng4 {Black moves the knight to g4 by mistake, allowing White to take the bishop and forcing Black to lose castling rights}
10. Bxe7 {White captures the bishop on e5, forcing Black to lose castling rights}
`,
	`;...
9. O-O {White castles, ensuring king safety} b5 {Black tries to expand on the queenside and gain space, attacking the bishop}
10. Bd3 {White retreats the bishop to d3, keeping it active and eyeing h7}
`,
	`;...
7. Bd3 {Developing bishop to d3, aiming at h7} h6 {Black challenges the bishop on g5, trying to break the pin on the knight}
8. Bh4 {White retreats the bishop to h4, maintaining the pin on the knight and keeping pressure on} dxc4 {Black captures the pawn on c4, challenging White's control of the center and trying to open lines for the pieces}
9. Bxc4 {Recapturing the pawn on c4 with the bishop, maintaining central presence} b5 {Black tries to expand on the queenside and gain space, attacking the bishop}
10. Bd3 {White retreats the bishop to d3, keeping it active and maintaining pressure on the center}
`,
	`;...
9. Bxc4 {Recapturing the pawn on c4 with the bishop, maintaining central presence} c5 {Black strikes at the center, challenging White's control and trying to open lines for the pieces}
10. dxc5 {White captures the pawn on c5, maintaining material balance and opening lines for the pieces}
`,
	`;...
9. Bxc4 {Recapturing the pawn on c4 with the bishop, maintaining central presence} g5 {Black tries to kick the bishop on h4 by mistake, this weakens Black's kingside and allows White to gain a strong attack}
10. Bg3 {Retreating the bishop back to a safe square}
`,
	`;...
9. Bxc4 {Recapturing the pawn on c4 with the bishop, maintaining central presence} Nh5 {Black moves the knight, opening an attack on h4 bishop and preventing it from retreating to g3}
10. Bxe7 {White captures the bishop on e7, simplifying the position}
`,
	// NOTE: Here for some reason its better to retreat back instead of taking on e7, not sure why though...
	`;...
9. Bxc4 {Recapturing the pawn on c4 with the bishop, maintaining central presence} Nd5 {Black develops the knight to d5, challenging White's control of the center and preparing to exchange pieces}
10. Bg3 {Retreating the bishop back and maintaining the pressure}
`,
	`;...
9. Bxc4 {Recapturing the pawn on c4 with the bishop, maintaining central presence} Ng4 {Black moves the knight to g4, opening the attack on h4 bishop}
10. Bg3 {Retreating the bishop back and maintaining the pressure}
`,
	`;...
9. Bxc4 {Recapturing the pawn on c4 with the bishop, maintaining central presence} Nb6 {Black moves the king to b6, attacking the bishop on c4 and trying to gain control of the c4 square}
10. Bd3 {White retreats the bishop to d3, keeping it active and maintaining pressure on the center}
`,
	`;...
9. Bxc4 {Recapturing the pawn on c4 with the bishop, maintaining central presence} O-O {Black castles, ensuring king safety}
10. O-O {White castles, ensuring king safety}
`
	// TODO: Add 7. Bd3 O-O line
].map((line) => line.trim());
