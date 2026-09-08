import { describe, expect, it } from 'vitest';

import { moveToLongAlgebraic } from '$lib/chess/algebraic';
import { PieceColor } from '$lib/chess/basic';
import {
	getExpectedOpeningMoves,
	getOpeningLineIndexes,
	getOpenings,
	type Opening,
	validateOpeningMove,
} from '$lib/chess/openings';
import { PGN, type PGNMovesLine } from '$lib/chess/pgn';

const opening: Opening = {
	name: 'Test Opening',
	color: PieceColor.WHITE,
	lines: [
		makeLine('Knight branch', '1. e4 e5 2. Nf3 {Develop the knight} Nc6'),
		makeLine('Italian branch', '1. e4 e5 2. Bc4 Nc6'),
		makeLine('Petrov branch', '1. e4 e5 2. Nf3 {Develop the knight} Nf6'),
	],
};

function parseMoves(pgn: string): PGNMovesLine {
	const [result, error] = PGN.parseMoves(pgn);
	if (error) throw new Error(`Failed to parse test PGN: ${JSON.stringify(error)}`);
	return result;
}

function makeLine(name: string, pgn: string): Opening['lines'][number] {
	const { moves, nodes } = parseMoves(pgn);
	return { name, pgn, moves, nodes };
}

function notationAt(lineIndex: number, moveIndex: number): string {
	return moveToLongAlgebraic(opening.lines[lineIndex].moves[moveIndex]);
}

describe('opening move expectations', () => {
	it('returns candidates from every line when no active lines are provided', () => {
		expect(getOpeningLineIndexes(opening)).toEqual([0, 1, 2]);

		const expected = getExpectedOpeningMoves(opening, 2, []);

		expect(expected.map(({ lineIndex }) => lineIndex)).toEqual([0, 1, 2]);
		expect(expected.map(({ move }) => moveToLongAlgebraic(move))).toEqual([
			'Ng1f3',
			'Bf1c4',
			'Ng1f3',
		]);
	});

	it('returns no expected move after an active line is complete', () => {
		expect(getExpectedOpeningMoves(opening, opening.lines[0].moves.length, [0])).toEqual([]);
	});

	it('ignores invalid line indexes', () => {
		const expected = getExpectedOpeningMoves(opening, 2, [-1, 1, 99]);

		expect(expected).toHaveLength(1);
		expect(expected[0].lineIndex).toBe(1);
		expect(moveToLongAlgebraic(expected[0].move)).toBe('Bf1c4');
	});
});

describe('validateOpeningMove', () => {
	it('falls back to all lines and retains them while moves share a prefix', () => {
		const result = validateOpeningMove(opening, opening.lines[0].moves[1], 1, []);

		expect(result).toEqual({ valid: true, matchedLineIndexes: [0, 1, 2] });
	});

	it('narrows active lines at a divergence', () => {
		const result = validateOpeningMove(opening, opening.lines[1].moves[2], 2, [0, 1, 2]);

		expect(notationAt(1, 2)).toBe('Bf1c4');
		expect(result).toEqual({ valid: true, matchedLineIndexes: [1] });
	});

	it('retains every matching line index for a duplicate expected move', () => {
		const result = validateOpeningMove(opening, opening.lines[0].moves[2], 2, [0, 1, 2]);

		expect(result).toEqual({ valid: true, matchedLineIndexes: [0, 2] });
	});

	it('allows free play after the active line is complete', () => {
		const result = validateOpeningMove(
			opening,
			opening.lines[0].moves[0],
			opening.lines[0].moves.length,
			[0]
		);

		expect(result).toEqual({ valid: true, matchedLineIndexes: [0] });
	});

	it('formats mismatch errors with comments, line names, and deduplicated hints', () => {
		const wrongMove = parseMoves('1. d4').moves[0];

		const result = validateOpeningMove(opening, wrongMove, 2, [0, 1, 2]);

		expect(result).toEqual({
			valid: false,
			matchedLineIndexes: [0, 1, 2],
			errorMessage:
				'Move "d4" does not match Test Opening. Expected Ng1f3 (Develop the knight) or Bf1c4 (Italian branch).',
		});
	});
});

describe('production openings', () => {
	it('parses every opening line and gives it moves', () => {
		const openings = getOpenings();

		expect(openings.length).toBeGreaterThan(0);
		for (const productionOpening of openings) {
			expect(productionOpening.lines.length, productionOpening.name).toBeGreaterThan(0);
			for (const line of productionOpening.lines) {
				expect(line.moves.length, `${productionOpening.name}: ${line.name}`).toBeGreaterThan(0);
				expect(parseMoves(line.pgn).moves.length, `${productionOpening.name}: ${line.name}`).toBe(
					line.moves.length
				);
			}
		}
	});
});
