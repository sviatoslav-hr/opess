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
});
