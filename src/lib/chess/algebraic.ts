import {
	BOARD_FILES,
	BOARD_RANKS,
	isBoardFile,
	isBoardRank,
	nextBoardRank,
	PlayerColor,
	Position,
	prevBoardRank,
	type BoardFile,
	type BoardInfo,
	type BoardRank
} from '$lib/chess/board';
import { calculateMove, type Move, type MoveError } from '$lib/chess/moves';
import { PieceId, type PromotionPieceId } from '$lib/chess/piece';

export const KING_SIDE_CASTLING_STR = 'O-O';
export const QUEEN_SIDE_CASTLING_STR = 'O-O-O';

export type AlgebraicMoveError =
	| MoveError
	| { type: 'invalidAlgebraicNotation'; algebraic: string }
	| { type: 'ambiguousAlgebraicNotation'; algebraic: string; piece: PieceId };

export function calculateMoveFromAlgebraic(
	board: BoardInfo,
	algebraic: string
): Either<Move, AlgebraicMoveError> {
	if (algebraic.length < 2) {
		return [, { type: 'invalidAlgebraicNotation', algebraic }];
	}
	const [move, moveError] = tryParseAlgebraicCastlingMove(algebraic, board) ??
		tryParseAlgebraicMoveByChar(algebraic, board, AlgebraicPieceChar.KNIGHT) ??
		tryParseAlgebraicMoveByChar(algebraic, board, AlgebraicPieceChar.BISHOP) ??
		tryParseAlgebraicMoveByChar(algebraic, board, AlgebraicPieceChar.ROOK) ??
		tryParseAlgebraicMoveByChar(algebraic, board, AlgebraicPieceChar.QUEEN) ??
		tryParseAlgebraicMoveByChar(algebraic, board, AlgebraicPieceChar.KING) ??
		tryParseAlgebraicPawnMove(algebraic, board) ?? [null];
	if (moveError) return [, moveError];
	if (move) return [move];
	return [, { type: 'invalidAlgebraicNotation', algebraic }];
	// NOTE: At this point we tried to parse all pieces move.
	// + castling
	// - castling with check/mate
	// + pawn move (no piece info)
	// - non-pawn pawn move (with piece info)
	// - capture (with 'x')
	// - promotion (with '=Q')
}

const ALGEBRAIC_CHECK_CHAR = '+';
const ALGEBRAIC_CHECKMATE_CHAR = '#';
const ALGEBRAIC_PROMOTION_CHAR = '=';
const ALGEBRAIC_CAPTURE_CHAR = 'x';

const AlgebraicPieceChar = {
	KNIGHT: 'N',
	BISHOP: 'B',
	ROOK: 'R',
	QUEEN: 'Q',
	KING: 'K'
} as const;
type AlgebraicPieceChar = (typeof AlgebraicPieceChar)[keyof typeof AlgebraicPieceChar];

