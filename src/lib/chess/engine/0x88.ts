import type { AbstractBoard } from '$lib/chess/board';

export const PieceColor = {
	WHITE: 0,
	BLACK: 1
} as const;
export type PieceColor = (typeof PieceColor)[keyof typeof PieceColor];

function oppositeColor(color: PieceColor): PieceColor {
	return (color ^ 1) as PieceColor;
}

// NOTE: A piece is encoded as `type | (color << 3)`:
//       - low 3 bits  (1..6) -> piece type
//       - bit 3       (0/8)  -> color (0 = white, 8 = black)
//       EMPTY is 0. White pieces are 1..6, black pieces are 9..14.

export const PieceType = {
	EMPTY: 0,
	PAWN: 1,
	KNIGHT: 2,
	BISHOP: 3,
	ROOK: 4,
	QUEEN: 5,
	KING: 6
} as const;
export type PieceType = (typeof PieceType)[keyof typeof PieceType];

const COLOR_SHIFT = 3;
const COLOR_BIT = 1 << COLOR_SHIFT; // 8
const TYPE_MASK = 0b111;

export const Piece = {
	W_PAWN: PieceType.PAWN, // 1
	W_KNIGHT: PieceType.KNIGHT, // 2
	W_BISHOP: PieceType.BISHOP, // 3
	W_ROOK: PieceType.ROOK, // 4
	W_QUEEN: PieceType.QUEEN, // 5
	W_KING: PieceType.KING, // 6
	B_PAWN: PieceType.PAWN | COLOR_BIT, // 9
	B_KNIGHT: PieceType.KNIGHT | COLOR_BIT, // 10
	B_BISHOP: PieceType.BISHOP | COLOR_BIT, // 11
	B_ROOK: PieceType.ROOK | COLOR_BIT, // 12
	B_QUEEN: PieceType.QUEEN | COLOR_BIT, // 13
	B_KING: PieceType.KING | COLOR_BIT // 14
};
export type Piece = (typeof Piece)[keyof typeof Piece];

export function packPiece0x88(type: PieceType, color: PieceColor): Piece {
	return type | (color << COLOR_SHIFT);
}

export function pieceTypeOf0x88(piece: number): PieceType {
	const type = piece & TYPE_MASK;
	return type as PieceType;
}

/** NOTE: Only meaningful when piece !== EMPTY. */
export function pieceColorOf0x88(piece: number): PieceColor {
	const color = (piece >> COLOR_SHIFT) & 1;
	return color as PieceColor;
}

const PIECE_TO_FEN: Record<number, string> = {
	[Piece.W_PAWN]: 'P',
	[Piece.W_KNIGHT]: 'N',
	[Piece.W_BISHOP]: 'B',
	[Piece.W_ROOK]: 'R',
	[Piece.W_QUEEN]: 'Q',
	[Piece.W_KING]: 'K',
	[Piece.B_PAWN]: 'p',
	[Piece.B_KNIGHT]: 'n',
	[Piece.B_BISHOP]: 'b',
	[Piece.B_ROOK]: 'r',
	[Piece.B_QUEEN]: 'q',
	[Piece.B_KING]: 'k'
};

const FEN_TO_PIECE: Record<string, number> = {
	P: Piece.W_PAWN,
	N: Piece.W_KNIGHT,
	B: Piece.W_BISHOP,
	R: Piece.W_ROOK,
	Q: Piece.W_QUEEN,
	K: Piece.W_KING,
	p: Piece.B_PAWN,
	n: Piece.B_KNIGHT,
	b: Piece.B_BISHOP,
	r: Piece.B_ROOK,
	q: Piece.B_QUEEN,
	k: Piece.B_KING
};

export const OFF_BOARD = -1;

// NOTE: square = rank * 16 + file, with file,rank in 0..7.
//       a1 = 0,  h1 = 7,  a8 = 112, h8 = 119.
//       `(square & 0x88) !== 0` => off the real 8x8 board.
export function makeSquare0x88(file: number, rank: number): number {
	return rank * 16 + file;
}

