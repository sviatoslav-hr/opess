import type { AbstractBoard } from '$lib/chess/board';

export const PieceColor = {
	WHITE: 0,
	BLACK: 1
} as const;
export type PieceColor = (typeof PieceColor)[keyof typeof PieceColor];

function oppositeColor(color: PieceColor): PieceColor {
	return (color ^ 1) as PieceColor;
}

// ----------------------------------------------------------------------------
// Pieces
//
// A piece is encoded as `type | (color << 3)`:
//   - low 3 bits  (1..6) -> piece type
//   - bit 3       (0/8)  -> color (0 = white, 8 = black)
// EMPTY is 0. White pieces are 1..6, black pieces are 9..14.
// ----------------------------------------------------------------------------

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

// Concrete piece codes (handy for tables, tests, and readability).
export const BoardPiece = {
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
export type BoardPiece = (typeof BoardPiece)[keyof typeof BoardPiece];

export function makePiece(type: PieceType, color: PieceColor): BoardPiece {
	return type | (color << COLOR_SHIFT);
}

export function pieceType(piece: number): PieceType {
	const type = piece & TYPE_MASK;
	return type as PieceType;
}

/** NOTE: Only meaningful when piece !== EMPTY. */
export function pieceColor(piece: number): PieceColor {
	const color = (piece >> COLOR_SHIFT) & 1;
	return color as PieceColor;
}

export const PIECE_TO_FEN: Record<number, string> = {
	[BoardPiece.W_PAWN]: 'P',
	[BoardPiece.W_KNIGHT]: 'N',
	[BoardPiece.W_BISHOP]: 'B',
	[BoardPiece.W_ROOK]: 'R',
	[BoardPiece.W_QUEEN]: 'Q',
	[BoardPiece.W_KING]: 'K',
	[BoardPiece.B_PAWN]: 'p',
	[BoardPiece.B_KNIGHT]: 'n',
	[BoardPiece.B_BISHOP]: 'b',
	[BoardPiece.B_ROOK]: 'r',
	[BoardPiece.B_QUEEN]: 'q',
	[BoardPiece.B_KING]: 'k'
};

export const FEN_TO_PIECE: Record<string, number> = {
	P: BoardPiece.W_PAWN,
	N: BoardPiece.W_KNIGHT,
	B: BoardPiece.W_BISHOP,
	R: BoardPiece.W_ROOK,
	Q: BoardPiece.W_QUEEN,
	K: BoardPiece.W_KING,
	p: BoardPiece.B_PAWN,
	n: BoardPiece.B_KNIGHT,
	b: BoardPiece.B_BISHOP,
	r: BoardPiece.B_ROOK,
	q: BoardPiece.B_QUEEN,
	k: BoardPiece.B_KING
};

// ----------------------------------------------------------------------------
// Squares (0x88 coordinates)
//
// square = rank * 16 + file, with file,rank in 0..7.
//   a1 = 0,  h1 = 7,  a8 = 112, h8 = 119.
// `(square & 0x88) !== 0` => off the real 8x8 board.
// ----------------------------------------------------------------------------

export const OFF_BOARD = -1;

const FILE_CHARS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

/** Compose a 0x88 square from file and rank indices (0..7). */
export function square(file: number, rank: number): number {
	return rank * 16 + file;
}

/** File index (0..7) of a 0x88 square. */
export function fileOf(sq: number): number {
	return sq & 7;
}

/** Rank index (0..7) of a 0x88 square. */
export function rankOf(sq: number): number {
	return sq >> 4;
}

/** True when a 0x88 square lies on the real 8x8 board. */
export function isOnBoard(sq: number): boolean {
	return (sq & 0x88) === 0;
}

/** Convert a 0x88 square to algebraic notation, e.g. 0 -> "a1", 119 -> "h8". */
export function squareToAlgebraic(sq: number): string {
	return FILE_CHARS[fileOf(sq)] + (rankOf(sq) + 1);
}

/** Convert algebraic notation (e.g. "e4") to a 0x88 square, or OFF_BOARD. */
export function algebraicToSquare(str: string): number {
	if (str.length !== 2) return OFF_BOARD;
	const file = str.charCodeAt(0) - 'a'.charCodeAt(0);
	const rank = str.charCodeAt(1) - '1'.charCodeAt(0);
	if (file < 0 || file > 7 || rank < 0 || rank > 7) return OFF_BOARD;
	return square(file, rank);
}

// ----------------------------------------------------------------------------
// Direction offsets (added to a 0x88 square to step in a direction)
// ----------------------------------------------------------------------------

// Orthogonal: N, S, E, W
export const ROOK_OFFSETS = [16, -16, 1, -1];
// Diagonal: NE, NW, SE, SW
export const BISHOP_OFFSETS = [17, 15, -15, -17];
// King / Queen: all 8 directions
export const KING_OFFSETS = [16, -16, 1, -1, 17, 15, -15, -17];
// Knight: the 8 L-shaped jumps
export const KNIGHT_OFFSETS = [33, 31, 18, 14, -33, -31, -18, -14];

// ----------------------------------------------------------------------------
// Move encoding
//
// A move is a single 32-bit integer:
//   bits  0..7  -> from square (0x88)
//   bits  8..15 -> to square   (0x88)
//   bits 16..19 -> flags (move type, see below)
//
// Flags follow the canonical 4-bit scheme: bit 2 (value 4) marks a capture,
// bit 3 (value 8) marks a promotion.
// ----------------------------------------------------------------------------

export const FLAG_QUIET = 0;
export const FLAG_DOUBLE_PAWN = 1;
export const FLAG_KING_CASTLE = 2;
export const FLAG_QUEEN_CASTLE = 3;
export const FLAG_CAPTURE = 4;
export const FLAG_EP_CAPTURE = 5;
export const FLAG_PROMO_KNIGHT = 8;
export const FLAG_PROMO_BISHOP = 9;
export const FLAG_PROMO_ROOK = 10;
export const FLAG_PROMO_QUEEN = 11;
export const FLAG_PROMO_KNIGHT_CAPTURE = 12;
export const FLAG_PROMO_BISHOP_CAPTURE = 13;
export const FLAG_PROMO_ROOK_CAPTURE = 14;
export const FLAG_PROMO_QUEEN_CAPTURE = 15;

const CAPTURE_FLAG_BIT = 0b0100;
const PROMOTION_FLAG_BIT = 0b1000;

/** Pack a move into a 32-bit integer. */
export function encodeMove(from: number, to: number, flags: number): number {
	return (from & 0xff) | ((to & 0xff) << 8) | ((flags & 0xf) << 16);
}

export function moveFrom(move: number): number {
	return move & 0xff;
}

export function moveTo(move: number): number {
	return (move >> 8) & 0xff;
}

export function moveFlags(move: number): number {
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
	const flags = moveFlags(move);
	let str = squareToAlgebraic(moveFrom(move)) + squareToAlgebraic(moveTo(move));
	if (isPromotionFlag(flags)) {
		const piece = makePiece(promotionType(flags), PieceColor.BLACK);
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
CASTLE_MASK[square(0, 0)] &= ~CASTLE_WQ; // a1 -> 13
CASTLE_MASK[square(4, 0)] &= ~(CASTLE_WK | CASTLE_WQ); // e1 -> 12
CASTLE_MASK[square(7, 0)] &= ~CASTLE_WK; // h1 -> 14
CASTLE_MASK[square(0, 7)] &= ~CASTLE_BQ; // a8 -> 7
CASTLE_MASK[square(4, 7)] &= ~(CASTLE_BK | CASTLE_BQ); // e8 -> 3
CASTLE_MASK[square(7, 7)] &= ~CASTLE_BK; // h8 -> 11

// ----------------------------------------------------------------------------
// Undo record: everything needed to revert a move that the move integer alone
// does not capture.
// ----------------------------------------------------------------------------

interface UndoRecord {
	captured: number; // captured piece code (EMPTY if none); for ep this is the pawn
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
	return (7 - rankOf(sq)) * 8 + fileOf(sq);
}
function pstBlackIndex(sq: number): number {
	return rankOf(sq) * 8 + fileOf(sq);
}

// ----------------------------------------------------------------------------
// The board
// ----------------------------------------------------------------------------

export class Board0x88 implements AbstractBoard<Int32Array, number> {
	/** 128-entry 0x88 board; each entry is a piece code (0 = empty). */
	readonly board: Int8Array = new Int8Array(128);

	turn: PieceColor = PieceColor.WHITE;

	/** Castling rights bitmask (CASTLE_WK | CASTLE_WQ | CASTLE_BK | CASTLE_BQ). */
	castling: number = 0;

	/** En passant target square (0x88), or OFF_BOARD when none. */
	epSquare: number = OFF_BOARD;

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

	// --- Task 2 ---------------------------------------------------------------
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
		for (let i = 0; i < ranks.length; i++) {
			const rank = 7 - i; // FEN rank 8 (i=0) maps to rank index 7
			let file = 0;
			for (const char of ranks[i]) {
				if (char >= '1' && char <= '8') {
					file += char.charCodeAt(0) - '0'.charCodeAt(0);
					continue;
				}
				const piece = FEN_TO_PIECE[char];
				if (piece === undefined) continue;
				const sq = square(file, rank);
				this.board[sq] = piece;
				if (piece === BoardPiece.W_KING) {
					this.kingSquare[PieceColor.WHITE] = sq;
				} else if (piece === BoardPiece.B_KING) {
					this.kingSquare[PieceColor.BLACK] = sq;
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
		this.epSquare = epStr === '-' ? OFF_BOARD : algebraicToSquare(epStr);

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
			if (!isOnBoard(from)) continue;
			const piece = board[from];
			if (piece === PieceType.EMPTY || pieceColor(piece) !== color) continue;

			const type = pieceType(piece);

			switch (type) {
				case PieceType.PAWN: {
					const dir = color === PieceColor.WHITE ? 16 : -16;
					const startRank = color === PieceColor.WHITE ? 1 : 6;
					const promoRank = color === PieceColor.WHITE ? 7 : 0;

					// Single (and double) push.
					const to = from + dir;
					if (isOnBoard(to) && board[to] === PieceType.EMPTY) {
						if (rankOf(to) === promoRank) {
							out[n++] = encodeMove(from, to, FLAG_PROMO_KNIGHT);
							out[n++] = encodeMove(from, to, FLAG_PROMO_BISHOP);
							out[n++] = encodeMove(from, to, FLAG_PROMO_ROOK);
							out[n++] = encodeMove(from, to, FLAG_PROMO_QUEEN);
						} else {
							out[n++] = encodeMove(from, to, FLAG_QUIET);
							if (rankOf(from) === startRank) {
								const to2 = from + 2 * dir;
								if (isOnBoard(to2) && board[to2] === PieceType.EMPTY) {
									out[n++] = encodeMove(from, to2, FLAG_DOUBLE_PAWN);
								}
							}
						}
					}

					// Captures (and en passant).
					for (const capOffset of [dir - 1, dir + 1]) {
						const capTo = from + capOffset;
						if (!isOnBoard(capTo)) continue;
						const target = board[capTo];
						if (target !== PieceType.EMPTY && pieceColor(target) !== color) {
							if (rankOf(capTo) === promoRank) {
								out[n++] = encodeMove(from, capTo, FLAG_PROMO_KNIGHT_CAPTURE);
								out[n++] = encodeMove(from, capTo, FLAG_PROMO_BISHOP_CAPTURE);
								out[n++] = encodeMove(from, capTo, FLAG_PROMO_ROOK_CAPTURE);
								out[n++] = encodeMove(from, capTo, FLAG_PROMO_QUEEN_CAPTURE);
							} else {
								out[n++] = encodeMove(from, capTo, FLAG_CAPTURE);
							}
						} else if (this.epSquare !== OFF_BOARD && capTo === this.epSquare) {
							out[n++] = encodeMove(from, capTo, FLAG_EP_CAPTURE);
						}
					}
					break;
				}

				case PieceType.KNIGHT: {
					for (const offset of KNIGHT_OFFSETS) {
						const to = from + offset;
						if (!isOnBoard(to)) continue;
						const target = board[to];
						if (target === PieceType.EMPTY) {
							out[n++] = encodeMove(from, to, FLAG_QUIET);
						} else if (pieceColor(target) !== color) {
							out[n++] = encodeMove(from, to, FLAG_CAPTURE);
						}
					}
					break;
				}

				case PieceType.KING: {
					for (const offset of KING_OFFSETS) {
						const to = from + offset;
						if (!isOnBoard(to)) continue;
						const target = board[to];
						if (target === PieceType.EMPTY) {
							out[n++] = encodeMove(from, to, FLAG_QUIET);
						} else if (pieceColor(target) !== color) {
							out[n++] = encodeMove(from, to, FLAG_CAPTURE);
						}
					}

					// Castling (fully legal).
					const rank = color === PieceColor.WHITE ? 0 : 7;
					const kingHome = square(4, rank);
					const kingSide = color === PieceColor.WHITE ? CASTLE_WK : CASTLE_BK;
					const queenSide = color === PieceColor.WHITE ? CASTLE_WQ : CASTLE_BQ;

					if (this.castling & kingSide) {
						const f = square(5, rank);
						const g = square(6, rank);
						if (
							board[f] === PieceType.EMPTY &&
							board[g] === PieceType.EMPTY &&
							!this.isSquareAttacked(kingHome, enemy) &&
							!this.isSquareAttacked(f, enemy) &&
							!this.isSquareAttacked(g, enemy)
						) {
							out[n++] = encodeMove(kingHome, g, FLAG_KING_CASTLE);
						}
					}

					if (this.castling & queenSide) {
						const d = square(3, rank);
						const c = square(2, rank);
						const b = square(1, rank);
						if (
							board[d] === PieceType.EMPTY &&
							board[c] === PieceType.EMPTY &&
							board[b] === PieceType.EMPTY &&
							!this.isSquareAttacked(kingHome, enemy) &&
							!this.isSquareAttacked(d, enemy) &&
							!this.isSquareAttacked(c, enemy)
						) {
							out[n++] = encodeMove(kingHome, c, FLAG_QUEEN_CASTLE);
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
						while (isOnBoard(to)) {
							const target = board[to];
							if (target === PieceType.EMPTY) {
								out[n++] = encodeMove(from, to, FLAG_QUIET);
							} else {
								if (pieceColor(target) !== color) {
									out[n++] = encodeMove(from, to, FLAG_CAPTURE);
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
		const pawn = makePiece(PieceType.PAWN, byColor);
		if (byColor === PieceColor.WHITE) {
			const left = square - 17;
			const right = square - 15;
			if (isOnBoard(left) && board[left] === pawn) return true;
			if (isOnBoard(right) && board[right] === pawn) return true;
		} else {
			const left = square + 17;
			const right = square + 15;
			if (isOnBoard(left) && board[left] === pawn) return true;
			if (isOnBoard(right) && board[right] === pawn) return true;
		}

		// Knight attacks.
		const knight = makePiece(PieceType.KNIGHT, byColor);
		for (const offset of KNIGHT_OFFSETS) {
			const sq = square + offset;
			if (isOnBoard(sq) && board[sq] === knight) return true;
		}

		// King attacks.
		const king = makePiece(PieceType.KING, byColor);
		for (const offset of KING_OFFSETS) {
			const sq = square + offset;
			if (isOnBoard(sq) && board[sq] === king) return true;
		}

		// Sliding attacks along diagonals: bishop or queen of `byColor`.
		for (const offset of BISHOP_OFFSETS) {
			let sq = square + offset;
			while (isOnBoard(sq)) {
				const piece = board[sq];
				if (piece !== PieceType.EMPTY) {
					if (
						pieceColor(piece) === byColor &&
						(pieceType(piece) === PieceType.BISHOP || pieceType(piece) === PieceType.QUEEN)
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
			while (isOnBoard(sq)) {
				const piece = board[sq];
				if (piece !== PieceType.EMPTY) {
					if (
						pieceColor(piece) === byColor &&
						(pieceType(piece) === PieceType.ROOK || pieceType(piece) === PieceType.QUEEN)
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
		const from = moveFrom(move);
		const to = moveTo(move);
		const flags = moveFlags(move);

		const color = this.turn;
		const moved = this.board[from];
		const movedType = pieceType(moved);

		// Determine the captured piece for the undo record.
		let captured: number;
		if (flags === FLAG_EP_CAPTURE) {
			const capSq = to + (color === PieceColor.WHITE ? -16 : 16);
			captured = this.board[capSq];
		} else if (isCaptureFlag(flags)) {
			captured = this.board[to];
		} else {
			captured = PieceType.EMPTY;
		}

		// Push the undo record BEFORE mutating any state.
		this.undoStack.push({
			captured,
			castling: this.castling,
			epSquare: this.epSquare,
			halfMoveClock: this.halfMoveClock,
			fullMoveNumber: this.fullMoveNumber
		});

		// Move the piece.
		this.board[to] = moved;
		this.board[from] = PieceType.EMPTY;

		// Special-case handling.
		if (flags === FLAG_EP_CAPTURE) {
			this.board[to + (color === PieceColor.WHITE ? -16 : 16)] = PieceType.EMPTY;
		} else if (isPromotionFlag(flags)) {
			this.board[to] = makePiece(promotionType(flags), color);
		} else if (flags === FLAG_KING_CASTLE) {
			const rookFrom = to + 1;
			const rookTo = to - 1;
			this.board[rookTo] = this.board[rookFrom];
			this.board[rookFrom] = PieceType.EMPTY;
		} else if (flags === FLAG_QUEEN_CASTLE) {
			const rookFrom = to - 2;
			const rookTo = to + 1;
			this.board[rookTo] = this.board[rookFrom];
			this.board[rookFrom] = PieceType.EMPTY;
		}

		// King tracking.
		if (movedType === PieceType.KING) this.kingSquare[color] = to;

		// Castling rights.
		this.castling &= CASTLE_MASK[from] & CASTLE_MASK[to];

		// En passant target.
		this.epSquare = flags === FLAG_DOUBLE_PAWN ? (from + to) >> 1 : OFF_BOARD;

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
		const from = moveFrom(move);
		const to = moveTo(move);
		const flags = moveFlags(move);

		const undo = this.undoStack.pop()!;

		// Restore side to move first, then derive the color that moved.
		this.turn = oppositeColor(this.turn);
		const color = this.turn;

		// Restore scalar state from the undo record.
		this.castling = undo.castling;
		this.epSquare = undo.epSquare;
		this.halfMoveClock = undo.halfMoveClock;
		this.fullMoveNumber = undo.fullMoveNumber;

		// Figure out the piece to put back on `from`. For a promotion the piece
		// currently on `to` is the promoted piece; the original was a pawn.
		let moved = this.board[to];
		if (isPromotionFlag(flags)) {
			moved = makePiece(PieceType.PAWN, color);
		}
		this.board[from] = moved;
		this.board[to] = PieceType.EMPTY;

		// Restore captures / special cases (mirror of makeMove).
		if (flags === FLAG_EP_CAPTURE) {
			this.board[to + (color === PieceColor.WHITE ? -16 : 16)] = undo.captured;
		} else if (isCaptureFlag(flags)) {
			this.board[to] = undo.captured;
		} else if (flags === FLAG_KING_CASTLE) {
			const rookFrom = to + 1;
			const rookTo = to - 1;
			this.board[rookFrom] = this.board[rookTo];
			this.board[rookTo] = PieceType.EMPTY;
		} else if (flags === FLAG_QUEEN_CASTLE) {
			const rookFrom = to - 2;
			const rookTo = to + 1;
			this.board[rookFrom] = this.board[rookTo];
			this.board[rookTo] = PieceType.EMPTY;
		}

		// King tracking.
		if (pieceType(moved) === PieceType.KING) this.kingSquare[color] = from;
	}

	/** Material balance in centipawns, White positive. */
	evaluateMaterial(): number {
		const board = this.board;
		let score = 0;
		for (let sq = 0; sq < 128; sq++) {
			if (!isOnBoard(sq)) continue;
			const piece = board[sq];
			if (piece === PieceType.EMPTY) continue;
			const value = PIECE_VALUE[pieceType(piece)];
			if (pieceColor(piece) === PieceColor.WHITE) {
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
			if (!isOnBoard(sq)) continue;
			const piece = board[sq];
			if (piece === PieceType.EMPTY) continue;
			const table = PST[pieceType(piece)]!;
			if (pieceColor(piece) === PieceColor.WHITE) {
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