function tryParseAlgebraicMoveByChar(
	algebraic: string,
	board: BoardInfo,
	pieceChar: AlgebraicPieceChar
): Either<Move, AlgebraicMoveError> | null {
	if (algebraic[0] !== pieceChar) {
		return null;
	}
	let offset = 1;
	let fromFile: BoardFile | null = null;
	let fromRank: BoardRank | null = null;
	if (
		isBoardFile(algebraic[offset]) &&
		(isBoardFile(algebraic[offset + 1]) || isBoardFile(algebraic[offset + 2]))
	) {
		fromFile = algebraic[offset] as BoardFile;
		offset += 1;
	}
	if (
		isBoardRank(algebraic[offset]) &&
		(isBoardFile(algebraic[offset + 1]) || isBoardFile(algebraic[offset + 2]))
	) {
		fromRank = algebraic[offset] as BoardRank;
		offset += 1;
	}
	// NOTE: Kings cannot have fromFile/fromRank disambiguation
	if (pieceChar === AlgebraicPieceChar.KING && fromFile !== null && fromRank !== null) {
		return [, { type: 'invalidAlgebraicNotation', algebraic }];
	}
	let isCapture = false;
	if (algebraic[offset] === ALGEBRAIC_CAPTURE_CHAR) {
		isCapture = true;
		offset += 1;
	}
	const toFile = algebraic[offset++];
	const toRank = algebraic[offset++];
	if (!isBoardFile(toFile) || !isBoardRank(toRank)) {
		return [, { type: 'invalidAlgebraicNotation', algebraic }];
	}
	const hasCheckOrMate =
		algebraic[offset] === ALGEBRAIC_CHECK_CHAR || algebraic[offset] === ALGEBRAIC_CHECKMATE_CHAR;
	if (hasCheckOrMate) offset += 1;

	const expectedLength = offset;
	if (algebraic.length !== expectedLength) {
		return [, { type: 'invalidAlgebraicNotation', algebraic }];
	}
	const to = Position.make(toFile, toRank);
	const fromPositions = getPossibleMovePositionsByAlgebraic(
		to,
		board,
		pieceChar,
		fromFile ?? undefined,
		fromRank ?? undefined
	);
	const isWhite = board.turnColor === PlayerColor.WHITE;
	const piece = algebraicPieceCharToPieceId(pieceChar, isWhite);
	if (fromPositions.length > 1) {
		return [, { type: 'ambiguousAlgebraicNotation', algebraic, piece }];
	}
	const [from] = fromPositions;
	if (!from) {
		return [, { type: 'invalidPieceMove', piece }];
	}
	const [move, err] = calculateMove(board, from, to);
	if (err) return [, err];
	if (isCapture && !move.isCapture) {
		return [, { type: 'invalidAlgebraicNotation', algebraic }];
	}
	if (move.piece !== piece) {
		return [, { type: 'invalidPieceMove', piece }];
	}
	return [move];
}

function getPossibleMovePositionsByAlgebraic(
	origin: Position,
	board: BoardInfo,
	pieceChar: AlgebraicPieceChar,
	desiredFile?: BoardFile,
	desiredRank?: BoardRank
): Position[] {
	switch (pieceChar) {
		case AlgebraicPieceChar.KNIGHT:
			return getPossibleKnightFromPositions(origin, board, desiredFile, desiredRank);
		case AlgebraicPieceChar.BISHOP:
			return getPossibleBishopFromPositions(origin, board, desiredFile, desiredRank);
		case AlgebraicPieceChar.ROOK:
			return getPossibleRookFromPositions(origin, board, desiredFile, desiredRank);
		case AlgebraicPieceChar.QUEEN:
			return getPossibleQueenFromPositions(origin, board, desiredFile, desiredRank);
		case AlgebraicPieceChar.KING:
			return getPossibleKingFromPositions(origin, board, desiredFile, desiredRank);
	}
}

function getPossibleKnightFromPositions(
	origin: Position,
	board: BoardInfo,
	desiredFile?: BoardFile,
	desiredRank?: BoardRank
): Position[] {
	const knightOffsets = [
		[2, 1],
		[1, 2],
		[-1, 2],
		[-2, 1],
		[-2, -1],
		[-1, -2],
		[1, -2],
		[2, -1]
	];
	const positions: Position[] = [];
	const isWhiteTurn = board.turnColor === PlayerColor.WHITE;
	const knightPiece = isWhiteTurn ? PieceId.WHITE_KNIGHT : PieceId.BLACK_KNIGHT;

	for (const [df, dr] of knightOffsets) {
		const fileIdx = origin.fileIndex() + df;
		const rankIdx = origin.rankIndex() + dr;
		if (fileIdx < 0 || fileIdx >= BOARD_FILES.length) continue;
		if (rankIdx < 0 || rankIdx >= BOARD_RANKS.length) continue;
		const file = BOARD_FILES[fileIdx];
		const rank = BOARD_RANKS[rankIdx];
		if (!isBoardFile(file) || !isBoardRank(rank)) continue;
		if (desiredFile && file !== desiredFile) continue;
		if (desiredRank && rank !== desiredRank) continue;
		const pos = Position.make(file, rank);
		if (board.pieces.get(pos) === knightPiece) {
			positions.push(pos);
		}
	}
	return positions;
}

