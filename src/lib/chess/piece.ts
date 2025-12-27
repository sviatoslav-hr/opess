import { PlayerColor } from '$lib/chess/board';

export const PieceId = {
	// NOTE: Pieces are represented accordingly to FEN.
	BLACK_PAWN: 'p' as const,
	WHITE_PAWN: 'P' as const,
	BLACK_KING: 'k' as const,
	WHITE_KING: 'K' as const,
	BLACK_QUEEN: 'q' as const,
	WHITE_QUEEN: 'Q' as const,
	BLACK_ROOK: 'r' as const,
	WHITE_ROOK: 'R' as const,
	BLACK_BISHOP: 'b' as const,
	WHITE_BISHOP: 'B' as const,
	BLACK_KNIGHT: 'n' as const,
	WHITE_KNIGHT: 'N' as const,

	// NOTE: These should be declared separately, because otherwise TypeScript fails.
	isPiece,
	isPawn,
	isKing,
	isQueen,
	isRook,
	isBishop,
	isKnight,
	isBlack,
	isWhite,

	getColor: getPieceColor,
	parse: parsePieceId
};

type NonFunctionKeys<T> = { [P in keyof T]: T[P] extends Function ? never : P }[keyof T];
export type PieceId = (typeof PieceId)[NonFunctionKeys<typeof PieceId>];

export type PromotionPieceId =
	| typeof PieceId.BLACK_QUEEN
	| typeof PieceId.BLACK_ROOK
	| typeof PieceId.BLACK_BISHOP
	| typeof PieceId.BLACK_KNIGHT
	| typeof PieceId.WHITE_QUEEN
	| typeof PieceId.WHITE_ROOK
	| typeof PieceId.WHITE_BISHOP
	| typeof PieceId.WHITE_KNIGHT;

const VALID_PIECES = Object.values(PieceId) as PieceId[];

function isPiece(val: string): val is PieceId {
	return VALID_PIECES.includes(val as PieceId);
}

function isPawn(val: string): val is typeof PieceId.BLACK_PAWN | typeof PieceId.WHITE_PAWN {
	return val === PieceId.BLACK_PAWN || val === PieceId.WHITE_PAWN;
}

function isKing(val: string): val is typeof PieceId.BLACK_KING | typeof PieceId.WHITE_KING {
	return val === PieceId.BLACK_KING || val === PieceId.WHITE_KING;
}

function isQueen(val: string): val is typeof PieceId.BLACK_QUEEN | typeof PieceId.WHITE_QUEEN {
	return val === PieceId.BLACK_QUEEN || val === PieceId.WHITE_QUEEN;
}

function isRook(val: string): val is typeof PieceId.BLACK_ROOK | typeof PieceId.WHITE_ROOK {
	return val === PieceId.BLACK_ROOK || val === PieceId.WHITE_ROOK;
}

function isBishop(val: string): val is typeof PieceId.BLACK_BISHOP | typeof PieceId.WHITE_BISHOP {
	return val === PieceId.BLACK_BISHOP || val === PieceId.WHITE_BISHOP;
}

function isKnight(val: string): val is typeof PieceId.BLACK_KNIGHT | typeof PieceId.WHITE_KNIGHT {
	return val === PieceId.BLACK_KNIGHT || val === PieceId.WHITE_KNIGHT;
}

function getPieceColor(piece: PieceId): PlayerColor {
	// PERF: Checking char code might be faster...
	return piece === piece.toLowerCase() ? PlayerColor.BLACK : PlayerColor.WHITE;
}

function isBlack(piece: PieceId): boolean {
	return (
		piece === PieceId.BLACK_PAWN ||
		piece === PieceId.BLACK_KING ||
		piece === PieceId.BLACK_QUEEN ||
		piece === PieceId.BLACK_ROOK ||
		piece === PieceId.BLACK_BISHOP ||
		piece === PieceId.BLACK_KNIGHT
	);
}

function isWhite(piece: PieceId): boolean {
	return (
		piece === PieceId.WHITE_PAWN ||
		piece === PieceId.WHITE_KING ||
		piece === PieceId.WHITE_QUEEN ||
		piece === PieceId.WHITE_ROOK ||
		piece === PieceId.WHITE_BISHOP ||
		piece === PieceId.WHITE_KNIGHT
	);
}

function parsePieceId(val: string): PieceId | null {
	if (isPiece(val)) {
		return val;
	}
	return null;
}
