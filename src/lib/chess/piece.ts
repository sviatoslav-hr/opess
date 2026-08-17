// TODO: Move to base.
// NOTE: Unfortunately, we need to declare functions separately, because otherwise TypeScript type seems to break...

import { PieceColor } from './basic';

//       (probably because of `NonFunctionKeys` type)
export const PieceId = {
	WHITE_PAWN: 1,
	WHITE_KNIGHT: 2,
	WHITE_BISHOP: 3,
	WHITE_ROOK: 4,
	WHITE_QUEEN: 5,
	WHITE_KING: 6,
	NONE: 0, // not part of the type
	BLACK_PAWN: -1,
	BLACK_KNIGHT: -2,
	BLACK_BISHOP: -3,
	BLACK_ROOK: -4,
	BLACK_QUEEN: -5,
	BLACK_KING: -6,
	is: isPieceId,
	isMaybe: isPieceIdMaybe,
	asPromotion: pieceIdAsPromotion,
	isPawn: isPawnPiece,
	isKing: isKingPiece,
	isQueen: isQueenPiece,
	isRook: isRookPiece,
	isBishop: isBishopPiece,
	isKnight: isKnightPiece,
	isBlack: isBlackPiece,
	isWhite: isWhitePiece,
	toBlack: toBlackPiece,
	toWhite: toWhitePiece,

	nameOf: getPieceName,
	colorOf: getPieceColor,
	colorEquals: pieceColorEquals,
	parse: parsePieceId,
} as const;
export type PieceIdNone = typeof PieceId.NONE;
export type PieceIdMaybe = (typeof PieceId)[NonFunctionKeys<typeof PieceId>];
export type PieceId = Exclude<PieceIdMaybe, typeof PieceId.NONE>;

const PIECE_IDS = Object.values(PieceId)
	.filter((v) => typeof v === 'number' && v !== PieceId.NONE)
	.map((v) => v) as number[];
function isPieceId(val: number): val is PieceId {
	return PIECE_IDS.includes(val);
}
function isPieceIdMaybe(val: number): val is PieceIdMaybe {
	return val === PieceId.NONE || isPieceId(val);
}

export const PIECE_ID_MIN = Math.min(...PIECE_IDS);
export const PIECE_ID_MAX = Math.max(...PIECE_IDS);

export const PromotionPiece = {
	QUEEN: PieceId.WHITE_QUEEN,
	ROOK: PieceId.WHITE_ROOK,
	BISHOP: PieceId.WHITE_BISHOP,
	KNIGHT: PieceId.WHITE_KNIGHT,
	is: isPromotionPiece,
	as: pieceIdAsPromotion,
	all: allPromotionPieces,
	toPieceId: promotionToPieceId,
	keyOf: keyOfPromotionPiece,
} as const;
export type PromotionPiece = (typeof PromotionPiece)[NonFunctionKeys<typeof PromotionPiece>];
export const PROMOTION_PIECES = Object.values(PromotionPiece)
	.filter((v) => typeof v === 'number')
	.map((v) => v as PromotionPiece);

function isPromotionPiece(value: number): value is PromotionPiece {
	return PROMOTION_PIECES.includes(value as PromotionPiece);
}

function allPromotionPieces(): PromotionPiece[] {
	return PROMOTION_PIECES;
}

function pieceIdAsPromotion(value: PieceId): PromotionPiece | null {
	value = Math.abs(value) as PieceId;
	if (isPromotionPiece(value)) return value;
	return null;
}

function promotionToPieceId(piece: PromotionPiece, color: PieceColor): PieceId {
	const white = color === PieceColor.WHITE;
	switch (piece) {
		case PromotionPiece.QUEEN:
			return white ? PieceId.WHITE_QUEEN : PieceId.BLACK_QUEEN;
		case PromotionPiece.ROOK:
			return white ? PieceId.WHITE_ROOK : PieceId.BLACK_ROOK;
		case PromotionPiece.BISHOP:
			return white ? PieceId.WHITE_BISHOP : PieceId.BLACK_BISHOP;
		case PromotionPiece.KNIGHT:
			return white ? PieceId.WHITE_KNIGHT : PieceId.BLACK_KNIGHT;
		default:
			throw new Error(`Invalid promotion piece: ${piece satisfies never}`);
	}
}