function getPossibleBishopFromPositions(
	origin: Position,
	board: BoardInfo,
	desiredFile?: BoardFile,
	desiredRank?: BoardRank,
	lookupPieceId?: PieceId
): Position[] {
	const positions: Position[] = [];
	const isWhiteTurn = board.turnColor === PlayerColor.WHITE;
	const bishop = lookupPieceId ?? (isWhiteTurn ? PieceId.WHITE_BISHOP : PieceId.BLACK_BISHOP);
	const directions = [
		[1, 1],
		[1, -1],
		[-1, 1],
		[-1, -1]
	];

	for (const [df, dr] of directions) {
		let fileIndex = origin.fileIndex() + df;
		let rankIndex = origin.rankIndex() + dr;
		while (
			fileIndex >= 0 &&
			fileIndex < BOARD_FILES.length &&
			rankIndex >= 0 &&
			rankIndex < BOARD_RANKS.length
		) {
			const file = BOARD_FILES[fileIndex];
			const rank = BOARD_RANKS[rankIndex];
			if (!isBoardFile(file) || !isBoardRank(rank)) break;
			if (desiredFile && file !== desiredFile) {
				fileIndex += df;
				rankIndex += dr;
				continue;
			}
			if (desiredRank && rank !== desiredRank) {
				fileIndex += df;
				rankIndex += dr;
				continue;
			}
			const pos = Position.make(file, rank);
			const pieceAtPos = board.pieces.get(pos);
			if (pieceAtPos === bishop) {
				positions.push(pos);
			}
			// Stop searching in this direction if any piece is encountered
			if (pieceAtPos) break;
			fileIndex += df;
			rankIndex += dr;
		}
	}
	return positions;
}

function getPossibleRookFromPositions(
	origin: Position,
	board: BoardInfo,
	desiredFile?: BoardFile,
	desiredRank?: BoardRank,
	lookupPieceId?: PieceId
): Position[] {
	const positions: Position[] = [];
	const isWhiteTurn = board.turnColor === PlayerColor.WHITE;
	const rook = lookupPieceId ?? (isWhiteTurn ? PieceId.WHITE_ROOK : PieceId.BLACK_ROOK);
	const directions = [
		[1, 0],
		[-1, 0],
		[0, 1],
		[0, -1]
	];

	for (const [dFile, dRank] of directions) {
		let fileIndex = origin.fileIndex() + dFile;
		let rankIndex = origin.rankIndex() + dRank;
		while (
			fileIndex >= 0 &&
			fileIndex < BOARD_FILES.length &&
			rankIndex >= 0 &&
			rankIndex < BOARD_RANKS.length
		) {
			const file = BOARD_FILES[fileIndex];
			const rank = BOARD_RANKS[rankIndex];
			if (!isBoardFile(file) || !isBoardRank(rank)) break;
			if (desiredFile && file !== desiredFile) {
				fileIndex += dFile;
				rankIndex += dRank;
				continue;
			}
			if (desiredRank && rank !== desiredRank) {
				fileIndex += dFile;
				rankIndex += dRank;
				continue;
			}
			const pos = Position.make(file, rank);
			const pieceAtPos = board.pieces.get(pos);
			if (pieceAtPos === rook) {
				positions.push(pos);
			}
			// NOTE: Stop searching in this direction if any piece is encountered.
			if (pieceAtPos) break;
			fileIndex += dFile;
			rankIndex += dRank;
		}
	}
	return positions;
}

function getPossibleQueenFromPositions(
	origin: Position,
	board: BoardInfo,
	desiredFile?: BoardFile,
	desiredRank?: BoardRank
): Position[] {
	const positions: Position[] = [];
	const isWhiteTurn = board.turnColor === PlayerColor.WHITE;
	const queen = isWhiteTurn ? PieceId.WHITE_QUEEN : PieceId.BLACK_QUEEN;
	// NOTE: Queen moves are a combination of rook and bishop moves.
	positions.push(
		...getPossibleRookFromPositions(origin, board, desiredFile, desiredRank, queen),
		...getPossibleBishopFromPositions(origin, board, desiredFile, desiredRank, queen)
	);
	return positions;
}

