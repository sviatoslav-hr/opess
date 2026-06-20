import type { AbstractBoard } from '$lib/chess/board';

export type MoveInt8 = number;
export type MoveBufferInt8 = Int32Array;

export const PieceColor = {
	WHITE: 1,
	BLACK: -1
} as const;
export type PieceColor = (typeof PieceColor)[keyof typeof PieceColor];

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

export const Piece = {
	WHITE_PAWN: PieceType.PAWN,
	WHITE_KNIGHT: PieceType.KNIGHT,
	WHITE_BISHOP: PieceType.BISHOP,
	WHITE_ROOK: PieceType.ROOK,
	WHITE_QUEEN: PieceType.QUEEN,
	WHITE_KING: PieceType.KING,
	BLACK_PAWN: -PieceType.PAWN,
	BLACK_KNIGHT: -PieceType.KNIGHT,
	BLACK_BISHOP: -PieceType.BISHOP,
	BLACK_ROOK: -PieceType.ROOK,
	BLACK_QUEEN: -PieceType.QUEEN,
	BLACK_KING: -PieceType.KING
} as const;
export type Piece = (typeof Piece)[keyof typeof Piece];

export const NO_SQUARE = 255;
export const BOARD_WIDTH = 8;
export const BOARD_SIZE = 64;
export const MAX_PIECES = 32;
export const MAX_MOVES = 512;
export const MAX_HISTORY = 4096;
export const MAX_MOVE_DEPTH = 128;
export const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const A1 = 0;
const B1 = 1;
const C1 = 2;
const D1 = 3;
const E1 = 4;
const F1 = 5;
const G1 = 6;
const H1 = 7;

const A8 = 56;
const B8 = 57;
const C8 = 58;
const D8 = 59;
const E8 = 60;
const F8 = 61;
const G8 = 62;
const H8 = 63;

const CASTLE_WHITE_KING = 1;
const CASTLE_WHITE_QUEEN = 2;
const CASTLE_BLACK_KING = 4;
const CASTLE_BLACK_QUEEN = 8;

const PROMOTION_PIECES = [
	PieceType.QUEEN,
	PieceType.ROOK,
	PieceType.BISHOP,
	PieceType.KNIGHT
] as const;
const MATERIAL_VALUES = [0, 100, 320, 330, 500, 900, 0] as const;

const KNIGHT_DELTAS = [
	[-2, -1],
	[-2, 1],
	[-1, -2],
	[-1, 2],
	[1, -2],
	[1, 2],
	[2, -1],
	[2, 1]
] as const;

const KING_DELTAS = [
	[-1, -1],
	[-1, 0],
	[-1, 1],
	[0, -1],
	[0, 1],
	[1, -1],
	[1, 0],
	[1, 1]
] as const;

const BISHOP_DELTAS = [
	[-1, -1],
	[-1, 1],
	[1, -1],
	[1, 1]
] as const;

const ROOK_DELTAS = [
	[-1, 0],
	[1, 0],
	[0, -1],
	[0, 1]
] as const;

const QUEEN_DELTAS = [...BISHOP_DELTAS, ...ROOK_DELTAS] as const;

export function encodeMove(
	from: number,
	to: number,
	promotion: PieceType = PieceType.EMPTY
): MoveInt8 {
	assertSquare(from);
	assertSquare(to);
	if (
		promotion !== PieceType.EMPTY &&
		!PROMOTION_PIECES.includes(promotion as (typeof PROMOTION_PIECES)[number])
	) {
		throw new Error(`Invalid promotion piece: ${promotion}`);
	}
	return from | (to << 6) | (promotion << 12);
}

export function moveFrom(move: MoveInt8): number {
	return move & 0x3f;
}

export function moveTo(move: MoveInt8): number {
	return (move >> 6) & 0x3f;
}

export function movePromotion(move: MoveInt8): number {
	return (move >> 12) & 0x7;
}

export function square(file: number, rank: number): number {
	if (!isSquareInsideBoard(file, rank)) {
		throw new Error(`Invalid square coordinates: ${file}, ${rank}`);
	}
	return rank * BOARD_WIDTH + file;
}

export function squareFile(square: number): number {
	assertSquare(square);
	return square & (BOARD_WIDTH - 1);
}

export function squareRank(square: number): number {
	assertSquare(square);
	return square >> 3;
}

export function squareFromAlgebraic(position: string): number {
	if (!/^[a-h][1-8]$/.test(position)) {
		throw new Error(`Invalid algebraic square: ${position}`);
	}
	return square(position.charCodeAt(0) - 97, Number(position[1]) - 1);
}

export function squareToAlgebraic(square: number): string {
	return `${String.fromCharCode(97 + squareFile(square))}${squareRank(square) + 1}`;
}

export function moveToUci(move: MoveInt8): string {
	const promotion = movePromotion(move);
	return `${squareToAlgebraic(moveFrom(move))}${squareToAlgebraic(moveTo(move))}${
		promotion ? promotionToUci(promotion) : ''
	}`;
}

export class BoardInt8 implements AbstractBoard<MoveBufferInt8, MoveInt8> {
	readonly board = new Int8Array(BOARD_SIZE);
	readonly pieceSquares = new Uint8Array(MAX_PIECES);
	readonly pieceCodes = new Int8Array(MAX_PIECES);
	readonly squareToPiece = new Uint8Array(BOARD_SIZE);

	turn: PieceColor = PieceColor.WHITE;
	castlingRights = 0;
	enPassantSquare = -1;
	halfMoveClock = 0;
	fullMoveNumber = 1;
	whiteKingSquare = -1;
	blackKingSquare = -1;