export function fileOf0x88(sq: number): number {
	return sq & 7;
}

export function rankOf0x88(sq: number): number {
	return sq >> 4;
}

export function isOnBoard0x88(sq: number): boolean {
	return (sq & 0x88) === 0;
}

const FILE_CHARS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
export function square0x88ToAlgebraic(sq: number): string {
	return FILE_CHARS[fileOf0x88(sq)] + (rankOf0x88(sq) + 1);
}

/** Convert algebraic notation (e.g. "e4") to a 0x88 square, or OFF_BOARD. */
export function algebraicToSquare0x88(str: string): number {
	if (str.length !== 2) return OFF_BOARD;
	const file = str.charCodeAt(0) - 'a'.charCodeAt(0);
	const rank = str.charCodeAt(1) - '1'.charCodeAt(0);
	if (file < 0 || file > 7 || rank < 0 || rank > 7) return OFF_BOARD;
	return makeSquare0x88(file, rank);
}

const ROOK_OFFSETS = [16, -16, 1, -1];
const BISHOP_OFFSETS = [17, 15, -15, -17];
const KING_OFFSETS = [16, -16, 1, -1, 17, 15, -15, -17];
const KNIGHT_OFFSETS = [33, 31, 18, 14, -33, -31, -18, -14];

// NOTE: Flags follow the canonical 4-bit scheme: bit 2 (value 4) marks a capture,
//       bit 3 (value 8) marks a promotion.
export const Flags0x88 = {
	QUIET: 0,
	DOUBLE_PAWN: 0b1,
	KING_CASTLE: 0b10,
	QUEEN_CASTLE: 0b11,
	CAPTURE: 0b100,
	EP_CAPTURE: 0b101,
	PROMO_KNIGHT: 0b1000,
	PROMO_BISHOP: 0b1001,
	PROMO_ROOK: 0b1010,
	PROMO_QUEEN: 0b1011,
	PROMO_KNIGHT_CAPTURE: 0b1100,
	PROMO_BISHOP_CAPTURE: 0b1101,
	PROMO_ROOK_CAPTURE: 0b1110,
	PROMO_QUEEN_CAPTURE: 0b1111
} as const;

const CAPTURE_FLAG_BIT = 0b0100;
const PROMOTION_FLAG_BIT = 0b1000;

// NOTE: A move is a single 32-bit integer:
//       bits  0..7  -> from square (0x88)
//       bits  8..15 -> to square   (0x88)
//       bits 16..19 -> flags (move type, see below)
const ox88 = {};
export function packMove0x88(from: number, to: number, flags: number): number {
	return (from & 0xff) | ((to & 0xff) << 8) | ((flags & 0xf) << 16);
}

export function extractMoveFromSquare(move: number): number {
	return move & 0xff;
}

export function extractMoveToSquare(move: number): number {
	return (move >> 8) & 0xff;
}

export function extractMoveFlags(move: number): number {
	return (move >> 16) & 0xf;
}

export function isCaptureFlag(flags: number): boolean {
	return (flags & CAPTURE_FLAG_BIT) !== 0;
}

export function isPromotionFlag(flags: number): boolean {
	return (flags & PROMOTION_FLAG_BIT) !== 0;
}

/**
 * The piece type a promotion flag promotes to. Only valid when
 * `isPromotionFlag(flags)` is true. Maps 8/12 -> KNIGHT, 9/13 -> BISHOP,
 * 10/14 -> ROOK, 11/15 -> QUEEN.
 */
export function promotionType(flags: number): PieceType {
	const type = (flags & 0b11) + PieceType.KNIGHT;
	return type as PieceType;
}

export function moveToLongAlgebraic(move: number): string {
	const flags = extractMoveFlags(move);
	let str =
		square0x88ToAlgebraic(extractMoveFromSquare(move)) +
		square0x88ToAlgebraic(extractMoveToSquare(move));
	if (isPromotionFlag(flags)) {
		const piece = packPiece0x88(promotionType(flags), PieceColor.BLACK);
		str += PIECE_TO_FEN[piece];
	}
	return str;
}