function getPossibleKingFromPositions(
	origin: Position,
	board: BoardInfo,
	desiredFile?: BoardFile,
	desiredRank?: BoardRank
): Position[] {
	const positions: Position[] = [];
	const isWhiteTurn = board.turnColor === PlayerColor.WHITE;
	const king = isWhiteTurn ? PieceId.WHITE_KING : PieceId.BLACK_KING;
	const kingOffsets = [
		[1, 0],
		[1, 1],
		[0, 1],
		[-1, 1],
		[-1, 0],
		[-1, -1],
		[0, -1],
		[1, -1]
	];

	for (const [df, dr] of kingOffsets) {
		const fileIdx = origin.fileIndex() + df;
		const rankIdx = origin.rankIndex() + dr;
		if (fileIdx < 0 || fileIdx >= BOARD_FILES.length) continue;
		if (rankIdx < 0 || rankIdx >= BOARD_RANKS.length) continue;
		const file = BOARD_FILES[fileIdx];
		const rank = BOARD_RANKS[rankIdx];
		if (!isBoardFile(file) || !isBoardRank(rank)) continue;
		if (desiredFile && file !== desiredFile) continue;
		if (desiredRank && rank !== desiredRank) continue;
		const pos = Position.make(file, rank);
		if (board.pieces.get(pos) === king) {
			positions.push(pos);
		}
	}
	return positions;
}

function tryParseAlgebraicPawnMove(
	algebraic: string,
	board: BoardInfo
): Either<Move, AlgebraicMoveError> | null {
	// e4, e5, e8=Q, e1=R, e5+, e4#, e8=Q+, e1=R#
	let fromCaptureFile: BoardFile | null = null;
	let offset = 0;
	if (algebraic[1] === ALGEBRAIC_CAPTURE_CHAR) {
		const file = algebraic[0];
		if (!isBoardFile(file)) {
			return null;
		}
		fromCaptureFile = file;
		offset += 2;
	}

	const toFile = algebraic[offset++];
	const toRank = algebraic[offset++];
	if (!isBoardFile(toFile) || !isBoardRank(toRank)) {
		return null;
	}

	const isWhite = board.turnColor === PlayerColor.WHITE;
	let promotionPiece: PromotionPieceId | undefined;
	if (algebraic[offset] === ALGEBRAIC_PROMOTION_CHAR) {
		const promotionChar = algebraic[offset + 1];
		if (!isAlgebraicPromotionPieceChar(promotionChar)) {
			return [, { type: 'invalidAlgebraicNotation', algebraic }];
		}
		promotionPiece = (isWhite ? promotionChar : promotionChar.toLowerCase()) as PromotionPieceId;
		offset += 2;
	}
	const hasCheckOrMate =
		algebraic[offset] === ALGEBRAIC_CHECK_CHAR || algebraic[offset] === ALGEBRAIC_CHECKMATE_CHAR;

	if (hasCheckOrMate) offset += 1;
	const expectedLength = offset;
	if (algebraic.length !== expectedLength) {
		return [, { type: 'invalidAlgebraicNotation', algebraic }];
	}

	const pawn = isWhite ? PieceId.WHITE_PAWN : PieceId.BLACK_PAWN;
	const prevRank = isWhite ? prevBoardRank(toRank) : nextBoardRank(toRank);
	if (!prevRank) {
		return [, { type: 'invalidPieceMove', piece: pawn }];
	}

	const to = Position.make(toFile, toRank);
	const fromFile = fromCaptureFile ? fromCaptureFile : toFile;
	let from = Position.make(fromFile, prevRank);
	const pawnTwoStepRank = isWhite ? '4' : '5';
	if (board.pieces.get(from) !== pawn) {
		if (to.rank === pawnTwoStepRank) {
			const pawnStartRank = isWhite ? '2' : '7';
			from = Position.make(fromFile, pawnStartRank);
		} else {
			return [, { type: 'invalidPieceMove', piece: pawn }];
		}
	}

	const [move, moveError] = calculateMove(board, from, to, undefined, /*ignoreAllowed*/ true);
	if (moveError) return [, moveError];
	if (move.piece !== pawn) {
		return [, { type: 'invalidPieceMove', piece: pawn }];
	}
	move.promotion = promotionPiece;
	return [move];
}