	private pieceCount = 0;
	private historyCount = 0;

	private readonly moveBuffers = Array.from(
		{ length: MAX_MOVE_DEPTH },
		() => new Int32Array(MAX_MOVES)
	);
	private readonly mobilityBuffer = new Int32Array(MAX_MOVES);

	private readonly historyMove = new Int32Array(MAX_HISTORY);
	private readonly historyPiece = new Int8Array(MAX_HISTORY);
	private readonly historyMovedPieceIndex = new Int16Array(MAX_HISTORY);
	private readonly historyCapturedPiece = new Int8Array(MAX_HISTORY);
	private readonly historyCapturedPieceIndex = new Int16Array(MAX_HISTORY);
	private readonly historyCapturedSquare = new Int16Array(MAX_HISTORY);
	private readonly historyRookPiece = new Int8Array(MAX_HISTORY);
	private readonly historyRookPieceIndex = new Int16Array(MAX_HISTORY);
	private readonly historyRookFrom = new Int16Array(MAX_HISTORY);
	private readonly historyRookTo = new Int16Array(MAX_HISTORY);
	private readonly historyPreviousTurn = new Int8Array(MAX_HISTORY);
	private readonly historyPreviousCastlingRights = new Int8Array(MAX_HISTORY);
	private readonly historyPreviousEnPassantSquare = new Int16Array(MAX_HISTORY);
	private readonly historyPreviousHalfMoveClock = new Int32Array(MAX_HISTORY);
	private readonly historyPreviousFullMoveNumber = new Int32Array(MAX_HISTORY);
	private readonly historyPreviousWhiteKingSquare = new Int16Array(MAX_HISTORY);
	private readonly historyPreviousBlackKingSquare = new Int16Array(MAX_HISTORY);

	constructor(fen = INITIAL_FEN) {
		this.pieceSquares.fill(NO_SQUARE);
		this.loadFen(fen);
	}

	loadFen(fen: string): void {
		const fenParts = fen.trim().split(/\s+/);
		if (!fenParts[0]) {
			throw new Error('Invalid FEN string: missing piece placement');
		}

		this.clear();
		this.loadPiecePlacement(fenParts[0]);
		this.turn = parseTurn(fenParts[1] ?? 'w');
		this.castlingRights = parseCastlingRights(fenParts[2] ?? '-');
		this.enPassantSquare = parseEnPassantSquare(fenParts[3] ?? '-', this.turn, this.board);
		this.halfMoveClock = parseFenInteger(fenParts[4] ?? '0', 'half move clock', 0);
		this.fullMoveNumber = parseFenInteger(fenParts[5] ?? '1', 'full move number', 1);
		this.validateKings();
		this.historyCount = 0;
	}

	allocateMoveBuffer(): MoveBufferInt8 {
		return new Int32Array(MAX_MOVES);
	}

	getMoveByIndex(buffer: MoveBufferInt8, index: number): MoveInt8 {
		if (index < 0 || index >= buffer.length) {
			throw new Error(`Move index out of bounds: ${index}`);
		}
		return buffer[index];
	}

	generatePseudoLegalMoves(out: MoveBufferInt8): number {
		let count = 0;

		for (let pieceIndex = 0; pieceIndex < this.pieceCount; pieceIndex++) {
			const from = this.pieceSquares[pieceIndex];
			if (from === NO_SQUARE) continue;

			const piece = this.pieceCodes[pieceIndex];
			if (piece === PieceType.EMPTY || colorOf(piece) !== this.turn) continue;

			switch (Math.abs(piece)) {
				case PieceType.PAWN:
					count = this.generatePawnMoves(out, count, from, piece);
					break;
				case PieceType.KNIGHT:
					count = this.generateJumpMoves(out, count, from, piece, KNIGHT_DELTAS);
					break;
				case PieceType.BISHOP:
					count = this.generateSlidingMoves(out, count, from, piece, BISHOP_DELTAS);
					break;
				case PieceType.ROOK:
					count = this.generateSlidingMoves(out, count, from, piece, ROOK_DELTAS);
					break;
				case PieceType.QUEEN:
					count = this.generateSlidingMoves(out, count, from, piece, QUEEN_DELTAS);
					break;
				case PieceType.KING:
					count = this.generateKingMoves(out, count, from, piece);
					break;
			}
		}

		return count;
	}

	generateLegalMoves(out: MoveBufferInt8, moveDepth = 0): number {
		if (moveDepth < 0 || moveDepth >= MAX_MOVE_DEPTH) {
			throw new Error(`Move generation depth out of bounds: ${moveDepth}`);
		}

		const pseudoMoves = this.moveBuffers[moveDepth];
		const pseudoCount = this.generatePseudoLegalMoves(pseudoMoves);
		const movingColor = this.turn;
		let legalCount = 0;

		for (let i = 0; i < pseudoCount; i++) {
			const move = pseudoMoves[i];
			if (this.isCastlingMove(move) && !this.canCastleThroughCheck(move, movingColor)) {
				continue;
			}

			this.makeMove(move);
			const kingSquare =
				movingColor === PieceColor.WHITE ? this.whiteKingSquare : this.blackKingSquare;
			const isLegal = !this.isSquareAttacked(kingSquare, -movingColor);
			this.unmakeMove(move);

			if (isLegal) {
				legalCount = addMove(out, legalCount, move);
			}
		}

		return legalCount;
	}