// ----------------------------------------------------------------------------
// Castling rights (bitmask)
// ----------------------------------------------------------------------------

export const CASTLE_WK = 1; // White king-side
export const CASTLE_WQ = 2; // White queen-side
export const CASTLE_BK = 4; // Black king-side
export const CASTLE_BQ = 8; // Black queen-side

// Per-square castling-rights mask. ANDing the rights with both
// CASTLE_MASK[from] and CASTLE_MASK[to] clears the appropriate bits whenever a
// king or rook leaves a home square, or a rook is captured on its home square.
// Every square keeps all rights (0b1111) except the six relevant home squares.
const CASTLE_MASK = new Int8Array(128).fill(0b1111);
CASTLE_MASK[makeSquare0x88(0, 0)] &= ~CASTLE_WQ; // a1 -> 13
CASTLE_MASK[makeSquare0x88(4, 0)] &= ~(CASTLE_WK | CASTLE_WQ); // e1 -> 12
CASTLE_MASK[makeSquare0x88(7, 0)] &= ~CASTLE_WK; // h1 -> 14
CASTLE_MASK[makeSquare0x88(0, 7)] &= ~CASTLE_BQ; // a8 -> 7
CASTLE_MASK[makeSquare0x88(4, 7)] &= ~(CASTLE_BK | CASTLE_BQ); // e8 -> 3
CASTLE_MASK[makeSquare0x88(7, 7)] &= ~CASTLE_BK; // h8 -> 11

// ----------------------------------------------------------------------------
// Undo record: everything needed to revert a move that the move integer alone
// does not capture.
// ----------------------------------------------------------------------------

interface UndoRecord {
	capturedPiece: number; // captured piece code (EMPTY if none); for ep this is the pawn
	castling: number; // castling rights before the move
	epSquare: number; // en passant target before the move (OFF_BOARD if none)
	halfMoveClock: number;
	fullMoveNumber: number;
}

export const MAX_MOVES = 256; // generous upper bound on moves in any position

// All evaluation is reported from WHITE's perspective (White positive). The
// initial position — and any color-symmetric position — must evaluate to 0.

// Material value in centipawns, indexed by piece type (index 0 = EMPTY, unused).
// The king is 0 so material is a pure balance of the remaining pieces.
const PIECE_VALUE = [0, 100, 320, 330, 500, 900, 0]; // EMPTY,PAWN,KNIGHT,BISHOP,ROOK,QUEEN,KING

// Piece-square tables ("Simplified Evaluation Function"). Each is a 64-entry
// array in VISUAL order: the first row is rank 8, the last row is rank 1, files
// a..h left to right.
const PST_PAWN = [
	0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10,
	25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10,
	10, 5, 0, 0, 0, 0, 0, 0, 0, 0
];
const PST_KNIGHT = [
	-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0,
	-30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5,
	-30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50
];
const PST_BISHOP = [
	-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10,
	-10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10,
	-10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20
];
const PST_ROOK = [
	0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0,
	0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5,
	5, 0, 0, 0
];
const PST_QUEEN = [
	-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5,
	0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0,
	-10, -20, -10, -10, -5, -5, -10, -10, -20
];
const PST_KING = [
	-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40,
	-50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30,
	-30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0,
	10, 30, 20
];

// PST lookup indexed by piece type (index 0 = EMPTY, unused).
const PST: (number[] | null)[] = [
	null,
	PST_PAWN,
	PST_KNIGHT,
	PST_BISHOP,
	PST_ROOK,
	PST_QUEEN,
	PST_KING
];

// Centipawns awarded per extra pseudo-legal move when scoring mobility.
const MOBILITY_WEIGHT = 1;

// Map a 0x88 square to a 64-entry VISUAL-order PST index. White reads the table
// directly (rank 8 first); Black mirrors vertically so its own advancement is
// rewarded the same way.
function pstWhiteIndex(sq: number): number {
	return (7 - rankOf0x88(sq)) * 8 + fileOf0x88(sq);
}
function pstBlackIndex(sq: number): number {
	return rankOf0x88(sq) * 8 + fileOf0x88(sq);
}

