import type { AbstractBoard } from '$lib/chess/board';

export type CustomMove = number;
export type CustomMoveBuffer = Int32Array;

export const WHITE = 1;
export const BLACK = -1;

export const EMPTY = 0;
export const PAWN = 1;
export const KNIGHT = 2;
export const BISHOP = 3;
export const ROOK = 4;
export const QUEEN = 5;
export const KING = 6;

export const WHITE_PAWN = PAWN;
export const WHITE_KNIGHT = KNIGHT;
export const WHITE_BISHOP = BISHOP;
export const WHITE_ROOK = ROOK;
export const WHITE_QUEEN = QUEEN;
export const WHITE_KING = KING;
export const BLACK_PAWN = -PAWN;
export const BLACK_KNIGHT = -KNIGHT;
export const BLACK_BISHOP = -BISHOP;
export const BLACK_ROOK = -ROOK;
export const BLACK_QUEEN = -QUEEN;
export const BLACK_KING = -KING;

export const NO_SQUARE = 255;
export const MAX_MOVES = 512;
export const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const CASTLE_WHITE_KING = 1;
const CASTLE_WHITE_QUEEN = 2;
const CASTLE_BLACK_KING = 4;
const CASTLE_BLACK_QUEEN = 8;

const PROMOTION_PIECES = [QUEEN, ROOK, BISHOP, KNIGHT] as const;
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

interface UndoState {
	move: CustomMove;
	piece: number;
	movedPieceIndex: number;
	capturedPiece: number;
	capturedPieceIndex: number;
	capturedSquare: number;
	rookPiece: number;
	rookPieceIndex: number;
	rookFrom: number;
	rookTo: number;
	previousTurn: number;
	previousCastlingRights: number;
	previousEnPassantSquare: number;
	previousHalfMoveClock: number;
	previousFullMoveNumber: number;
	previousWhiteKingSquare: number;
	previousBlackKingSquare: number;
}

export function encodeMove(from: number, to: number, promotion = EMPTY): CustomMove {
	assertSquare(from);
	assertSquare(to);
	if (
		promotion !== EMPTY &&
		!PROMOTION_PIECES.includes(promotion as (typeof PROMOTION_PIECES)[number])
	) {
		throw new Error(`Invalid promotion piece: ${promotion}`);
	}
	return from | (to << 6) | (promotion << 12);
}

export function moveFrom(move: CustomMove): number {
	return move & 0x3f;
}

export function moveTo(move: CustomMove): number {
	return (move >> 6) & 0x3f;
}

export function movePromotion(move: CustomMove): number {
	return (move >> 12) & 0x7;
}

export function square(file: number, rank: number): number {
	if (!isInside(file, rank)) {
		throw new Error(`Invalid square coordinates: ${file}, ${rank}`);
	}
	return rank * 8 + file;
}