	isSquareAttacked(square: number, byColor: PieceColor | Piece): boolean {
		assertSquare(square);
		const attackingColor = normalizeColor(byColor);
		const file = square & (BOARD_WIDTH - 1);

		if (attackingColor === PieceColor.WHITE) {
			if (file > 0 && this.board[square - BOARD_WIDTH - 1] === Piece.WHITE_PAWN) return true;
			if (file < BOARD_WIDTH - 1 && this.board[square - BOARD_WIDTH + 1] === Piece.WHITE_PAWN) {
				return true;
			}
		} else {
			if (file > 0 && this.board[square + BOARD_WIDTH - 1] === Piece.BLACK_PAWN) return true;
			if (file < BOARD_WIDTH - 1 && this.board[square + BOARD_WIDTH + 1] === Piece.BLACK_PAWN) {
				return true;
			}
		}

		if (this.isJumpAttacked(square, attackingColor * PieceType.KNIGHT, KNIGHT_DELTAS)) return true;
		if (this.isJumpAttacked(square, attackingColor * PieceType.KING, KING_DELTAS)) return true;
		if (
			this.isRayAttacked(square, attackingColor, BISHOP_DELTAS, PieceType.BISHOP, PieceType.QUEEN)
		)
			return true;
		return this.isRayAttacked(square, attackingColor, ROOK_DELTAS, PieceType.ROOK, PieceType.QUEEN);
	}

	makeMove(move: MoveInt8): void {
		const from = moveFrom(move);
		const to = moveTo(move);
		const piece = this.board[from];
		if (piece === PieceType.EMPTY) {
			throw new Error(`Cannot move from empty square: ${squareToAlgebraic(from)}`);
		}
		if (colorOf(piece) !== this.turn) {
			throw new Error(`Cannot move opponent piece: ${squareToAlgebraic(from)}`);
		}
		if (this.squareToPiece[from] === 0) {
			throw new Error(`Missing piece index for square: ${squareToAlgebraic(from)}`);
		}
		const targetPiece = this.board[to];
		if (targetPiece !== PieceType.EMPTY && colorOf(targetPiece) === this.turn) {
			throw new Error(`Cannot capture own piece: ${squareToAlgebraic(to)}`);
		}

		const movingColor = this.turn;
		const movedPieceIndex = this.squareToPiece[from] - 1;
		const promotion = movePromotion(move);
		this.validatePromotionMove(from, to, piece, promotion);
		const isEnPassant = this.isEnPassantMove(from, to, piece);
		const capturedSquare = isEnPassant ? to - movingColor * BOARD_WIDTH : to;
		const capturedPiece = this.board[capturedSquare];
		const capturedPieceIndex =
			capturedPiece === PieceType.EMPTY ? -1 : this.squareToPiece[capturedSquare] - 1;
		const isCastling = Math.abs(piece) === PieceType.KING && Math.abs(to - from) === 2;
		const rookFrom = isCastling ? (to > from ? from + 3 : from - 4) : -1;
		const rookTo = isCastling ? (to > from ? from + 1 : from - 1) : -1;
		const rookPiece = isCastling ? this.board[rookFrom] : PieceType.EMPTY;
		const rookPieceIndex = rookPiece === PieceType.EMPTY ? -1 : this.squareToPiece[rookFrom] - 1;
		const h = this.historyCount;
		if (h >= MAX_HISTORY) {
			throw new Error(`Move history capacity exceeded: ${MAX_HISTORY}`);
		}

		this.historyMove[h] = move;
		this.historyPiece[h] = piece;
		this.historyMovedPieceIndex[h] = movedPieceIndex;
		this.historyCapturedPiece[h] = capturedPiece;
		this.historyCapturedPieceIndex[h] = capturedPieceIndex;
		this.historyCapturedSquare[h] = capturedPiece === PieceType.EMPTY ? -1 : capturedSquare;
		this.historyRookPiece[h] = rookPiece;
		this.historyRookPieceIndex[h] = rookPieceIndex;
		this.historyRookFrom[h] = rookFrom;
		this.historyRookTo[h] = rookTo;
		this.historyPreviousTurn[h] = this.turn;
		this.historyPreviousCastlingRights[h] = this.castlingRights;
		this.historyPreviousEnPassantSquare[h] = this.enPassantSquare;
		this.historyPreviousHalfMoveClock[h] = this.halfMoveClock;
		this.historyPreviousFullMoveNumber[h] = this.fullMoveNumber;
		this.historyPreviousWhiteKingSquare[h] = this.whiteKingSquare;
		this.historyPreviousBlackKingSquare[h] = this.blackKingSquare;
		this.historyCount = h + 1;

		this.board[from] = PieceType.EMPTY;
		this.squareToPiece[from] = 0;

		if (capturedPiece !== PieceType.EMPTY) {
			this.board[capturedSquare] = PieceType.EMPTY;
			this.squareToPiece[capturedSquare] = 0;
			this.pieceSquares[capturedPieceIndex] = NO_SQUARE;
		}

		const placedPiece = promotion === PieceType.EMPTY ? piece : movingColor * promotion;
		this.board[to] = placedPiece;
		this.squareToPiece[to] = movedPieceIndex + 1;
		this.pieceSquares[movedPieceIndex] = to;
		this.pieceCodes[movedPieceIndex] = placedPiece;

		if (Math.abs(piece) === PieceType.KING) {
			if (movingColor === PieceColor.WHITE) {
				this.whiteKingSquare = to;
			} else {
				this.blackKingSquare = to;
			}
		}

		if (isCastling && rookPiece !== PieceType.EMPTY) {
			this.board[rookFrom] = PieceType.EMPTY;
			this.squareToPiece[rookFrom] = 0;
			this.board[rookTo] = rookPiece;
			this.squareToPiece[rookTo] = rookPieceIndex + 1;
			this.pieceSquares[rookPieceIndex] = rookTo;
		}

		this.updateCastlingRightsAfterMove(from, piece, capturedSquare, capturedPiece);
		this.enPassantSquare =
			Math.abs(piece) === PieceType.PAWN && Math.abs(to - from) === BOARD_WIDTH * 2
				? from + movingColor * BOARD_WIDTH
				: -1;
		this.halfMoveClock =
			Math.abs(piece) === PieceType.PAWN || capturedPiece !== PieceType.EMPTY
				? 0
				: this.halfMoveClock + 1;
		if (movingColor === PieceColor.BLACK) {
			this.fullMoveNumber += 1;
		}
		this.turn = oppositeColor(this.turn);
	}