export class Board0x88 implements AbstractBoard<Int32Array, number> {
	/** 128-entry 0x88 board; each entry is a piece code (0 = empty). */
	readonly board: Int8Array = new Int8Array(128);

	turn: PieceColor = PieceColor.WHITE;
	castling: number = 0; // (CASTLE_WK | CASTLE_WQ | CASTLE_BK | CASTLE_BQ)
	enPassantTargetSquare: number = OFF_BOARD; // OFF_BOARD when none.

	halfMoveClock: number = 0;
	fullMoveNumber: number = 1;

	/** King square per color, indexed [WHITE]=king sq, [BLACK]=king sq. */
	readonly kingSquare: Int32Array = new Int32Array(2);

	/** LIFO stack of undo records pushed by makeMove, popped by unmakeMove. */
	private readonly undoStack: UndoRecord[] = [];

	constructor(fen?: string) {
		if (fen) {
			this.loadFen(fen);
		}
	}

	loadFen(fen: string): void {
		// Reset all board state before loading.
		this.board.fill(PieceType.EMPTY);
		this.undoStack.length = 0;
		this.kingSquare[PieceColor.WHITE] = OFF_BOARD;
		this.kingSquare[PieceColor.BLACK] = OFF_BOARD;

		// FEN fields: placement, side, castling, ep, halfmove, fullmove.
		// Be tolerant of missing trailing fields (same defaults as parseFen).
		const [
			placement,
			turnStr = 'w',
			castlingStr = '-',
			epStr = '-',
			halfMoveStr = '0',
			fullMoveStr = '1'
		] = fen.split(' ');

		// Piece placement: ranks are listed from rank 8 down to rank 1, files a->h.
		const ranks = placement.split('/');
		for (let rankIndex = 0; rankIndex < ranks.length; rankIndex++) {
			const rank = 7 - rankIndex; // FEN rank 8 (i=0) maps to rank index 7
			let file = 0;
			for (const char of ranks[rankIndex]) {
				if (char >= '1' && char <= '8') {
					file += char.charCodeAt(0) - '0'.charCodeAt(0);
					continue;
				}
				const piece = FEN_TO_PIECE[char];
				if (piece === undefined) continue;
				const square = makeSquare0x88(file, rank);
				this.board[square] = piece;
				if (piece === Piece.W_KING) {
					this.kingSquare[PieceColor.WHITE] = square;
				} else if (piece === Piece.B_KING) {
					this.kingSquare[PieceColor.BLACK] = square;
				}
				file += 1;
			}
		}

		// Side to move.
		this.turn = turnStr === 'b' ? PieceColor.BLACK : PieceColor.WHITE;

		// Castling rights.
		let castling = 0;
		if (castlingStr.includes('K')) castling |= CASTLE_WK;
		if (castlingStr.includes('Q')) castling |= CASTLE_WQ;
		if (castlingStr.includes('k')) castling |= CASTLE_BK;
		if (castlingStr.includes('q')) castling |= CASTLE_BQ;
		this.castling = castling;

		// En passant target.
		this.enPassantTargetSquare = epStr === '-' ? OFF_BOARD : algebraicToSquare0x88(epStr);

		// Clocks.
		const halfMoveClock = parseInt(halfMoveStr, 10);
		this.halfMoveClock = isNaN(halfMoveClock) ? 0 : halfMoveClock;
		const fullMoveNumber = parseInt(fullMoveStr, 10);
		this.fullMoveNumber = isNaN(fullMoveNumber) ? 1 : fullMoveNumber;
	}

	allocateMoveBuffer(): Int32Array {
		return new Int32Array(MAX_MOVES);
	}

	getMoveByIndex(buffer: Int32Array, index: number): number {
		return buffer[index];
	}

