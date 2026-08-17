import { describe, expect, it } from 'vitest';

import { ChessSquare, FileChar, Ox88, RankChar } from '$lib/chess/basic';

describe('chess/basic', () => {
	it('0x88', () => {
		const a1 = ChessSquare.from(0, 0);
		const e4 = ChessSquare.from(4, 3);
		const h8 = ChessSquare.from(7, 7);

		expect(a1).toBe(0x00);
		expect(e4).toBe(0x34);
		expect(h8).toBe(0x77);

		expect(ChessSquare.fileOf(e4)).toBe(4);
		expect(ChessSquare.rankOf(e4)).toBe(3);

		expect(ChessSquare.is(a1)).toBe(true);
		expect(ChessSquare.is(h8)).toBe(true);
		expect(ChessSquare.is(0x08)).toBe(false);
		expect(ChessSquare.is(0x80)).toBe(false);

		expect(ChessSquare.isFile(0)).toBe(true);
		expect(ChessSquare.isFile(7)).toBe(true);
		expect(ChessSquare.isFile(-1)).toBe(false);
		expect(ChessSquare.isFile(8)).toBe(false);

		expect(ChessSquare.isRank(0)).toBe(true);
		expect(ChessSquare.isRank(7)).toBe(true);
		expect(ChessSquare.isRank(-1)).toBe(false);
		expect(ChessSquare.isRank(8)).toBe(false);

		expect(ChessSquare.sameFile(a1, ChessSquare.from(0, 7))).toBe(true);
		expect(ChessSquare.sameFile(a1, ChessSquare.from(1, 0))).toBe(false);
		expect(ChessSquare.sameRank(a1, ChessSquare.from(7, 0))).toBe(true);
		expect(ChessSquare.sameRank(a1, ChessSquare.from(0, 1))).toBe(false);

		expect(ChessSquare.parse('e4')).toBe(e4);
		expect(ChessSquare.parse('')).toBeNull();
		expect(ChessSquare.parse('a')).toBeNull();
		expect(ChessSquare.parse('a10')).toBeNull();
		expect(ChessSquare.parse('A1')).toBeNull();
		expect(ChessSquare.parse('i1')).toBeNull();
		expect(ChessSquare.parse('a0')).toBeNull();
		expect(ChessSquare.parse('a9')).toBeNull();
		expect(ChessSquare.parse('a1')).toBe(a1);
		expect(ChessSquare.parse('h8')).toBe(h8);

		expect(ChessSquare.toString(a1)).toBe('a1');
		expect(ChessSquare.toString(h8)).toBe('h8');
		expect(ChessSquare.toString(0x08 as ChessSquare)).toBe('off-board');
		expect(ChessSquare.toString(Ox88.OFF_BOARD as ChessSquare)).toBe('off-board');
	});

	it('validates files, ranks, and positions', () => {
		expect(FileChar.is('a')).toBe(true);
		expect(FileChar.is('z')).toBe(false);
		expect(RankChar.is('1')).toBe(true);
		expect(RankChar.is('0')).toBe(false);
		expect(RankChar.is('8')).toBe(true);
		expect(RankChar.is('9')).toBe(false);
		expect(ChessSquare.isStr('b7')).toBe(true);
		expect(ChessSquare.isStr('q1')).toBe(false);
		expect(ChessSquare.isStr('c0')).toBe(false);
	});
});