	unmakeMove(move: MoveInt8): void {
		if (this.historyCount <= 0) {
			throw new Error('Cannot unmake move without history');
		}

		const h = this.historyCount - 1;
		if (this.historyMove[h] !== move) {
			throw new Error(`Cannot unmake non-LIFO move: ${moveToUci(move)}`);
		}
		this.historyCount = h;

		const from = moveFrom(move);
		const to = moveTo(move);
		const piece = this.historyPiece[h];
		const movedPieceIndex = this.historyMovedPieceIndex[h];
		const capturedPiece = this.historyCapturedPiece[h];
		const capturedPieceIndex = this.historyCapturedPieceIndex[h];
		const capturedSquare = this.historyCapturedSquare[h];
		const rookPiece = this.historyRookPiece[h];
		const rookPieceIndex = this.historyRookPieceIndex[h];
		const rookFrom = this.historyRookFrom[h];
		const rookTo = this.historyRookTo[h];

		if (rookPiece !== PieceType.EMPTY) {
			this.board[rookTo] = PieceType.EMPTY;
			this.squareToPiece[rookTo] = 0;
			this.board[rookFrom] = rookPiece;
			this.squareToPiece[rookFrom] = rookPieceIndex + 1;
			this.pieceSquares[rookPieceIndex] = rookFrom;
			this.pieceCodes[rookPieceIndex] = rookPiece;
		}

		this.board[to] = PieceType.EMPTY;
		this.squareToPiece[to] = 0;
		this.board[from] = piece;
		this.squareToPiece[from] = movedPieceIndex + 1;
		this.pieceSquares[movedPieceIndex] = from;
		this.pieceCodes[movedPieceIndex] = piece;

		if (capturedPiece !== PieceType.EMPTY) {
			this.board[capturedSquare] = capturedPiece;
			this.squareToPiece[capturedSquare] = capturedPieceIndex + 1;
			this.pieceSquares[capturedPieceIndex] = capturedSquare;
			this.pieceCodes[capturedPieceIndex] = capturedPiece;
		}

		this.turn = colorOf(this.historyPreviousTurn[h]);
		this.castlingRights = this.historyPreviousCastlingRights[h];
		this.enPassantSquare = this.historyPreviousEnPassantSquare[h];
		this.halfMoveClock = this.historyPreviousHalfMoveClock[h];
		this.fullMoveNumber = this.historyPreviousFullMoveNumber[h];
		this.whiteKingSquare = this.historyPreviousWhiteKingSquare[h];
		this.blackKingSquare = this.historyPreviousBlackKingSquare[h];
	}

	evaluateMaterial(): number {
		let score = 0;

		for (let i = 0; i < this.pieceCount; i++) {
			if (this.pieceSquares[i] === NO_SQUARE) continue;

			const piece = this.pieceCodes[i];
			score += colorOf(piece) * MATERIAL_VALUES[Math.abs(piece)];
		}

		return score;
	}

	evaluatePST(): number {
		let score = 0;
		const boardCenter = (BOARD_WIDTH - 1) / 2;

		for (let i = 0; i < this.pieceCount; i++) {
			const boardSquare = this.pieceSquares[i];
			if (boardSquare === NO_SQUARE) continue;

			const piece = this.pieceCodes[i];
			const color = colorOf(piece);
			const file = boardSquare & (BOARD_WIDTH - 1);
			const rank = boardSquare >> 3;
			const normalizedRank = color === PieceColor.WHITE ? rank : BOARD_WIDTH - 1 - rank;
			const centerBonus = Math.round(
				(BOARD_WIDTH - 1 - (Math.abs(file - boardCenter) + Math.abs(rank - boardCenter))) * 2
			);

			switch (Math.abs(piece)) {
				case PieceType.PAWN:
					score += color * normalizedRank * 5;
					break;
				case PieceType.KNIGHT:
				case PieceType.BISHOP:
					score += color * centerBonus * 3;
					break;
				case PieceType.ROOK:
					score += color * normalizedRank;
					break;
				case PieceType.QUEEN:
					score += color * centerBonus;
					break;
				case PieceType.KING:
					score -= color * centerBonus;
					break;
			}
		}
		return score;
	}

	evaluateMobility(): number {
		const previousTurn = this.turn;
		const buffer = this.mobilityBuffer;
		this.turn = PieceColor.WHITE;
		const whiteMoves = this.generatePseudoLegalMoves(buffer);
		this.turn = PieceColor.BLACK;
		const blackMoves = this.generatePseudoLegalMoves(buffer);
		this.turn = previousTurn;
		return (whiteMoves - blackMoves) * 5;
	}