	generatePseudoLegalMoves(out: Int32Array): number {
		const board = this.board;
		const color = this.turn;
		const enemy = oppositeColor(color);
		let n = 0;

		for (let from = 0; from < 128; from++) {
			if (!isOnBoard0x88(from)) continue;
			const piece = board[from];
			if (piece === PieceType.EMPTY || pieceColorOf0x88(piece) !== color) continue;

			const type = pieceTypeOf0x88(piece);

			switch (type) {
				case PieceType.PAWN: {
					const dir = color === PieceColor.WHITE ? 16 : -16;
					const startRank = color === PieceColor.WHITE ? 1 : 6;
					const promoRank = color === PieceColor.WHITE ? 7 : 0;

					// Single (and double) push.
					const to = from + dir;
					if (isOnBoard0x88(to) && board[to] === PieceType.EMPTY) {
						if (rankOf0x88(to) === promoRank) {
							out[n++] = packMove0x88(from, to, Flags0x88.PROMO_KNIGHT);
							out[n++] = packMove0x88(from, to, Flags0x88.PROMO_BISHOP);
							out[n++] = packMove0x88(from, to, Flags0x88.PROMO_ROOK);
							out[n++] = packMove0x88(from, to, Flags0x88.PROMO_QUEEN);
						} else {
							out[n++] = packMove0x88(from, to, Flags0x88.QUIET);
							if (rankOf0x88(from) === startRank) {
								const to2 = from + 2 * dir;
								if (isOnBoard0x88(to2) && board[to2] === PieceType.EMPTY) {
									out[n++] = packMove0x88(from, to2, Flags0x88.DOUBLE_PAWN);
								}
							}
						}
					}

					// Captures (and en passant).
					for (const capOffset of [dir - 1, dir + 1]) {
						const capTo = from + capOffset;
						if (!isOnBoard0x88(capTo)) continue;
						const target = board[capTo];
						if (target !== PieceType.EMPTY && pieceColorOf0x88(target) !== color) {
							if (rankOf0x88(capTo) === promoRank) {
								out[n++] = packMove0x88(from, capTo, Flags0x88.PROMO_KNIGHT_CAPTURE);
								out[n++] = packMove0x88(from, capTo, Flags0x88.PROMO_BISHOP_CAPTURE);
								out[n++] = packMove0x88(from, capTo, Flags0x88.PROMO_ROOK_CAPTURE);
								out[n++] = packMove0x88(from, capTo, Flags0x88.PROMO_QUEEN_CAPTURE);
							} else {
								out[n++] = packMove0x88(from, capTo, Flags0x88.CAPTURE);
							}
						} else if (
							this.enPassantTargetSquare !== OFF_BOARD &&
							capTo === this.enPassantTargetSquare
						) {
							out[n++] = packMove0x88(from, capTo, Flags0x88.EP_CAPTURE);
						}
					}
					break;
				}

				case PieceType.KNIGHT: {
					for (const offset of KNIGHT_OFFSETS) {
						const to = from + offset;
						if (!isOnBoard0x88(to)) continue;
						const target = board[to];
						if (target === PieceType.EMPTY) {
							out[n++] = packMove0x88(from, to, Flags0x88.QUIET);
						} else if (pieceColorOf0x88(target) !== color) {
							out[n++] = packMove0x88(from, to, Flags0x88.CAPTURE);
						}
					}
					break;
				}

				case PieceType.KING: {
					for (const offset of KING_OFFSETS) {
						const to = from + offset;
						if (!isOnBoard0x88(to)) continue;
						const target = board[to];
						if (target === PieceType.EMPTY) {
							out[n++] = packMove0x88(from, to, Flags0x88.QUIET);
						} else if (pieceColorOf0x88(target) !== color) {
							out[n++] = packMove0x88(from, to, Flags0x88.CAPTURE);
						}
					}

					// Castling (fully legal).
					const rank = color === PieceColor.WHITE ? 0 : 7;
					const kingHome = makeSquare0x88(4, rank);
					const kingSide = color === PieceColor.WHITE ? CASTLE_WK : CASTLE_BK;
					const queenSide = color === PieceColor.WHITE ? CASTLE_WQ : CASTLE_BQ;

					if (this.castling & kingSide) {
						const f = makeSquare0x88(5, rank);
						const g = makeSquare0x88(6, rank);
						if (
							board[f] === PieceType.EMPTY &&
							board[g] === PieceType.EMPTY &&
							!this.isSquareAttacked(kingHome, enemy) &&
							!this.isSquareAttacked(f, enemy) &&
							!this.isSquareAttacked(g, enemy)
						) {
							out[n++] = packMove0x88(kingHome, g, Flags0x88.KING_CASTLE);
						}
					}

					if (this.castling & queenSide) {
						const d = makeSquare0x88(3, rank);
						const c = makeSquare0x88(2, rank);
						const b = makeSquare0x88(1, rank);
						if (
							board[d] === PieceType.EMPTY &&
							board[c] === PieceType.EMPTY &&
							board[b] === PieceType.EMPTY &&
							!this.isSquareAttacked(kingHome, enemy) &&
							!this.isSquareAttacked(d, enemy) &&
							!this.isSquareAttacked(c, enemy)
						) {
							out[n++] = packMove0x88(kingHome, c, Flags0x88.QUEEN_CASTLE);
						}
					}
					break;
				}

				case PieceType.BISHOP:
				case PieceType.ROOK:
				case PieceType.QUEEN: {
					const offsets =
						type === PieceType.BISHOP
							? BISHOP_OFFSETS
							: type === PieceType.ROOK
								? ROOK_OFFSETS
								: KING_OFFSETS; // queen = diagonals + orthogonals
					for (const offset of offsets) {
						let to = from + offset;
						while (isOnBoard0x88(to)) {
							const target = board[to];
							if (target === PieceType.EMPTY) {
								out[n++] = packMove0x88(from, to, Flags0x88.QUIET);
							} else {
								if (pieceColorOf0x88(target) !== color) {
									out[n++] = packMove0x88(from, to, Flags0x88.CAPTURE);
								}
								break; // ray blocked
							}
							to += offset;
						}
					}
					break;
				}
			}
		}

		return n;
	}