function isAlgebraicPromotionPieceChar(char: string): char is 'Q' | 'R' | 'B' | 'N' {
	switch (char) {
		case 'Q':
		case 'R':
		case 'B':
		case 'N':
			return true;
		default:
			return false;
	}
}

function tryParseAlgebraicCastlingMove(
	algebraic: string,
	board: BoardInfo
): Either<Move, AlgebraicMoveError> | null {
	const isWhite = board.turnColor === PlayerColor.WHITE;
	let from: Position | null = null;
	let to: Position | null = null;

	if (algebraic === KING_SIDE_CASTLING_STR) {
		from = Position.fromStr(isWhite ? 'e1' : 'e8');
		to = Position.fromStr(isWhite ? 'g1' : 'g8');
	} else if (
		algebraic.length === KING_SIDE_CASTLING_STR.length + 1 &&
		algebraic.slice(0, KING_SIDE_CASTLING_STR.length) === KING_SIDE_CASTLING_STR
	) {
		if (
			algebraic[KING_SIDE_CASTLING_STR.length] !== ALGEBRAIC_CHECK_CHAR &&
			algebraic[KING_SIDE_CASTLING_STR.length] !== ALGEBRAIC_CHECKMATE_CHAR
		) {
			return [, { type: 'invalidAlgebraicNotation', algebraic }];
		}
		from = Position.fromStr(isWhite ? 'e1' : 'e8');
		to = Position.fromStr(isWhite ? 'g1' : 'g8');
	} else if (algebraic === QUEEN_SIDE_CASTLING_STR) {
		from = Position.fromStr(isWhite ? 'e1' : 'e8');
		to = Position.fromStr(isWhite ? 'c1' : 'c8');
	} else if (
		algebraic.length === QUEEN_SIDE_CASTLING_STR.length + 1 &&
		algebraic.slice(0, QUEEN_SIDE_CASTLING_STR.length) === QUEEN_SIDE_CASTLING_STR
	) {
		if (
			algebraic[QUEEN_SIDE_CASTLING_STR.length] !== ALGEBRAIC_CHECK_CHAR &&
			algebraic[QUEEN_SIDE_CASTLING_STR.length] !== ALGEBRAIC_CHECKMATE_CHAR
		) {
			return [, { type: 'invalidAlgebraicNotation', algebraic }];
		}
		from = Position.fromStr(isWhite ? 'e1' : 'e8');
		to = Position.fromStr(isWhite ? 'c1' : 'c8');
	}
	if (from && to) return calculateMove(board, from, to, undefined, /*ignoreAllowed*/ true);
	return null;
}

export function moveToAlgebraic(move: Move): string {
	if (move.castling) {
		return move.castling === 'king-side' ? 'O-O' : 'O-O-O';
	}

	let notation = '';
	const isPawn = PieceId.isPawn(move.piece);
	if (!isPawn) notation += move.piece;
	if (move.isCapture && isPawn) notation += move.from.file;
	if (move.isCapture) notation += 'x';
	notation += move.to;
	if (move.promotion) notation += '=' + move.promotion.toUpperCase();

	return notation;
}

function algebraicPieceCharToPieceId(pieceChar: AlgebraicPieceChar, isWhite: boolean): PieceId {
	switch (pieceChar) {
		case AlgebraicPieceChar.KNIGHT:
			return isWhite ? PieceId.WHITE_KNIGHT : PieceId.BLACK_KNIGHT;
		case AlgebraicPieceChar.BISHOP:
			return isWhite ? PieceId.WHITE_BISHOP : PieceId.BLACK_BISHOP;
		case AlgebraicPieceChar.ROOK:
			return isWhite ? PieceId.WHITE_ROOK : PieceId.BLACK_ROOK;
		case AlgebraicPieceChar.QUEEN:
			return isWhite ? PieceId.WHITE_QUEEN : PieceId.BLACK_QUEEN;
		case AlgebraicPieceChar.KING:
			return isWhite ? PieceId.WHITE_KING : PieceId.BLACK_KING;
	}
}