	evaluate(): number {
		return this.evaluateMaterial() + this.evaluatePST() + this.evaluateMobility();
	}

	toFen(): string {
		const rows: string[] = [];
		for (let rank = BOARD_WIDTH - 1; rank >= 0; rank--) {
			let row = '';
			let emptyCount = 0;

			for (let file = 0; file < BOARD_WIDTH; file++) {
				const piece = this.board[rank * BOARD_WIDTH + file];
				if (piece === PieceType.EMPTY) {
					emptyCount++;
					continue;
				}
				if (emptyCount > 0) {
					row += emptyCount;
					emptyCount = 0;
				}
				row += pieceToFen(piece);
			}

			if (emptyCount > 0) {
				row += emptyCount;
			}
			rows.push(row);
		}

		const castling = castlingRightsToFen(this.castlingRights);
		const enPassant = this.enPassantSquare < 0 ? '-' : squareToAlgebraic(this.enPassantSquare);
		return `${rows.join('/')} ${this.turn === PieceColor.WHITE ? 'w' : 'b'} ${castling} ${enPassant} ${
			this.halfMoveClock
		} ${this.fullMoveNumber}`;
	}

	private clear(): void {
		this.board.fill(PieceType.EMPTY);
		this.pieceSquares.fill(NO_SQUARE);
		this.pieceCodes.fill(PieceType.EMPTY);
		this.squareToPiece.fill(0);
		this.pieceCount = 0;
		this.turn = PieceColor.WHITE;
		this.castlingRights = 0;
		this.enPassantSquare = -1;
		this.halfMoveClock = 0;
		this.fullMoveNumber = 1;
		this.whiteKingSquare = -1;
		this.blackKingSquare = -1;
	}

	private loadPiecePlacement(piecePlacement: string): void {
		let rank = BOARD_WIDTH - 1;
		let file = 0;

		for (const char of piecePlacement) {
			if (char === '/') {
				if (file !== BOARD_WIDTH) {
					throw new Error(`Invalid FEN row width in piece placement: ${piecePlacement}`);
				}
				rank--;
				file = 0;
				continue;
			}

			if (/^[1-8]$/.test(char)) {
				file += Number(char);
				if (file > BOARD_WIDTH) {
					throw new Error(`Invalid FEN row width in piece placement: ${piecePlacement}`);
				}
				continue;
			}

			const piece = pieceFromFen(char);
			if (piece === null) {
				throw new Error(`Invalid FEN piece: ${char}`);
			}
			if (!isSquareInsideBoard(file, rank)) {
				throw new Error(`Invalid FEN square for piece: ${char}`);
			}

			this.addPiece(square(file, rank), piece);
			file++;
		}

		if (rank !== 0 || file !== BOARD_WIDTH) {
			throw new Error(`Invalid FEN piece placement: ${piecePlacement}`);
		}
	}

	private validateKings(): void {
		let whiteKings = 0;
		let blackKings = 0;

		for (let pieceIndex = 0; pieceIndex < this.pieceCount; pieceIndex++) {
			if (this.pieceCodes[pieceIndex] === Piece.WHITE_KING) {
				whiteKings++;
			} else if (this.pieceCodes[pieceIndex] === Piece.BLACK_KING) {
				blackKings++;
			}
		}

		if (whiteKings !== 1 || blackKings !== 1) {
			throw new Error('Invalid FEN string: expected exactly one king for each side');
		}
	}

	private addPiece(boardSquare: number, piece: number): void {
		if (this.pieceCount >= MAX_PIECES) {
			throw new Error(`Invalid FEN string: more than ${MAX_PIECES} pieces`);
		}

		const pieceIndex = this.pieceCount++;
		this.board[boardSquare] = piece;
		this.pieceSquares[pieceIndex] = boardSquare;
		this.pieceCodes[pieceIndex] = piece;
		this.squareToPiece[boardSquare] = pieceIndex + 1;

		if (piece === Piece.WHITE_KING) {
			this.whiteKingSquare = boardSquare;
		} else if (piece === Piece.BLACK_KING) {
			this.blackKingSquare = boardSquare;
		}
	}

	private generatePawnMoves(
		out: MoveBufferInt8,
		count: number,
		from: number,
		piece: number
	): number {
		const color = colorOf(piece);
		const file = from & (BOARD_WIDTH - 1);
		const rank = from >> 3;
		const direction = color === PieceColor.WHITE ? 1 : -1;
		const nextRank = rank + direction;
		const startRank = color === PieceColor.WHITE ? 1 : 6;

		if (isSquareInsideBoard(file, nextRank)) {
			const oneForward = nextRank * BOARD_WIDTH + file;
			if (this.board[oneForward] === PieceType.EMPTY) {
				count = this.addPawnMove(out, count, from, oneForward, color);

				const doubleRank = rank + direction * 2;
				if (rank === startRank && isSquareInsideBoard(file, doubleRank)) {
					const twoForward = doubleRank * BOARD_WIDTH + file;
					if (this.board[twoForward] === PieceType.EMPTY) {
						count = addMove(out, count, encodeMove(from, twoForward));
					}
				}
			}
		}

		let captureFile = file - 1;
		if (isSquareInsideBoard(captureFile, nextRank)) {
			const to = nextRank * BOARD_WIDTH + captureFile;
			const target = this.board[to];
			if (target !== PieceType.EMPTY && colorOf(target) !== color) {
				count = this.addPawnMove(out, count, from, to, color);
			} else if (to === this.enPassantSquare && this.hasEnPassantVictim(to, color)) {
				count = addMove(out, count, encodeMove(from, to));
			}
		}

		captureFile = file + 1;
		if (isSquareInsideBoard(captureFile, nextRank)) {
			const to = nextRank * BOARD_WIDTH + captureFile;
			const target = this.board[to];
			if (target !== PieceType.EMPTY && colorOf(target) !== color) {
				count = this.addPawnMove(out, count, from, to, color);
			} else if (to === this.enPassantSquare && this.hasEnPassantVictim(to, color)) {
				count = addMove(out, count, encodeMove(from, to));
			}
		}

		return count;
	}