	generateLegalMoves(out: Int32Array): number {
		const color = this.turn;
		const pseudo = this.allocateMoveBuffer();
		const count = this.generatePseudoLegalMoves(pseudo);

		let n = 0;
		for (let i = 0; i < count; i++) {
			const move = pseudo[i];
			this.makeMove(move);
			const kingSq = this.kingSquare[color];
			if (!this.isSquareAttacked(kingSq, oppositeColor(color))) {
				out[n++] = move;
			}
			this.unmakeMove(move);
		}

		return n;
	}

	isSquareAttacked(square: number, byColor: PieceColor): boolean {
		const board = this.board;

		// Pawn attacks. A `byColor` pawn capturing INTO `square` would sit on the
		// square one step "backward" from the pawn's perspective. White pawns
		// capture toward higher ranks (offsets +15/+17), so the attacker sits at
		// `square - 17`/`square - 15`; black pawns are the mirror image.
		const pawn = packPiece0x88(PieceType.PAWN, byColor);
		if (byColor === PieceColor.WHITE) {
			const left = square - 17;
			const right = square - 15;
			if (isOnBoard0x88(left) && board[left] === pawn) return true;
			if (isOnBoard0x88(right) && board[right] === pawn) return true;
		} else {
			const left = square + 17;
			const right = square + 15;
			if (isOnBoard0x88(left) && board[left] === pawn) return true;
			if (isOnBoard0x88(right) && board[right] === pawn) return true;
		}

		// Knight attacks.
		const knight = packPiece0x88(PieceType.KNIGHT, byColor);
		for (const offset of KNIGHT_OFFSETS) {
			const sq = square + offset;
			if (isOnBoard0x88(sq) && board[sq] === knight) return true;
		}

		// King attacks.
		const king = packPiece0x88(PieceType.KING, byColor);
		for (const offset of KING_OFFSETS) {
			const sq = square + offset;
			if (isOnBoard0x88(sq) && board[sq] === king) return true;
		}

		// Sliding attacks along diagonals: bishop or queen of `byColor`.
		for (const offset of BISHOP_OFFSETS) {
			let sq = square + offset;
			while (isOnBoard0x88(sq)) {
				const piece = board[sq];
				if (piece !== PieceType.EMPTY) {
					if (
						pieceColorOf0x88(piece) === byColor &&
						(pieceTypeOf0x88(piece) === PieceType.BISHOP ||
							pieceTypeOf0x88(piece) === PieceType.QUEEN)
					) {
						return true;
					}
					break; // ray blocked by the first piece encountered
				}
				sq += offset;
			}
		}

		// Sliding attacks along orthogonals: rook or queen of `byColor`.
		for (const offset of ROOK_OFFSETS) {
			let sq = square + offset;
			while (isOnBoard0x88(sq)) {
				const piece = board[sq];
				if (piece !== PieceType.EMPTY) {
					if (
						pieceColorOf0x88(piece) === byColor &&
						(pieceTypeOf0x88(piece) === PieceType.ROOK ||
							pieceTypeOf0x88(piece) === PieceType.QUEEN)
					) {
						return true;
					}
					break; // ray blocked by the first piece encountered
				}
				sq += offset;
			}
		}

		return false;
	}

