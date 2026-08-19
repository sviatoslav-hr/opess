import {
	CastlingRights,
	CastlingType,
	ChessError,
	FileChar,
	PieceColor,
	RankChar,
} from '$lib/chess/basic';
import {
	ChessMove,
	ChessSquare,
	getMoveCastlingType,
	type ChessBoard,
	type ChessMoveInfo,
} from '$lib/chess/engine';
import { PieceId, PromotionPiece } from '$lib/chess/piece';

export const KING_SIDE_CASTLING_STR = 'O-O';
export const QUEEN_SIDE_CASTLING_STR = 'O-O-O';

export type AlgebraicMoveError =
	| ChessError
	| { type: 'invalidAlgebraicNotation'; algebraic: string; context?: string }
	| { type: 'ambiguousAlgebraicNotation'; algebraic: string; piece: PieceId };

export function calculateMoveFromAlgebraic(
	board: ChessBoard,
	algebraic: string
): Either<ChessMove, AlgebraicMoveError> {
	if (algebraic.length < 2) {
		return [, { type: 'invalidAlgebraicNotation', algebraic, context: 'too short' }];
	}
	if (!board.legalMovesGenerated) {
		board.generateLegalMoves();
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
	KING: 'K',
} as const;
type AlgebraicPiece = (typeof AlgebraicPieceChar)[keyof typeof AlgebraicPieceChar];

function algebraicToPromotionPiece(pieceChar: Exclude<AlgebraicPiece, 'K'>): PromotionPiece {
	switch (pieceChar) {
		case AlgebraicPieceChar.KNIGHT:
			return PromotionPiece.KNIGHT;
		case AlgebraicPieceChar.BISHOP:
			return PromotionPiece.BISHOP;
		case AlgebraicPieceChar.ROOK:
			return PromotionPiece.ROOK;
		case AlgebraicPieceChar.QUEEN:
			return PromotionPiece.QUEEN;
	}
}

function pieceIdToAlgebraic(pieceId: PieceId): AlgebraicPiece | null {
	switch (pieceId) {
		case PieceId.WHITE_KNIGHT:
		case PieceId.BLACK_KNIGHT:
			return AlgebraicPieceChar.KNIGHT;
		case PieceId.WHITE_BISHOP:
		case PieceId.BLACK_BISHOP:
			return AlgebraicPieceChar.BISHOP;
		case PieceId.WHITE_ROOK:
		case PieceId.BLACK_ROOK:
			return AlgebraicPieceChar.ROOK;
		case PieceId.WHITE_QUEEN:
		case PieceId.BLACK_QUEEN:
			return AlgebraicPieceChar.QUEEN;
		case PieceId.WHITE_KING:
		case PieceId.BLACK_KING:
			return AlgebraicPieceChar.KING;
		default:
			return null; // Pawns do not have a piece character in algebraic notation
	}
}

function tryParseAlgebraicMoveByChar(
	algebraic: string,
	board: ChessBoard,
	pieceChar: AlgebraicPiece
): Either<ChessMove, AlgebraicMoveError> | null {
	if (algebraic[0] !== pieceChar) {
		return null;
	}
	let offset = 1;
	let fromFile: number | null = null;
	let fromRank: number | null = null;
	if (
		FileChar.is(algebraic[offset]) &&
		(FileChar.is(algebraic[offset + 1]) || FileChar.is(algebraic[offset + 2]))
	) {
		fromFile = FileChar.indexOf(algebraic[offset] as FileChar);
		offset += 1;
	}
	if (
		RankChar.is(algebraic[offset]) &&
		(FileChar.is(algebraic[offset + 1]) || FileChar.is(algebraic[offset + 2]))
	) {
		fromRank = RankChar.indexOf(algebraic[offset] as RankChar);
		offset += 1;
	}
	// NOTE: Kings cannot have fromFile/fromRank disambiguation
	if (pieceChar === AlgebraicPieceChar.KING && fromFile !== null && fromRank !== null) {
		const context = 'king move should not have file/rank disambiguation';
		return [, { type: 'invalidAlgebraicNotation', algebraic, context }];
	}
	let isCapture = false;
	if (algebraic[offset] === ALGEBRAIC_CAPTURE_CHAR) {
		isCapture = true;
		offset += 1;
	}
	const toFileChar = algebraic[offset++];
	const toRankChar = algebraic[offset++];
	if (!FileChar.is(toFileChar) || !RankChar.is(toRankChar)) {
		const context = 'to square is not a valid file/rank';
		return [, { type: 'invalidAlgebraicNotation', algebraic, context }];
	}
	const checkSuffix = getAlgebraicCheckSuffix(algebraic[offset]);
	if (checkSuffix != null) offset += 1;

	const expectedLength = offset;
	if (algebraic.length !== expectedLength) {
		return [, { type: 'invalidAlgebraicNotation', algebraic, context: 'unexpected length' }];
	}
	const toSquare = ChessSquare.parse(toFileChar + toRankChar);
	if (toSquare == null) {
		const context = 'to square is not a valid file/rank';
		return [, { type: 'invalidAlgebraicNotation', algebraic, context }];
	}
	const legalMoves = getLegalMovesByAlgebraic(
		toSquare,
		board,
		pieceChar,
		fromFile ?? undefined,
		fromRank ?? undefined
	);
	const isWhite = board.turnColor === PieceColor.WHITE;
	const piece = algebraicPieceCharToPieceId(pieceChar, isWhite);
	if (legalMoves.length > 1) {
		return [, { type: 'ambiguousAlgebraicNotation', algebraic, piece }];
	}
	const [move] = legalMoves;
	if (move == null) {
		return [, { type: 'invalidAlgebraicNotation', algebraic, context: 'no legal move found' }];
	}
	const capturedPiece = ChessMove.capturedPieceOf(move);
	if (isCapture !== (capturedPiece != null)) {
		const context = isCapture ? 'capture not allowed' : 'capture marker required';
		return [, { type: 'invalidAlgebraicNotation', algebraic, context }];
	}
	const movedPiece = ChessMove.movedPieceOf(move);
	if (movedPiece !== piece) {
		return [, { type: 'invalidAlgebraicNotation', algebraic, context: 'piece mismatch' }];
	}
	return ensureAlgebraicCheckMatchesMove(board, move, algebraic);
}

function getLegalMovesByAlgebraic(
	toSquare: ChessSquare,
	board: ChessBoard,
	pieceChar: AlgebraicPiece,
	desiredFile?: number,
	desiredRank?: number
): ChessMove[] {
	let piece: PieceId;
	switch (pieceChar) {
		case AlgebraicPieceChar.KNIGHT: {
			piece = board.isWhiteTurn ? PieceId.WHITE_KNIGHT : PieceId.BLACK_KNIGHT;
			break;
		}
		case AlgebraicPieceChar.BISHOP: {
			piece = board.isWhiteTurn ? PieceId.WHITE_BISHOP : PieceId.BLACK_BISHOP;
			break;
		}
		case AlgebraicPieceChar.ROOK: {
			piece = board.isWhiteTurn ? PieceId.WHITE_ROOK : PieceId.BLACK_ROOK;
			break;
		}
		case AlgebraicPieceChar.QUEEN: {
			piece = board.isWhiteTurn ? PieceId.WHITE_QUEEN : PieceId.BLACK_QUEEN;
			break;
		}
		case AlgebraicPieceChar.KING: {
			piece = board.isWhiteTurn ? PieceId.WHITE_KING : PieceId.BLACK_KING;
			break;
		}
	}
	const moves = board.findMovesByPiece(piece).filter((move) => {
		const moveToSquare = ChessMove.toSquareOf(move);
		if (moveToSquare !== toSquare) return false;
		const moveFromSquare = ChessMove.fromSquareOf(move);
		if (desiredFile != null && ChessSquare.fileOf(moveFromSquare) !== desiredFile) return false;
		if (desiredRank != null && ChessSquare.rankOf(moveFromSquare) !== desiredRank) return false;
		return true;
	});
	return moves;
}

function tryParseAlgebraicPawnMove(
	algebraic: string,
	board: ChessBoard
): Either<ChessMove, AlgebraicMoveError> | null {
	// e4, e5, e8=Q, e1=R, e5+, e4#, e8=Q+, e1=R#
	let fromCaptureFile: number | null = null;
	let offset = 0;
	if (algebraic[1] === ALGEBRAIC_CAPTURE_CHAR) {
		const file = algebraic[0];
		if (!FileChar.is(file)) {
			return null;
		}
		fromCaptureFile = FileChar.indexOf(file);
		offset += 2;
	}

	const toFile = FileChar.indexOf(algebraic[offset++] as FileChar);
	const toRank = RankChar.indexOf(algebraic[offset++] as RankChar);
	if (!ChessSquare.isFile(toFile) || !ChessSquare.isRank(toRank)) {
		return null;
	}

	let promotionPiece: PromotionPiece | undefined;
	if (algebraic[offset] === ALGEBRAIC_PROMOTION_CHAR) {
		const promotionChar = algebraic[offset + 1];
		if (!isAlgebraicPromotionPieceChar(promotionChar)) {
			return [, { type: 'invalidAlgebraicNotation', algebraic }];
		}
		promotionPiece = algebraicToPromotionPiece(promotionChar);
		offset += 2;
	}
	const checkSuffix = getAlgebraicCheckSuffix(algebraic[offset]);
	if (checkSuffix != null) offset += 1;
	const expectedLength = offset;
	if (algebraic.length !== expectedLength) {
		return [, { type: 'invalidAlgebraicNotation', algebraic }];
	}

	const pawn = board.isWhiteTurn ? PieceId.WHITE_PAWN : PieceId.BLACK_PAWN;
	const prevRank = board.isWhiteTurn ? toRank - 1 : toRank + 1;
	if (!ChessSquare.isRank(prevRank)) {
		return [, { type: 'invalidAlgebraicNotation', algebraic }];
	}

	const to = ChessSquare.from(toFile, toRank);
	const fromFile = fromCaptureFile != null ? fromCaptureFile : toFile;
	let from = ChessSquare.from(fromFile, prevRank);
	const pawnTwoStepRank = RankChar.indexOf(board.isWhiteTurn ? '4' : '5');
	if (board.getPiece(from) !== pawn) {
		if (ChessSquare.rankOf(to) === pawnTwoStepRank) {
			const pawnStartRank = RankChar.indexOf(board.isWhiteTurn ? '2' : '7');
			from = ChessSquare.from(fromFile, pawnStartRank);
		} else {
			return [, { type: 'invalidAlgebraicNotation', algebraic }];
		}
	}

	const move = board.findMove(from, to, promotionPiece);
	if (move == null) {
		return [, ChessError.IllegalMove({ fromSquare: from, toSquare: to })];
	}
	const movedPiece = ChessMove.movedPieceOf(move);
	if (movedPiece !== pawn) {
		return [, { type: 'invalidAlgebraicNotation', algebraic }];
	}
	const isCapture = fromCaptureFile != null;
	const capturedPiece = ChessMove.capturedPieceOf(move);
	if (isCapture !== (capturedPiece != null)) {
		return [
			,
			{
				type: 'invalidAlgebraicNotation',
				algebraic,
				context: isCapture ? 'capture not allowed' : 'capture marker required',
			},
		];
	}
	return ensureAlgebraicCheckMatchesMove(board, move, algebraic);
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
	board: ChessBoard
): Either<ChessMove, AlgebraicMoveError> | null {
	const isWhite = board.turnColor === PieceColor.WHITE;
	let from: ChessSquare | null = null;
	let to: ChessSquare | null = null;

	if (algebraic === KING_SIDE_CASTLING_STR) {
		from = ChessSquare.parse(isWhite ? 'e1' : 'e8');
		to = ChessSquare.parse(isWhite ? 'g1' : 'g8');
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
		from = ChessSquare.from(isWhite ? 'e1' : 'e8');
		to = ChessSquare.from(isWhite ? 'g1' : 'g8');
	} else if (algebraic === QUEEN_SIDE_CASTLING_STR) {
		from = ChessSquare.from(isWhite ? 'e1' : 'e8');
		to = ChessSquare.from(isWhite ? 'c1' : 'c8');
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
		from = ChessSquare.from(isWhite ? 'e1' : 'e8');
		to = ChessSquare.from(isWhite ? 'c1' : 'c8');
	}
	if (from != null && to != null) {
		const move = board.findMove(from, to);
		if (move == null) return [, { type: 'invalidAlgebraicNotation', algebraic }];
		return ensureAlgebraicCheckMatchesMove(board, move, algebraic);
	}
	return null;
}

function getAlgebraicCheckSuffix(char: string | undefined): '+' | '#' | null {
	if (char === ALGEBRAIC_CHECK_CHAR || char === ALGEBRAIC_CHECKMATE_CHAR) return char;
	return null;
}

/**
 * Parsing can recognize a check or checkmate suffix, but cannot prove that its claim is true.
 * This semantic check rejects notation that falsely labels the resulting position as check or checkmate.
 */
function ensureAlgebraicCheckMatchesMove(
	board: ChessBoard,
	move: ChessMove,
	algebraic: string
): Either<ChessMove, AlgebraicMoveError> {
	const actualSuffix = getAlgebraicCheckSuffix(algebraic.at(-1));
	// TODO: Add a strict parsing mode that requires '+' or '#' when the move gives check or mate.
	// NOTE: Purposefully allow '+' or '#' to be omitted to not force users to always include them.
	if (actualSuffix == null) return [move];

	const expectedSuffix = getAlgebraicCheckSuffixForMove(board, move);
	if (actualSuffix !== expectedSuffix) {
		const context = `check suffix does not match resulting position (expected '${expectedSuffix ?? ''}')`;
		return [, { type: 'invalidAlgebraicNotation', algebraic, context }];
	}

	return [move];
}

function getAlgebraicCheckSuffixForMove(board: ChessBoard, move: ChessMove): '+' | '#' | null {
	board.applyMove(move, /*skipValidation*/ true);
	board.generateLegalMoves();
	const suffix = board.isCheckmate()
		? ALGEBRAIC_CHECKMATE_CHAR
		: board.isCheck()
			? ALGEBRAIC_CHECK_CHAR
			: null;
	board.undoMove();
	return suffix;
}

export function moveToAlgebraic(board: ChessBoard, move: ChessMove | ChessMoveInfo): string {
	if (ChessMove.isPacked(move)) move = ChessMove.unpack(move);

	const castlingType = getMoveCastlingType(move.movedPiece, move.fromSquare, move.toSquare);
	let notation = '';
	if (castlingType === CastlingType.QUEENSIDE) {
		notation = QUEEN_SIDE_CASTLING_STR;
	} else if (castlingType === CastlingType.KINGSIDE) {
		notation = KING_SIDE_CASTLING_STR;
	} else {
		const isPawn = PieceId.isPawn(move.movedPiece);
		if (!isPawn) notation += pieceIdToAlgebraic(move.movedPiece)!;
		if (!isPawn) notation += getAlgebraicDisambiguation(board, move);
		if (move.capturedPiece && isPawn)
			notation += FileChar.fromIndexOrThrow(ChessSquare.fileOf(move.fromSquare));
		if (move.capturedPiece) notation += 'x';
		notation += ChessSquare.toString(move.toSquare);
		if (move.promotion) notation += '=' + pieceIdToAlgebraic(move.promotion);
	}

	const checkSuffix = getAlgebraicCheckSuffixForMove(board, ChessMove.pack(move)) ?? '';
	return notation + checkSuffix;
}

// NOTE: This doesn't include disambiguation for moves that have multiple possible origins,
//       but doesn't depend on board state.
export function moveToLongAlgebraic(move: ChessMoveInfo): string {
	const castlingType = getMoveCastlingType(move.movedPiece, move.fromSquare, move.toSquare);
	if (castlingType === CastlingType.QUEENSIDE) return 'O-O-O';
	if (castlingType === CastlingType.KINGSIDE) return 'O-O';

	let notation = '';
	const isPawn = PieceId.isPawn(move.movedPiece);
	if (!isPawn) notation += pieceIdToAlgebraic(move.movedPiece)!;
	if (!isPawn) notation += ChessSquare.toString(move.fromSquare);
	if (move.capturedPiece && isPawn)
		notation += FileChar.fromIndexOrThrow(ChessSquare.fileOf(move.fromSquare));
	if (move.capturedPiece) notation += 'x';
	notation += ChessSquare.toString(move.toSquare);
	if (move.promotion) notation += '=' + pieceIdToAlgebraic(move.promotion);

	return notation;
}

function getAlgebraicDisambiguation(board: ChessBoard, move: ChessMoveInfo): string {
	const competingMoves: ChessMove[] = [];

	for (const [square, piece] of board.iteratePieces()) {
		if (piece !== move.movedPiece || square === move.fromSquare) continue;
		const competingMove = board.findMove(square, move.toSquare);
		if (competingMove != null) {
			competingMoves.push(competingMove);
		}
	}

	if (competingMoves.length === 0) {
		return '';
	}

	const sameFileExists = competingMoves.some((candidate) =>
		ChessSquare.sameFile(ChessMove.fromSquareOf(candidate), move.fromSquare)
	);
	const sameRankExists = competingMoves.some((candidate) =>
		ChessSquare.sameRank(ChessMove.fromSquareOf(candidate), move.fromSquare)
	);

	if (!sameFileExists) return FileChar.fromIndexOrThrow(ChessSquare.fileOf(move.fromSquare));
	if (!sameRankExists) return RankChar.fromIndexOrThrow(ChessSquare.rankOf(move.fromSquare));
	return ChessSquare.toString(move.fromSquare);
}

function algebraicPieceCharToPieceId(pieceChar: AlgebraicPiece, isWhite: boolean): PieceId {
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