	private addPawnMove(
		out: MoveBufferInt8,
		count: number,
		from: number,
		to: number,
		color: number
	): number {
		const promotionRank = color === PieceColor.WHITE ? BOARD_WIDTH - 1 : 0;
		if (to >> 3 !== promotionRank) {
			return addMove(out, count, encodeMove(from, to));
		}

		for (let i = 0; i < PROMOTION_PIECES.length; i++) {
			count = addMove(out, count, encodeMove(from, to, PROMOTION_PIECES[i]));
		}
		return count;
	}

	private generateJumpMoves(
		out: MoveBufferInt8,
		count: number,
		from: number,
		piece: number,
		deltas: readonly (readonly [number, number])[]
	): number {
		const color = colorOf(piece);
		const fromFile = from & (BOARD_WIDTH - 1);
		const fromRank = from >> 3;

		for (let i = 0; i < deltas.length; i++) {
			const delta = deltas[i];
			const fileDelta = delta[0];
			const rankDelta = delta[1];
			const toFile = fromFile + fileDelta;
			const toRank = fromRank + rankDelta;
			if (!isSquareInsideBoard(toFile, toRank)) continue;

			const to = toRank * BOARD_WIDTH + toFile;
			const target = this.board[to];
			if (target === PieceType.EMPTY || colorOf(target) !== color) {
				count = addMove(out, count, encodeMove(from, to));
			}
		}

		return count;
	}

	private generateSlidingMoves(
		out: MoveBufferInt8,
		count: number,
		from: number,
		piece: number,
		deltas: readonly (readonly [number, number])[]
	): number {
		const color = colorOf(piece);
		const fromFile = from & (BOARD_WIDTH - 1);
		const fromRank = from >> 3;

		for (let i = 0; i < deltas.length; i++) {
			const delta = deltas[i];
			const fileDelta = delta[0];
			const rankDelta = delta[1];
			let toFile = fromFile + fileDelta;
			let toRank = fromRank + rankDelta;

			while (isSquareInsideBoard(toFile, toRank)) {
				const to = toRank * BOARD_WIDTH + toFile;
				const target = this.board[to];
				if (target === PieceType.EMPTY) {
					count = addMove(out, count, encodeMove(from, to));
				} else {
					if (colorOf(target) !== color) {
						count = addMove(out, count, encodeMove(from, to));
					}
					break;
				}
				toFile += fileDelta;
				toRank += rankDelta;
			}
		}

		return count;
	}

	private generateKingMoves(
		out: MoveBufferInt8,
		count: number,
		from: number,
		piece: number
	): number {
		count = this.generateJumpMoves(out, count, from, piece, KING_DELTAS);
		const color = colorOf(piece);

		if (color === PieceColor.WHITE && from === E1) {
			if (
				(this.castlingRights & CASTLE_WHITE_KING) !== 0 &&
				this.board[H1] === Piece.WHITE_ROOK &&
				this.board[F1] === PieceType.EMPTY &&
				this.board[G1] === PieceType.EMPTY
			) {
				count = addMove(out, count, encodeMove(from, G1));
			}
			if (
				(this.castlingRights & CASTLE_WHITE_QUEEN) !== 0 &&
				this.board[A1] === Piece.WHITE_ROOK &&
				this.board[D1] === PieceType.EMPTY &&
				this.board[C1] === PieceType.EMPTY &&
				this.board[B1] === PieceType.EMPTY
			) {
				count = addMove(out, count, encodeMove(from, C1));
			}
		}

		if (color === PieceColor.BLACK && from === E8) {
			if (
				(this.castlingRights & CASTLE_BLACK_KING) !== 0 &&
				this.board[H8] === Piece.BLACK_ROOK &&
				this.board[F8] === PieceType.EMPTY &&
				this.board[G8] === PieceType.EMPTY
			) {
				count = addMove(out, count, encodeMove(from, G8));
			}
			if (
				(this.castlingRights & CASTLE_BLACK_QUEEN) !== 0 &&
				this.board[A8] === Piece.BLACK_ROOK &&
				this.board[D8] === PieceType.EMPTY &&
				this.board[C8] === PieceType.EMPTY &&
				this.board[B8] === PieceType.EMPTY
			) {
				count = addMove(out, count, encodeMove(from, C8));
			}
		}

		return count;
	}

	private isJumpAttacked(
		targetSquare: number,
		attackerPiece: number,
		deltas: readonly (readonly [number, number])[]
	): boolean {
		const targetFile = targetSquare & (BOARD_WIDTH - 1);
		const targetRank = targetSquare >> 3;

		for (let i = 0; i < deltas.length; i++) {
			const delta = deltas[i];
			const fileDelta = delta[0];
			const rankDelta = delta[1];
			const fromFile = targetFile + fileDelta;
			const fromRank = targetRank + rankDelta;
			if (
				isSquareInsideBoard(fromFile, fromRank) &&
				this.board[fromRank * BOARD_WIDTH + fromFile] === attackerPiece
			) {
				return true;
			}
		}

		return false;
	}