	makeMove(move: number): void {
		const fromSquare = extractMoveFromSquare(move);
		const toSquare = extractMoveToSquare(move);
		const flags = extractMoveFlags(move);

		const color = this.turn;
		const moved = this.board[fromSquare];
		const movedType = pieceTypeOf0x88(moved);

		let capturedPiece: number;
		if (flags === Flags0x88.EP_CAPTURE) {
			const captureSquare = toSquare + (color === PieceColor.WHITE ? -16 : 16);
			capturedPiece = this.board[captureSquare];
		} else if (isCaptureFlag(flags)) {
			capturedPiece = this.board[toSquare];
		} else {
			capturedPiece = PieceType.EMPTY;
		}

		// Push the undo record BEFORE mutating any state.
		this.undoStack.push({
			capturedPiece: capturedPiece,
			castling: this.castling,
			epSquare: this.enPassantTargetSquare,
			halfMoveClock: this.halfMoveClock,
			fullMoveNumber: this.fullMoveNumber
		});

		// Move the piece.
		this.board[toSquare] = moved;
		this.board[fromSquare] = PieceType.EMPTY;

		// Special-case handling.
		if (flags === Flags0x88.CAPTURE) {
			this.board[toSquare + (color === PieceColor.WHITE ? -16 : 16)] = PieceType.EMPTY;
		} else if (isPromotionFlag(flags)) {
			this.board[toSquare] = packPiece0x88(promotionType(flags), color);
		} else if (flags === Flags0x88.KING_CASTLE) {
			const rookFrom = toSquare + 1;
			const rookTo = toSquare - 1;
			this.board[rookTo] = this.board[rookFrom];
			this.board[rookFrom] = PieceType.EMPTY;
		} else if (flags === Flags0x88.QUEEN_CASTLE) {
			const rookFrom = toSquare - 2;
			const rookTo = toSquare + 1;
			this.board[rookTo] = this.board[rookFrom];
			this.board[rookFrom] = PieceType.EMPTY;
		}

		// King tracking.
		if (movedType === PieceType.KING) this.kingSquare[color] = toSquare;

		// Castling rights.
		this.castling &= CASTLE_MASK[fromSquare] & CASTLE_MASK[toSquare];

		// En passant target.
		this.enPassantTargetSquare =
			flags === Flags0x88.DOUBLE_PAWN ? (fromSquare + toSquare) >> 1 : OFF_BOARD;

		// Halfmove clock.
		if (movedType === PieceType.PAWN || isCaptureFlag(flags)) {
			this.halfMoveClock = 0;
		} else {
			this.halfMoveClock++;
		}

		// Fullmove number.
		if (color === PieceColor.BLACK) this.fullMoveNumber++;

		// Flip side to move.
		this.turn = oppositeColor(color);
	}

