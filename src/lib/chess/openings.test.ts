import { describe, expect, it } from 'vitest';
import {
	getExpectedOpeningMoves,
	getOpeningLineIndexes,
	getOpenings,
	validateOpeningMove
} from './openings';

describe('validateOpeningMove', () => {
	it('matches moves and narrows active opening lines', () => {
		const opening = getOpenings()[0];
		const lineIndexes = getOpeningLineIndexes(opening);
		const lineOneLastMove = opening.lines[0].moves[13];

		const result = validateOpeningMove(opening, lineOneLastMove, 13, lineIndexes);

		expect(result.valid).toBe(true);
		expect(result.matchedLineIndexes).toEqual([0]);
	});

	it('returns comment-based explanation when move does not match', () => {
		const opening = getOpenings()[0];
		const lineIndexes = getOpeningLineIndexes(opening);
		const wrongMove = opening.lines[0].moves[2];

		const result = validateOpeningMove(opening, wrongMove, 0, lineIndexes);

		expect(result.valid).toBe(false);
		expect(result.errorMessage).toContain("Queen's Pawn Opening");
		expect(result.errorMessage).toContain('Expected d4');
	});

	it('returns no expected move when line is complete', () => {
		const opening = getOpenings()[0];
		const expected = getExpectedOpeningMoves(opening, opening.lines[0].moves.length, [0]);

		expect(expected).toEqual([]);
	});

	it('returns all line indexes and all candidate moves when no active lines are provided', () => {
		const opening = getOpenings()[0];

		expect(getOpeningLineIndexes(opening)).toEqual([0, 1]);

		const expected = getExpectedOpeningMoves(opening, 0, []);
		expect(expected).toHaveLength(2);
		expect(expected.map((entry) => entry.move.algebraic)).toEqual(['d4', 'd4']);
	});

	it('allows free play once the opening line is exhausted', () => {
		const opening = getOpenings()[0];
		const move = opening.lines[0].moves[0];
		const result = validateOpeningMove(opening, move, opening.lines[0].moves.length, [0]);

		expect(result).toEqual({
			valid: true,
			matchedLineIndexes: [0]
		});
	});
});