	private isRayAttacked(
		targetSquare: number,
		attackingColor: PieceColor,
		deltas: readonly (readonly [number, number])[],
		firstAttackerType: number,
		secondAttackerType: number
	): boolean {
		const targetFile = targetSquare & (BOARD_WIDTH - 1);
		const targetRank = targetSquare >> 3;

		for (let i = 0; i < deltas.length; i++) {
			const delta = deltas[i];
			const fileDelta = delta[0];
			const rankDelta = delta[1];
			let fromFile = targetFile + fileDelta;
			let fromRank = targetRank + rankDelta;

			while (isSquareInsideBoard(fromFile, fromRank)) {
				const piece = this.board[fromRank * BOARD_WIDTH + fromFile];
				if (piece !== PieceType.EMPTY) {
					if (colorOf(piece) !== attackingColor) {
						break;
					}
					const pieceType = Math.abs(piece);
					if (pieceType === firstAttackerType || pieceType === secondAttackerType) {
						return true;
					}
					break;
				}
				fromFile += fileDelta;
				fromRank += rankDelta;
			}
		}

		return false;
	}

	private isCastlingMove(move: MoveInt8): boolean {
		const from = moveFrom(move);
		const to = moveTo(move);
		return Math.abs(this.board[from]) === PieceType.KING && Math.abs(to - from) === 2;
	}

	private canCastleThroughCheck(move: MoveInt8, movingColor: number): boolean {
		const from = moveFrom(move);
		const to = moveTo(move);
		const step = to > from ? 1 : -1;
		const opponent = -movingColor;
		return (
			!this.isSquareAttacked(from, opponent) &&
			!this.isSquareAttacked(from + step, opponent) &&
			!this.isSquareAttacked(to, opponent)
		);
	}

	private isEnPassantMove(from: number, to: number, piece: number): boolean {
		return (
			Math.abs(piece) === PieceType.PAWN &&
			to === this.enPassantSquare &&
			this.board[to] === PieceType.EMPTY &&
			(from & (BOARD_WIDTH - 1)) !== (to & (BOARD_WIDTH - 1))
		);
	}

	private hasEnPassantVictim(to: number, movingColor: number): boolean {
		const capturedSquare = to - movingColor * BOARD_WIDTH;
		return (
			isValidSquare(capturedSquare) && this.board[capturedSquare] === -movingColor * PieceType.PAWN
		);
	}

	private updateCastlingRightsAfterMove(
		from: number,
		piece: number,
		capturedSquare: number,
		capturedPiece: number
	): void {
		if (piece === Piece.WHITE_KING) {
			this.castlingRights &= ~(CASTLE_WHITE_KING | CASTLE_WHITE_QUEEN);
		} else if (piece === Piece.BLACK_KING) {
			this.castlingRights &= ~(CASTLE_BLACK_KING | CASTLE_BLACK_QUEEN);
		} else if (piece === Piece.WHITE_ROOK) {
			this.clearCastlingRightForRookSquare(from, PieceColor.WHITE);
		} else if (piece === Piece.BLACK_ROOK) {
			this.clearCastlingRightForRookSquare(from, PieceColor.BLACK);
		}

		if (capturedPiece === Piece.WHITE_ROOK) {
			this.clearCastlingRightForRookSquare(capturedSquare, PieceColor.WHITE);
		} else if (capturedPiece === Piece.BLACK_ROOK) {
			this.clearCastlingRightForRookSquare(capturedSquare, PieceColor.BLACK);
		}
	}

	private clearCastlingRightForRookSquare(rookSquare: number, color: number): void {
		if (color === PieceColor.WHITE) {
			if (rookSquare === H1) this.castlingRights &= ~CASTLE_WHITE_KING;
			if (rookSquare === A1) this.castlingRights &= ~CASTLE_WHITE_QUEEN;
		} else {
			if (rookSquare === H8) this.castlingRights &= ~CASTLE_BLACK_KING;
			if (rookSquare === A8) this.castlingRights &= ~CASTLE_BLACK_QUEEN;
		}
	}

	private validatePromotionMove(from: number, to: number, piece: number, promotion: number): void {
		if (
			promotion !== PieceType.EMPTY &&
			!PROMOTION_PIECES.includes(promotion as (typeof PROMOTION_PIECES)[number])
		) {
			throw new Error(`Invalid promotion piece: ${promotion}`);
		}

		if (Math.abs(piece) !== PieceType.PAWN) {
			if (promotion !== PieceType.EMPTY) {
				throw new Error('Cannot promote a non-pawn move');
			}
			return;
		}

		const promotionRank = colorOf(piece) === PieceColor.WHITE ? BOARD_WIDTH - 1 : 0;
		const reachesPromotionRank = to >> 3 === promotionRank;
		if (reachesPromotionRank && promotion === PieceType.EMPTY) {
			throw new Error(`Pawn move to ${squareToAlgebraic(to)} requires promotion`);
		}
		if (!reachesPromotionRank && promotion !== PieceType.EMPTY) {
			throw new Error(`Pawn move to ${squareToAlgebraic(to)} cannot promote`);
		}
		if (Math.abs(to - from) === BOARD_WIDTH * 2 && promotion !== PieceType.EMPTY) {
			throw new Error('Double pawn pushes cannot promote');
		}
	}
}