	unmakeMove(move: number): void {
		const from = extractMoveFromSquare(move);
		const to = extractMoveToSquare(move);
		const flags = extractMoveFlags(move);

		const undo = this.undoStack.pop()!;

		// Restore side to move first, then derive the color that moved.
		this.turn = oppositeColor(this.turn);
		const color = this.turn;

		// Restore scalar state from the undo record.
		this.castling = undo.castling;
		this.enPassantTargetSquare = undo.epSquare;
		this.halfMoveClock = undo.halfMoveClock;
		this.fullMoveNumber = undo.fullMoveNumber;

		// Figure out the piece to put back on `from`. For a promotion the piece
		// currently on `to` is the promoted piece; the original was a pawn.
		let moved = this.board[to];
		if (isPromotionFlag(flags)) {
			moved = packPiece0x88(PieceType.PAWN, color);
		}
		this.board[from] = moved;
		this.board[to] = PieceType.EMPTY;

		// Restore captures / special cases (mirror of makeMove).
		if (flags === Flags0x88.EP_CAPTURE) {
			this.board[to + (color === PieceColor.WHITE ? -16 : 16)] = undo.capturedPiece;
		} else if (isCaptureFlag(flags)) {
			this.board[to] = undo.capturedPiece;
		} else if (flags === Flags0x88.KING_CASTLE) {
			const rookFrom = to + 1;
			const rookTo = to - 1;
			this.board[rookFrom] = this.board[rookTo];
			this.board[rookTo] = PieceType.EMPTY;
		} else if (flags === Flags0x88.QUEEN_CASTLE) {
			const rookFrom = to - 2;
			const rookTo = to + 1;
			this.board[rookFrom] = this.board[rookTo];
			this.board[rookTo] = PieceType.EMPTY;
		}

		// King tracking.
		if (pieceTypeOf0x88(moved) === PieceType.KING) this.kingSquare[color] = from;
	}

	/** Material balance in centipawns, White positive. */
	evaluateMaterial(): number {
		const board = this.board;
		let score = 0;
		for (let sq = 0; sq < 128; sq++) {
			if (!isOnBoard0x88(sq)) continue;
			const piece = board[sq];
			if (piece === PieceType.EMPTY) continue;
			const value = PIECE_VALUE[pieceTypeOf0x88(piece)];
			if (pieceColorOf0x88(piece) === PieceColor.WHITE) {
				score += value;
			} else {
				score -= value;
			}
		}
		return score;
	}

	/** Piece-square-table balance in centipawns, White positive. */
	evaluatePST(): number {
		const board = this.board;
		let score = 0;
		for (let sq = 0; sq < 128; sq++) {
			if (!isOnBoard0x88(sq)) continue;
			const piece = board[sq];
			if (piece === PieceType.EMPTY) continue;
			const table = PST[pieceTypeOf0x88(piece)]!;
			if (pieceColorOf0x88(piece) === PieceColor.WHITE) {
				score += table[pstWhiteIndex(sq)];
			} else {
				score -= table[pstBlackIndex(sq)];
			}
		}
		return score;
	}

	/**
	 * Mobility balance in centipawns, White positive. This uses PSEUDO-LEGAL
	 * move counts as a cheap proxy: it does NOT exclude moves that leave the
	 * king in check. The side to move is temporarily overridden to count each
	 * color and then restored.
	 */
	evaluateMobility(): number {
		const buf = this.allocateMoveBuffer();
		const saved = this.turn;
		this.turn = PieceColor.WHITE;
		const whiteMoves = this.generatePseudoLegalMoves(buf);
		this.turn = PieceColor.BLACK;
		const blackMoves = this.generatePseudoLegalMoves(buf);
		this.turn = saved;
		return (whiteMoves - blackMoves) * MOBILITY_WEIGHT;
	}

	/** Combined static evaluation in centipawns, White positive. */
	evaluate(): number {
		return this.evaluateMaterial() + this.evaluatePST() + this.evaluateMobility();
	}
}
