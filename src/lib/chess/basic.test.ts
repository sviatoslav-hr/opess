import { describe, expect, it } from 'vitest';

import { FileChar, Ox88, PositionStr, RankChar } from '$lib/chess/basic';

describe('chess/basic', () => {
	it('0x88', () => {
		const a1 = Ox88.square(0, 0);
		const e4 = Ox88.square(4, 3);
		const h8 = Ox88.square(7, 7);

		expect(a1).toBe(0x00);
		expect(e4).toBe(0x34);
		expect(h8).toBe(0x77);

		expect(Ox88.squareFile(e4)).toBe(4);
		expect(Ox88.squareRank(e4)).toBe(3);

		expect(Ox88.isValidSquare(a1)).toBe(true);
		expect(Ox88.isValidSquare(h8)).toBe(true);
		expect(Ox88.isValidSquare(0x08)).toBe(false);
		expect(Ox88.isValidSquare(0x80)).toBe(false);

		expect(Ox88.isValidFile(0)).toBe(true);
		expect(Ox88.isValidFile(7)).toBe(true);
		expect(Ox88.isValidFile(-1)).toBe(false);
		expect(Ox88.isValidFile(8)).toBe(false);

		expect(Ox88.isValidRank(0)).toBe(true);
		expect(Ox88.isValidRank(7)).toBe(true);
		expect(Ox88.isValidRank(-1)).toBe(false);
		expect(Ox88.isValidRank(8)).toBe(false);

		expect(Ox88.sameFile(a1, Ox88.square(0, 7))).toBe(true);
		expect(Ox88.sameFile(a1, Ox88.square(1, 0))).toBe(false);
		expect(Ox88.sameRank(a1, Ox88.square(7, 0))).toBe(true);
		expect(Ox88.sameRank(a1, Ox88.square(0, 1))).toBe(false);

		expect(Ox88.squareFromStr('e4')).toBe(e4);
		expect(Ox88.squareFromStr('')).toBeNull();
		expect(Ox88.squareFromStr('a')).toBeNull();
		expect(Ox88.squareFromStr('a10')).toBeNull();
		expect(Ox88.squareFromStr('A1')).toBeNull();
		expect(Ox88.squareFromStr('i1')).toBeNull();
		expect(Ox88.squareFromStr('a0')).toBeNull();
		expect(Ox88.squareFromStr('a9')).toBeNull();
		expect(Ox88.squareFromStr('a1')).toBe(a1);
		expect(Ox88.squareFromStr('h8')).toBe(h8);

		expect(Ox88.squareToString(a1)).toBe('a1');
		expect(Ox88.squareToString(h8)).toBe('h8');
		expect(Ox88.squareToString(0x08)).toBe('off-board');
		expect(Ox88.squareToString(Ox88.OFF_BOARD)).toBe('off-board');
	});

	it('validates files, ranks, and positions', () => {
		expect(FileChar.is('a')).toBe(true);
		expect(FileChar.is('z')).toBe(false);
		expect(RankChar.is('1')).toBe(true);
		expect(RankChar.is('0')).toBe(false);
		expect(RankChar.is('8')).toBe(true);
		expect(RankChar.is('9')).toBe(false);
		expect(PositionStr.is('b7')).toBe(true);
		expect(PositionStr.is('q1')).toBe(false);
		expect(PositionStr.is('c0')).toBe(false);
	});
});