function addMove(out: MoveBufferInt8, count: number, move: MoveInt8): number {
	if (count >= out.length) {
		throw new Error(`Move buffer capacity exceeded: ${out.length}`);
	}
	out[count] = move;
	return count + 1;
}

function assertSquare(square: number): void {
	if (!isValidSquare(square)) {
		throw new Error(`Invalid square index: ${square}`);
	}
}

function isValidSquare(square: number): boolean {
	return Number.isInteger(square) && square >= 0 && square < BOARD_SIZE;
}

function isSquareInsideBoard(file: number, rank: number): boolean {
	return file >= 0 && file < BOARD_WIDTH && rank >= 0 && rank < BOARD_WIDTH;
}

function colorOf(piece: number): PieceColor {
	return piece > 0 ? PieceColor.WHITE : PieceColor.BLACK;
}

function oppositeColor(color: PieceColor): PieceColor {
	return -color as PieceColor;
}

function normalizeColor(color: number): PieceColor {
	if (color > 0) return PieceColor.WHITE;
	if (color < 0) return PieceColor.BLACK;
	throw new Error(`Invalid color: ${color}`);
}

function parseTurn(turn: string): PieceColor {
	if (turn === 'w') return PieceColor.WHITE;
	if (turn === 'b') return PieceColor.BLACK;
	throw new Error(`Invalid FEN turn: ${turn}`);
}

function parseCastlingRights(castling: string): number {
	if (castling === '-') return 0;

	let rights = 0;
	for (const char of castling) {
		switch (char) {
			case 'K':
				rights |= CASTLE_WHITE_KING;
				break;
			case 'Q':
				rights |= CASTLE_WHITE_QUEEN;
				break;
			case 'k':
				rights |= CASTLE_BLACK_KING;
				break;
			case 'q':
				rights |= CASTLE_BLACK_QUEEN;
				break;
			default:
				throw new Error(`Invalid FEN castling rights: ${castling}`);
		}
	}
	return rights;
}

function parseEnPassantSquare(enPassant: string, turn: number, board: Int8Array): number {
	if (enPassant === '-') return -1;

	const target = squareFromAlgebraic(enPassant);
	const expectedRank = turn === PieceColor.WHITE ? 5 : 2;
	if (squareRank(target) !== expectedRank) {
		throw new Error(`Invalid FEN en passant target for side to move: ${enPassant}`);
	}
	if (board[target] !== PieceType.EMPTY) {
		throw new Error(`Invalid FEN en passant target is occupied: ${enPassant}`);
	}

	const victimSquare = target - turn * BOARD_WIDTH;
	if (!isValidSquare(victimSquare) || board[victimSquare] !== -turn * PieceType.PAWN) {
		throw new Error(`Invalid FEN en passant target has no capturable pawn: ${enPassant}`);
	}

	return target;
}

function parseFenInteger(value: string, name: string, min: number): number {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < min) {
		throw new Error(`Invalid FEN ${name}: ${value}`);
	}
	return parsed;
}

function pieceFromFen(char: string): number | null {
	switch (char) {
		case 'P':
			return Piece.WHITE_PAWN;
		case 'N':
			return Piece.WHITE_KNIGHT;
		case 'B':
			return Piece.WHITE_BISHOP;
		case 'R':
			return Piece.WHITE_ROOK;
		case 'Q':
			return Piece.WHITE_QUEEN;
		case 'K':
			return Piece.WHITE_KING;
		case 'p':
			return Piece.BLACK_PAWN;
		case 'n':
			return Piece.BLACK_KNIGHT;
		case 'b':
			return Piece.BLACK_BISHOP;
		case 'r':
			return Piece.BLACK_ROOK;
		case 'q':
			return Piece.BLACK_QUEEN;
		case 'k':
			return Piece.BLACK_KING;
		default:
			return null;
	}
}

function pieceToFen(piece: number): string {
	switch (piece) {
		case Piece.WHITE_PAWN:
			return 'P';
		case Piece.WHITE_KNIGHT:
			return 'N';
		case Piece.WHITE_BISHOP:
			return 'B';
		case Piece.WHITE_ROOK:
			return 'R';
		case Piece.WHITE_QUEEN:
			return 'Q';
		case Piece.WHITE_KING:
			return 'K';
		case Piece.BLACK_PAWN:
			return 'p';
		case Piece.BLACK_KNIGHT:
			return 'n';
		case Piece.BLACK_BISHOP:
			return 'b';
		case Piece.BLACK_ROOK:
			return 'r';
		case Piece.BLACK_QUEEN:
			return 'q';
		case Piece.BLACK_KING:
			return 'k';
		default:
			throw new Error(`Invalid piece code: ${piece}`);
	}
}

function castlingRightsToFen(rights: number): string {
	let castling = '';
	if ((rights & CASTLE_WHITE_KING) !== 0) castling += 'K';
	if ((rights & CASTLE_WHITE_QUEEN) !== 0) castling += 'Q';
	if ((rights & CASTLE_BLACK_KING) !== 0) castling += 'k';
	if ((rights & CASTLE_BLACK_QUEEN) !== 0) castling += 'q';
	return castling || '-';
}

function promotionToUci(promotion: number): string {
	switch (promotion) {
		case PieceType.KNIGHT:
			return 'n';
		case PieceType.BISHOP:
			return 'b';
		case PieceType.ROOK:
			return 'r';
		case PieceType.QUEEN:
			return 'q';
		default:
			throw new Error(`Invalid promotion piece: ${promotion}`);
	}
}
