export const PieceColor = {
	WHITE: 0 as const,
	BLACK: 1 as const,
	toString: colorToString,
	opposite: oppositeColor
};
export type PieceColor = (typeof PieceColor)[NonFunctionKeys<typeof PieceColor>];
function colorToString(color: PieceColor): string {
	return color === PieceColor.WHITE ? 'white' : 'black';
}
function oppositeColor(color: PieceColor): PieceColor {
	color = 1 - color;
	return color as PieceColor;
}

// TODO: Move all the "basic" stuff here.
export const RANK_CHARS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const;
export type RankChar = (typeof RANK_CHARS)[number];
export const RankChar = {
	is: (row: string): row is RankChar => RANK_CHARS.includes(row as RankChar),
	indexOf: (rank: RankChar): number => RANK_CHARS.indexOf(rank), // -1 if not a rank char
	fromIndex: (index: number): RankChar | null => {
		if (index < 0 || index >= RANK_CHARS.length) return null;
		return RANK_CHARS[index];
	},
	fromIndexOrThrow: (index: number): RankChar => {
		const rank = RankChar.fromIndex(index);
		if (rank == null) throw new Error(`Invalid rank index: ${index}`);
		return rank;
	},
} as const;

export const FILE_CHARS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
export type FileChar = (typeof FILE_CHARS)[number];
export const FileChar = {
	is: (col: string): col is FileChar => FILE_CHARS.includes(col as FileChar),
	indexOf: (file: FileChar): number => FILE_CHARS.indexOf(file), // -1 if not a file char
	fromIndex: (index: number): FileChar | null => {
		if (index < 0 || index >= FILE_CHARS.length) return null;
		return FILE_CHARS[index];
	},
	fromIndexOrThrow: (index: number): FileChar => {
		const file = FileChar.fromIndex(index);
		if (file == null) throw new Error(`Invalid file index: ${index}`);
		return file;
	},
} as const;

export type PositionStr = `${FileChar}${RankChar}`;
export const PositionStr = {
	is: (pos: string): pos is PositionStr => {
		if (pos.length !== 2) return false;
		return FileChar.is(pos[0]) && RankChar.is(pos[1]);
	},
};

export type ChessSquare = number & { __brand: 'ChessSquare' };
export const ChessSquare = {
	fromStr: (pos: string): ChessSquare | null => Ox88.squareFromStr(pos),
} as const;
export type ChessSquareNone = -1;

export const Ox88 = {
	OFF_BOARD: -1 as ChessSquareNone,
	BOARD_SIZE: 128,
	VALID_SQUARE_MASK: 0x88,
	DIRECTION_OFFSETS: { N: -16, S: 16, E: 1, W: -1, NE: -15, NW: -17, SE: 17, SW: 15 },
	ROOK_OFFSETS: [16, -16, 1, -1],
	BISHOP_OFFSETS: [17, 15, -15, -17],
	KING_OFFSETS: [16, -16, 1, -1, 17, 15, -15, -17],
	QUEEN_OFFSETS: [16, -16, 1, -1, 17, 15, -15, -17],
	KNIGHT_OFFSETS: [33, 31, 18, 14, -33, -31, -18, -14],
	PAWN_ATTACK_OFFSETS: { [PieceColor.WHITE]: [-15, -17], [PieceColor.BLACK]: [15, 17] } as Record<PieceColor, number[]>,
	DOUBLE_PAWN_PUSH_RANKS: { WHITE: 1, BLACK: 6 },

	square: (file: number, rank: number): ChessSquare => ((rank << 4) | file) as ChessSquare,
	asSquare: (square: number): ChessSquare => {
		if (!Ox88.isValidSquare(square)) {
			const rank = Ox88.squareRank(square as ChessSquare);
			const file = Ox88.squareFile(square as ChessSquare);
			throw new Error(`Invalid square: ${square} (rank: ${rank}, file: ${file})`);
		}
		return square;
	},
	squareFile: (square: ChessSquare): number => square & 0b111,
	squareRank: (square: ChessSquare): number => square >> 4,
	isValidSquare: (square: number): square is ChessSquare => (square & Ox88.VALID_SQUARE_MASK) === 0,
	isValidFile: (file: number): boolean => file >= 0 && file <= 7,
	isValidRank: (rank: number): boolean => rank >= 0 && rank <= 7,
	sameFile: (square1: ChessSquare, square2: ChessSquare): boolean =>
		Ox88.squareFile(square1) === Ox88.squareFile(square2),
	sameRank: (square1: ChessSquare, square2: ChessSquare): boolean =>
		Ox88.squareRank(square1) === Ox88.squareRank(square2),
	isPromotionSquare: (square: ChessSquare): boolean => {
		const rank = Ox88.squareRank(square);
		return rank === 0 || rank === 7;
	},

	squareFromStr: squareFromStr,

	squareToString(square: number): string {
		// NOTE: It's expected to check for valid square before calling this function.
		if (!Ox88.isValidSquare(square)) {
			return 'off-board';
		}
		const fileIndex = Ox88.squareFile(square);
		const file = String.fromCharCode('a'.charCodeAt(0) + fileIndex);
		const rank = Ox88.squareRank(square);
		return file + (rank + 1).toString();
	},
} as const;

function squareFromStr(pos: PositionStr): ChessSquare;
function squareFromStr(pos: string): ChessSquare | null;
function squareFromStr(pos: string): ChessSquare | null {
	if (pos.length !== 2) return null;
	const file = pos.charCodeAt(0) - 'a'.charCodeAt(0);
	const rank = parseInt(pos[1], 10) - 1;
	if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
	return Ox88.square(file, rank);
};

export const CASTLING_RIGHTS = {
	WHITE_KINGSIDE: 1 << 0,
	WHITE_QUEENSIDE: 1 << 1,
	BLACK_KINGSIDE: 1 << 2,
	BLACK_QUEENSIDE: 1 << 3,
} as const;

export const ALL_CASTLING_RIGHTS =
	CASTLING_RIGHTS.WHITE_KINGSIDE |
	CASTLING_RIGHTS.WHITE_QUEENSIDE |
	CASTLING_RIGHTS.BLACK_KINGSIDE |
	CASTLING_RIGHTS.BLACK_QUEENSIDE;

type NonFunctionKeys<T> = { [P in keyof T]: T[P] extends Function ? never : P }[keyof T];