export function squareFile(square: number): number {
	assertSquare(square);
	return square & 7;
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

export function moveToUci(move: CustomMove): string {
	const promotion = movePromotion(move);
	return `${squareToAlgebraic(moveFrom(move))}${squareToAlgebraic(moveTo(move))}${
		promotion ? promotionToUci(promotion) : ''
	}`;
}

export function createCustomBoard(fen = INITIAL_FEN): CustomBoard {
	return new CustomBoard(fen);
}

export class CustomBoard implements AbstractBoard<CustomMoveBuffer, CustomMove> {
	readonly board = new Int8Array(64);
	readonly pieceSquares = new Uint8Array(32);
	readonly pieceCodes = new Int8Array(32);
	readonly squareToPiece = new Uint8Array(64);

	turn = WHITE;
	castlingRights = 0;
	enPassantSquare = -1;
	halfMoveClock = 0;
	fullMoveNumber = 1;
	whiteKingSquare = -1;
	blackKingSquare = -1;

	private pieceCount = 0;
	private readonly history: UndoState[] = [];

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
		this.history.length = 0;
	}

	allocateMoveBuffer(): CustomMoveBuffer {
		return new Int32Array(MAX_MOVES);
	}

	getMoveByIndex(buffer: CustomMoveBuffer, index: number): CustomMove {
		if (index < 0 || index >= buffer.length) {
			throw new Error(`Move index out of bounds: ${index}`);
		}
		return buffer[index];
	}

	generatePseudoLegalMoves(out: CustomMoveBuffer): number {
		let count = 0;

		for (let pieceIndex = 0; pieceIndex < this.pieceCount; pieceIndex++) {
			const from = this.pieceSquares[pieceIndex];
			if (from === NO_SQUARE) continue;

			const piece = this.pieceCodes[pieceIndex];
			if (piece === EMPTY || colorOf(piece) !== this.turn) continue;

			switch (Math.abs(piece)) {
				case PAWN:
					count = this.generatePawnMoves(out, count, from, piece);
					break;
				case KNIGHT:
					count = this.generateJumpMoves(out, count, from, piece, KNIGHT_DELTAS);
					break;
				case BISHOP:
					count = this.generateSlidingMoves(out, count, from, piece, BISHOP_DELTAS);
					break;
				case ROOK:
					count = this.generateSlidingMoves(out, count, from, piece, ROOK_DELTAS);
					break;
				case QUEEN:
					count = this.generateSlidingMoves(out, count, from, piece, QUEEN_DELTAS);
					break;
				case KING:
					count = this.generateKingMoves(out, count, from, piece);
					break;
			}
		}

		return count;
	}

	generateLegalMoves(out: CustomMoveBuffer): number {
		const pseudoMoves = this.allocateMoveBuffer();
		const pseudoCount = this.generatePseudoLegalMoves(pseudoMoves);
		const movingColor = this.turn;
		let legalCount = 0;

		for (let i = 0; i < pseudoCount; i++) {
			const move = pseudoMoves[i];
			if (this.isCastlingMove(move) && !this.canCastleThroughCheck(move, movingColor)) {
				continue;
			}

			this.makeMove(move);
			const kingSquare = movingColor === WHITE ? this.whiteKingSquare : this.blackKingSquare;
			const isLegal = !this.isSquareAttacked(kingSquare, -movingColor);
			this.unmakeMove(move);

			if (isLegal) {
				legalCount = addMove(out, legalCount, move);
			}
		}

		return legalCount;
	}

	isSquareAttacked(square: number, byColor: number): boolean {
		assertSquare(square);
		const attackingColor = normalizeColor(byColor);
		const file = squareFile(square);

		if (attackingColor === WHITE) {
			if (file > 0 && this.board[square - 9] === WHITE_PAWN) return true;
			if (file < 7 && this.board[square - 7] === WHITE_PAWN) return true;
		} else {
			if (file > 0 && this.board[square + 7] === BLACK_PAWN) return true;
			if (file < 7 && this.board[square + 9] === BLACK_PAWN) return true;
		}

		if (this.isJumpAttacked(square, attackingColor * KNIGHT, KNIGHT_DELTAS)) return true;
		if (this.isJumpAttacked(square, attackingColor * KING, KING_DELTAS)) return true;
		if (this.isRayAttacked(square, attackingColor, BISHOP_DELTAS, BISHOP, QUEEN)) return true;
		return this.isRayAttacked(square, attackingColor, ROOK_DELTAS, ROOK, QUEEN);
	}

	makeMove(move: CustomMove): void {
		const from = moveFrom(move);
		const to = moveTo(move);
		const piece = this.board[from];
		if (piece === EMPTY) {
			throw new Error(`Cannot move from empty square: ${squareToAlgebraic(from)}`);
		}
		if (colorOf(piece) !== this.turn) {
			throw new Error(`Cannot move opponent piece: ${squareToAlgebraic(from)}`);
		}
		if (this.squareToPiece[from] === 0) {
			throw new Error(`Missing piece index for square: ${squareToAlgebraic(from)}`);
		}
		const targetPiece = this.board[to];
		if (targetPiece !== EMPTY && colorOf(targetPiece) === this.turn) {
			throw new Error(`Cannot capture own piece: ${squareToAlgebraic(to)}`);
		}

		const movingColor = this.turn;
		const movedPieceIndex = this.squareToPiece[from] - 1;
		const promotion = movePromotion(move);
		this.validatePromotionMove(from, to, piece, promotion);
		const isEnPassant = this.isEnPassantMove(from, to, piece);
		const capturedSquare = isEnPassant ? to - movingColor * 8 : to;
		const capturedPiece = this.board[capturedSquare];
		const capturedPieceIndex =
			capturedPiece === EMPTY ? -1 : this.squareToPiece[capturedSquare] - 1;
		const isCastling = Math.abs(piece) === KING && Math.abs(to - from) === 2;
		const rookFrom = isCastling ? (to > from ? from + 3 : from - 4) : -1;
		const rookTo = isCastling ? (to > from ? from + 1 : from - 1) : -1;
		const rookPiece = isCastling ? this.board[rookFrom] : EMPTY;
		const rookPieceIndex = rookPiece === EMPTY ? -1 : this.squareToPiece[rookFrom] - 1;

		this.history.push({
			move,
			piece,
			movedPieceIndex,
			capturedPiece,
			capturedPieceIndex,
			capturedSquare,
			rookPiece,
			rookPieceIndex,
			rookFrom,
			rookTo,
			previousTurn: this.turn,
			previousCastlingRights: this.castlingRights,
			previousEnPassantSquare: this.enPassantSquare,
			previousHalfMoveClock: this.halfMoveClock,
			previousFullMoveNumber: this.fullMoveNumber,
			previousWhiteKingSquare: this.whiteKingSquare,
			previousBlackKingSquare: this.blackKingSquare
		});

		this.board[from] = EMPTY;
		this.squareToPiece[from] = 0;

		if (capturedPiece !== EMPTY) {
			this.board[capturedSquare] = EMPTY;
			this.squareToPiece[capturedSquare] = 0;
			this.pieceSquares[capturedPieceIndex] = NO_SQUARE;
		}

		const placedPiece = promotion === EMPTY ? piece : movingColor * promotion;
		this.board[to] = placedPiece;
		this.squareToPiece[to] = movedPieceIndex + 1;
		this.pieceSquares[movedPieceIndex] = to;
		this.pieceCodes[movedPieceIndex] = placedPiece;

		if (Math.abs(piece) === KING) {
			if (movingColor === WHITE) {
				this.whiteKingSquare = to;
			} else {
				this.blackKingSquare = to;
			}
		}

		if (isCastling && rookPiece !== EMPTY) {
			this.board[rookFrom] = EMPTY;
			this.squareToPiece[rookFrom] = 0;
			this.board[rookTo] = rookPiece;
			this.squareToPiece[rookTo] = rookPieceIndex + 1;
			this.pieceSquares[rookPieceIndex] = rookTo;
		}

		this.updateCastlingRightsAfterMove(from, piece, capturedSquare, capturedPiece);
		this.enPassantSquare =
			Math.abs(piece) === PAWN && Math.abs(to - from) === 16 ? from + movingColor * 8 : -1;
		this.halfMoveClock =
			Math.abs(piece) === PAWN || capturedPiece !== EMPTY ? 0 : this.halfMoveClock + 1;
		if (movingColor === BLACK) {
			this.fullMoveNumber += 1;
		}
		this.turn = -this.turn;
	}

	unmakeMove(move: CustomMove): void {
		const undo = this.history[this.history.length - 1];
		if (!undo) {
			throw new Error('Cannot unmake move without history');
		}
		if (undo.move !== move) {
			throw new Error(`Cannot unmake non-LIFO move: ${moveToUci(move)}`);
		}
		this.history.pop();

		const from = moveFrom(move);
		const to = moveTo(move);

		if (undo.rookPiece !== EMPTY) {
			this.board[undo.rookTo] = EMPTY;
			this.squareToPiece[undo.rookTo] = 0;
			this.board[undo.rookFrom] = undo.rookPiece;
			this.squareToPiece[undo.rookFrom] = undo.rookPieceIndex + 1;
			this.pieceSquares[undo.rookPieceIndex] = undo.rookFrom;
			this.pieceCodes[undo.rookPieceIndex] = undo.rookPiece;
		}

		this.board[to] = EMPTY;
		this.squareToPiece[to] = 0;
		this.board[from] = undo.piece;
		this.squareToPiece[from] = undo.movedPieceIndex + 1;
		this.pieceSquares[undo.movedPieceIndex] = from;
		this.pieceCodes[undo.movedPieceIndex] = undo.piece;

		if (undo.capturedPiece !== EMPTY) {
			this.board[undo.capturedSquare] = undo.capturedPiece;
			this.squareToPiece[undo.capturedSquare] = undo.capturedPieceIndex + 1;
			this.pieceSquares[undo.capturedPieceIndex] = undo.capturedSquare;
			this.pieceCodes[undo.capturedPieceIndex] = undo.capturedPiece;
		}

		this.turn = undo.previousTurn;
		this.castlingRights = undo.previousCastlingRights;
		this.enPassantSquare = undo.previousEnPassantSquare;
		this.halfMoveClock = undo.previousHalfMoveClock;
		this.fullMoveNumber = undo.previousFullMoveNumber;
		this.whiteKingSquare = undo.previousWhiteKingSquare;
		this.blackKingSquare = undo.previousBlackKingSquare;
	}

	evaluateMaterial(): number {
		let score = 0;
		for (const piece of this.board) {
			if (piece === EMPTY) continue;
			score += colorOf(piece) * MATERIAL_VALUES[Math.abs(piece)];
		}
		return score;
	}

	evaluatePST(): number {
		let score = 0;
		for (let boardSquare = 0; boardSquare < 64; boardSquare++) {
			const piece = this.board[boardSquare];
			if (piece === EMPTY) continue;
			const color = colorOf(piece);
			const rank = squareRank(boardSquare);
			const file = squareFile(boardSquare);
			const normalizedRank = color === WHITE ? rank : 7 - rank;
			const centerBonus = Math.round((7 - (Math.abs(file - 3.5) + Math.abs(rank - 3.5))) * 2);

			switch (Math.abs(piece)) {
				case PAWN:
					score += color * normalizedRank * 5;
					break;
				case KNIGHT:
				case BISHOP:
					score += color * centerBonus * 3;
					break;
				case ROOK:
					score += color * normalizedRank;
					break;
				case QUEEN:
					score += color * centerBonus;
					break;
				case KING:
					score -= color * centerBonus;
					break;
			}
		}
		return score;
	}

	evaluateMobility(): number {
		const previousTurn = this.turn;
		const buffer = this.allocateMoveBuffer();
		this.turn = WHITE;
		const whiteMoves = this.generateLegalMoves(buffer);
		this.turn = BLACK;
		const blackMoves = this.generateLegalMoves(buffer);
		this.turn = previousTurn;
		return (whiteMoves - blackMoves) * 5;
	}

	evaluate(): number {
		return this.evaluateMaterial() + this.evaluatePST() + this.evaluateMobility();
	}

	toFen(): string {
		const rows: string[] = [];
		for (let rank = 7; rank >= 0; rank--) {
			let row = '';
			let emptyCount = 0;

			for (let file = 0; file < 8; file++) {
				const piece = this.board[square(file, rank)];
				if (piece === EMPTY) {
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
		return `${rows.join('/')} ${this.turn === WHITE ? 'w' : 'b'} ${castling} ${enPassant} ${
			this.halfMoveClock
		} ${this.fullMoveNumber}`;
	}

	private clear(): void {
		this.board.fill(EMPTY);
		this.pieceSquares.fill(NO_SQUARE);
		this.pieceCodes.fill(EMPTY);
		this.squareToPiece.fill(0);
		this.pieceCount = 0;
		this.turn = WHITE;
		this.castlingRights = 0;
		this.enPassantSquare = -1;
		this.halfMoveClock = 0;
		this.fullMoveNumber = 1;
		this.whiteKingSquare = -1;
		this.blackKingSquare = -1;
	}

	private loadPiecePlacement(piecePlacement: string): void {
		let rank = 7;
		let file = 0;

		for (const char of piecePlacement) {
			if (char === '/') {
				if (file !== 8) {
					throw new Error(`Invalid FEN row width in piece placement: ${piecePlacement}`);
				}
				rank--;
				file = 0;
				continue;
			}

			if (/^[1-8]$/.test(char)) {
				file += Number(char);
				if (file > 8) {
					throw new Error(`Invalid FEN row width in piece placement: ${piecePlacement}`);
				}
				continue;
			}

			const piece = pieceFromFen(char);
			if (piece === null) {
				throw new Error(`Invalid FEN piece: ${char}`);
			}
			if (!isInside(file, rank)) {
				throw new Error(`Invalid FEN square for piece: ${char}`);
			}

			this.addPiece(square(file, rank), piece);
			file++;
		}

		if (rank !== 0 || file !== 8) {
			throw new Error(`Invalid FEN piece placement: ${piecePlacement}`);
		}
	}

	private validateKings(): void {
		let whiteKings = 0;
		let blackKings = 0;

		for (let pieceIndex = 0; pieceIndex < this.pieceCount; pieceIndex++) {
			if (this.pieceCodes[pieceIndex] === WHITE_KING) {
				whiteKings++;
			} else if (this.pieceCodes[pieceIndex] === BLACK_KING) {
				blackKings++;
			}
		}

		if (whiteKings !== 1 || blackKings !== 1) {
			throw new Error('Invalid FEN string: expected exactly one king for each side');
		}
	}

	private addPiece(boardSquare: number, piece: number): void {
		if (this.pieceCount >= 32) {
			throw new Error('Invalid FEN string: more than 32 pieces');
		}

		const pieceIndex = this.pieceCount++;
		this.board[boardSquare] = piece;
		this.pieceSquares[pieceIndex] = boardSquare;
		this.pieceCodes[pieceIndex] = piece;
		this.squareToPiece[boardSquare] = pieceIndex + 1;

		if (piece === WHITE_KING) {
			this.whiteKingSquare = boardSquare;
		} else if (piece === BLACK_KING) {
			this.blackKingSquare = boardSquare;
		}
	}

	private generatePawnMoves(
		out: CustomMoveBuffer,
		count: number,
		from: number,
		piece: number
	): number {
		const color = colorOf(piece);
		const file = squareFile(from);
		const rank = squareRank(from);
		const direction = color === WHITE ? 1 : -1;
		const nextRank = rank + direction;
		const startRank = color === WHITE ? 1 : 6;

		if (isInside(file, nextRank)) {
			const oneForward = square(file, nextRank);
			if (this.board[oneForward] === EMPTY) {
				count = this.addPawnMove(out, count, from, oneForward, color);

				const doubleRank = rank + direction * 2;
				if (rank === startRank && isInside(file, doubleRank)) {
					const twoForward = square(file, doubleRank);
					if (this.board[twoForward] === EMPTY) {
						count = addMove(out, count, encodeMove(from, twoForward));
					}
				}
			}
		}

		for (const fileDelta of [-1, 1] as const) {
			const captureFile = file + fileDelta;
			if (!isInside(captureFile, nextRank)) continue;

			const to = square(captureFile, nextRank);
			const target = this.board[to];
			if (target !== EMPTY && colorOf(target) !== color) {
				count = this.addPawnMove(out, count, from, to, color);
				continue;
			}

			if (to === this.enPassantSquare && this.hasEnPassantVictim(to, color)) {
				count = addMove(out, count, encodeMove(from, to));
			}
		}

		return count;
	}

	private addPawnMove(
		out: CustomMoveBuffer,
		count: number,
		from: number,
		to: number,
		color: number
	): number {
		const promotionRank = color === WHITE ? 7 : 0;
		if (squareRank(to) !== promotionRank) {
			return addMove(out, count, encodeMove(from, to));
		}

		for (const promotionPiece of PROMOTION_PIECES) {
			count = addMove(out, count, encodeMove(from, to, promotionPiece));
		}
		return count;
	}

	private generateJumpMoves(
		out: CustomMoveBuffer,
		count: number,
		from: number,
		piece: number,
		deltas: readonly (readonly [number, number])[]
	): number {
		const color = colorOf(piece);
		const fromFile = squareFile(from);
		const fromRank = squareRank(from);

		for (const [fileDelta, rankDelta] of deltas) {
			const toFile = fromFile + fileDelta;
			const toRank = fromRank + rankDelta;
			if (!isInside(toFile, toRank)) continue;

			const to = square(toFile, toRank);
			const target = this.board[to];
			if (target === EMPTY || colorOf(target) !== color) {
				count = addMove(out, count, encodeMove(from, to));
			}
		}

		return count;
	}

	private generateSlidingMoves(
		out: CustomMoveBuffer,
		count: number,
		from: number,
		piece: number,
		deltas: readonly (readonly [number, number])[]
	): number {
		const color = colorOf(piece);
		const fromFile = squareFile(from);
		const fromRank = squareRank(from);

		for (const [fileDelta, rankDelta] of deltas) {
			let toFile = fromFile + fileDelta;
			let toRank = fromRank + rankDelta;

			while (isInside(toFile, toRank)) {
				const to = square(toFile, toRank);
				const target = this.board[to];
				if (target === EMPTY) {
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
		out: CustomMoveBuffer,
		count: number,
		from: number,
		piece: number
	): number {
		count = this.generateJumpMoves(out, count, from, piece, KING_DELTAS);
		const color = colorOf(piece);

		if (color === WHITE && from === squareFromAlgebraic('e1')) {
			if (
				(this.castlingRights & CASTLE_WHITE_KING) !== 0 &&
				this.board[squareFromAlgebraic('h1')] === WHITE_ROOK &&
				this.board[squareFromAlgebraic('f1')] === EMPTY &&
				this.board[squareFromAlgebraic('g1')] === EMPTY
			) {
				count = addMove(out, count, encodeMove(from, squareFromAlgebraic('g1')));
			}
			if (
				(this.castlingRights & CASTLE_WHITE_QUEEN) !== 0 &&
				this.board[squareFromAlgebraic('a1')] === WHITE_ROOK &&
				this.board[squareFromAlgebraic('d1')] === EMPTY &&
				this.board[squareFromAlgebraic('c1')] === EMPTY &&
				this.board[squareFromAlgebraic('b1')] === EMPTY
			) {
				count = addMove(out, count, encodeMove(from, squareFromAlgebraic('c1')));
			}
		}

		if (color === BLACK && from === squareFromAlgebraic('e8')) {
			if (
				(this.castlingRights & CASTLE_BLACK_KING) !== 0 &&
				this.board[squareFromAlgebraic('h8')] === BLACK_ROOK &&
				this.board[squareFromAlgebraic('f8')] === EMPTY &&
				this.board[squareFromAlgebraic('g8')] === EMPTY
			) {
				count = addMove(out, count, encodeMove(from, squareFromAlgebraic('g8')));
			}
			if (
				(this.castlingRights & CASTLE_BLACK_QUEEN) !== 0 &&
				this.board[squareFromAlgebraic('a8')] === BLACK_ROOK &&
				this.board[squareFromAlgebraic('d8')] === EMPTY &&
				this.board[squareFromAlgebraic('c8')] === EMPTY &&
				this.board[squareFromAlgebraic('b8')] === EMPTY
			) {
				count = addMove(out, count, encodeMove(from, squareFromAlgebraic('c8')));
			}
		}

		return count;
	}

	private isJumpAttacked(
		targetSquare: number,
		attackerPiece: number,
		deltas: readonly (readonly [number, number])[]
	): boolean {
		const targetFile = squareFile(targetSquare);
		const targetRank = squareRank(targetSquare);

		for (const [fileDelta, rankDelta] of deltas) {
			const fromFile = targetFile + fileDelta;
			const fromRank = targetRank + rankDelta;
			if (
				isInside(fromFile, fromRank) &&
				this.board[square(fromFile, fromRank)] === attackerPiece
			) {
				return true;
			}
		}

		return false;
	}

	private isRayAttacked(
		targetSquare: number,
		attackingColor: number,
		deltas: readonly (readonly [number, number])[],
		firstAttackerType: number,
		secondAttackerType: number
	): boolean {
		const targetFile = squareFile(targetSquare);
		const targetRank = squareRank(targetSquare);

		for (const [fileDelta, rankDelta] of deltas) {
			let fromFile = targetFile + fileDelta;
			let fromRank = targetRank + rankDelta;

			while (isInside(fromFile, fromRank)) {
				const piece = this.board[square(fromFile, fromRank)];
				if (piece !== EMPTY) {
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

	private isCastlingMove(move: CustomMove): boolean {
		const from = moveFrom(move);
		const to = moveTo(move);
		return Math.abs(this.board[from]) === KING && Math.abs(to - from) === 2;
	}

	private canCastleThroughCheck(move: CustomMove, movingColor: number): boolean {
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
			Math.abs(piece) === PAWN &&
			to === this.enPassantSquare &&
			this.board[to] === EMPTY &&
			squareFile(from) !== squareFile(to)
		);
	}

	private hasEnPassantVictim(to: number, movingColor: number): boolean {
		const capturedSquare = to - movingColor * 8;
		return isValidSquare(capturedSquare) && this.board[capturedSquare] === -movingColor * PAWN;
	}

	private updateCastlingRightsAfterMove(
		from: number,
		piece: number,
		capturedSquare: number,
		capturedPiece: number
	): void {
		if (piece === WHITE_KING) {
			this.castlingRights &= ~(CASTLE_WHITE_KING | CASTLE_WHITE_QUEEN);
		} else if (piece === BLACK_KING) {
			this.castlingRights &= ~(CASTLE_BLACK_KING | CASTLE_BLACK_QUEEN);
		} else if (piece === WHITE_ROOK) {
			this.clearCastlingRightForRookSquare(from, WHITE);
		} else if (piece === BLACK_ROOK) {
			this.clearCastlingRightForRookSquare(from, BLACK);
		}

		if (capturedPiece === WHITE_ROOK) {
			this.clearCastlingRightForRookSquare(capturedSquare, WHITE);
		} else if (capturedPiece === BLACK_ROOK) {
			this.clearCastlingRightForRookSquare(capturedSquare, BLACK);
		}
	}

	private clearCastlingRightForRookSquare(rookSquare: number, color: number): void {
		if (color === WHITE) {
			if (rookSquare === squareFromAlgebraic('h1')) this.castlingRights &= ~CASTLE_WHITE_KING;
			if (rookSquare === squareFromAlgebraic('a1')) this.castlingRights &= ~CASTLE_WHITE_QUEEN;
		} else {
			if (rookSquare === squareFromAlgebraic('h8')) this.castlingRights &= ~CASTLE_BLACK_KING;
			if (rookSquare === squareFromAlgebraic('a8')) this.castlingRights &= ~CASTLE_BLACK_QUEEN;
		}
	}

	private validatePromotionMove(from: number, to: number, piece: number, promotion: number): void {
		if (
			promotion !== EMPTY &&
			!PROMOTION_PIECES.includes(promotion as (typeof PROMOTION_PIECES)[number])
		) {
			throw new Error(`Invalid promotion piece: ${promotion}`);
		}

		if (Math.abs(piece) !== PAWN) {
			if (promotion !== EMPTY) {
				throw new Error('Cannot promote a non-pawn move');
			}
			return;
		}

		const promotionRank = colorOf(piece) === WHITE ? 7 : 0;
		const reachesPromotionRank = squareRank(to) === promotionRank;
		if (reachesPromotionRank && promotion === EMPTY) {
			throw new Error(`Pawn move to ${squareToAlgebraic(to)} requires promotion`);
		}
		if (!reachesPromotionRank && promotion !== EMPTY) {
			throw new Error(`Pawn move to ${squareToAlgebraic(to)} cannot promote`);
		}
		if (Math.abs(to - from) === 16 && promotion !== EMPTY) {
			throw new Error('Double pawn pushes cannot promote');
		}
	}
}

function addMove(out: CustomMoveBuffer, count: number, move: CustomMove): number {
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
	return Number.isInteger(square) && square >= 0 && square < 64;
}

function isInside(file: number, rank: number): boolean {
	return file >= 0 && file < 8 && rank >= 0 && rank < 8;
}

function colorOf(piece: number): number {
	return piece > 0 ? WHITE : BLACK;
}

function normalizeColor(color: number): number {
	if (color > 0) return WHITE;
	if (color < 0) return BLACK;
	throw new Error(`Invalid color: ${color}`);
}

function parseTurn(turn: string): number {
	if (turn === 'w') return WHITE;
	if (turn === 'b') return BLACK;
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
	const expectedRank = turn === WHITE ? 5 : 2;
	if (squareRank(target) !== expectedRank) {
		throw new Error(`Invalid FEN en passant target for side to move: ${enPassant}`);
	}
	if (board[target] !== EMPTY) {
		throw new Error(`Invalid FEN en passant target is occupied: ${enPassant}`);
	}

	const victimSquare = target - turn * 8;
	if (!isValidSquare(victimSquare) || board[victimSquare] !== -turn * PAWN) {
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
			return WHITE_PAWN;
		case 'N':
			return WHITE_KNIGHT;
		case 'B':
			return WHITE_BISHOP;
		case 'R':
			return WHITE_ROOK;
		case 'Q':
			return WHITE_QUEEN;
		case 'K':
			return WHITE_KING;
		case 'p':
			return BLACK_PAWN;
		case 'n':
			return BLACK_KNIGHT;
		case 'b':
			return BLACK_BISHOP;
		case 'r':
			return BLACK_ROOK;
		case 'q':
			return BLACK_QUEEN;
		case 'k':
			return BLACK_KING;
		default:
			return null;
	}
}

function pieceToFen(piece: number): string {
	switch (piece) {
		case WHITE_PAWN:
			return 'P';
		case WHITE_KNIGHT:
			return 'N';
		case WHITE_BISHOP:
			return 'B';
		case WHITE_ROOK:
			return 'R';
		case WHITE_QUEEN:
			return 'Q';
		case WHITE_KING:
			return 'K';
		case BLACK_PAWN:
			return 'p';
		case BLACK_KNIGHT:
			return 'n';
		case BLACK_BISHOP:
			return 'b';
		case BLACK_ROOK:
			return 'r';
		case BLACK_QUEEN:
			return 'q';
		case BLACK_KING:
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
		case KNIGHT:
			return 'n';
		case BISHOP:
			return 'b';
		case ROOK:
			return 'r';
		case QUEEN:
			return 'q';
		default:
			throw new Error(`Invalid promotion piece: ${promotion}`);
	}
}