function keyOfPromotionPiece(piece: PromotionPiece): string {
	switch (piece) {
		case PieceId.WHITE_QUEEN:
			return 'q';
		case PieceId.WHITE_ROOK:
			return 'r';
		case PieceId.WHITE_BISHOP:
			return 'b';
		case PieceId.WHITE_KNIGHT:
			return 'n';
		default:
			throw new Error(`Invalid promotion piece: ${piece satisfies never}`);
	}
}

function isPawnPiece(val: number): val is typeof PieceId.BLACK_PAWN | typeof PieceId.WHITE_PAWN {
	return val === PieceId.BLACK_PAWN || val === PieceId.WHITE_PAWN;
}

function isKingPiece(val: number): val is typeof PieceId.BLACK_KING | typeof PieceId.WHITE_KING {
	return val === PieceId.BLACK_KING || val === PieceId.WHITE_KING;
}

function isQueenPiece(val: number): val is typeof PieceId.BLACK_QUEEN | typeof PieceId.WHITE_QUEEN {
	return val === PieceId.BLACK_QUEEN || val === PieceId.WHITE_QUEEN;
}

function isRookPiece(val: number): val is typeof PieceId.BLACK_ROOK | typeof PieceId.WHITE_ROOK {
	return val === PieceId.BLACK_ROOK || val === PieceId.WHITE_ROOK;
}

function isBishopPiece(
	val: number
): val is typeof PieceId.BLACK_BISHOP | typeof PieceId.WHITE_BISHOP {
	return val === PieceId.BLACK_BISHOP || val === PieceId.WHITE_BISHOP;
}

function isKnightPiece(
	val: number
): val is typeof PieceId.BLACK_KNIGHT | typeof PieceId.WHITE_KNIGHT {
	return val === PieceId.BLACK_KNIGHT || val === PieceId.WHITE_KNIGHT;
}

function getPieceColor(piece: PieceId): PieceColor {
	return isBlackPiece(piece) ? PieceColor.BLACK : PieceColor.WHITE;
}

function pieceColorEquals(a: PieceId, b: PieceId): boolean {
	return getPieceColor(a) === getPieceColor(b);
}

function isWhitePiece(piece: PieceId): boolean {
	return piece > 0;
}

function isBlackPiece(piece: PieceId): boolean {
	return piece < 0;
}

function toWhitePiece(piece: PieceId): PieceId {
	if (isBlackPiece(piece)) return -piece as PieceId;
	return piece;
}

function toBlackPiece(piece: PieceId): PieceId {
	if (isWhitePiece(piece)) return -piece as PieceId;
	return piece;
}

const PIECE_NAMES: Record<PieceId, string> = {
	[PieceId.WHITE_PAWN]: 'White Pawn',
	[PieceId.WHITE_KNIGHT]: 'White Knight',
	[PieceId.WHITE_BISHOP]: 'White Bishop',
	[PieceId.WHITE_ROOK]: 'White Rook',
	[PieceId.WHITE_QUEEN]: 'White Queen',
	[PieceId.WHITE_KING]: 'White King',
	[PieceId.BLACK_PAWN]: 'Black Pawn',
	[PieceId.BLACK_KNIGHT]: 'Black Knight',
	[PieceId.BLACK_BISHOP]: 'Black Bishop',
	[PieceId.BLACK_ROOK]: 'Black Rook',
	[PieceId.BLACK_QUEEN]: 'Black Queen',
	[PieceId.BLACK_KING]: 'Black King',
};
function getPieceName(piece: PieceId): string {
	const name = PIECE_NAMES[piece];
	if (name == null) return 'Unknown Piece';
	return name;
}

function parsePieceId(val: number): PieceId | null {
	if (PieceId.is(val)) return val;
	return null;
}

type NonFunctionKeys<T> = { [P in keyof T]: T[P] extends Function ? never : P }[keyof T];
