import { FileChar, PieceColor, RankChar } from '$lib/chess/basic';
import {
	CASTLING,
	ChessError,
	ChessMovePacked,
	ChessSquare,
	isCastlingMove,
	Ox88,
	type ChessBoard,
	type ChessMove,
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
): Either<ChessMovePacked, AlgebraicMoveError> {
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
): Either<ChessMovePacked, AlgebraicMoveError> | null {
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
		return [
			,
			{
				type: 'invalidAlgebraicNotation',
				algebraic,
				context: 'king move should not have file/rank disambiguation',
			},
		];
	}
	let isCapture = false;
	if (algebraic[offset] === ALGEBRAIC_CAPTURE_CHAR) {
		isCapture = true;
		offset += 1;
	}
	const toFileChar = algebraic[offset++];
	const toRankChar = algebraic[offset++];
	if (!FileChar.is(toFileChar) || !RankChar.is(toRankChar)) {
		return [
			,
			{
				type: 'invalidAlgebraicNotation',
				algebraic,
				context: 'to square is not a valid file/rank',
			},
		];
	}
	const hasCheckOrMate =
		algebraic[offset] === ALGEBRAIC_CHECK_CHAR || algebraic[offset] === ALGEBRAIC_CHECKMATE_CHAR;
	if (hasCheckOrMate) offset += 1;

	const expectedLength = offset;
	if (algebraic.length !== expectedLength) {
		return [, { type: 'invalidAlgebraicNotation', algebraic, context: 'unexpected length' }];
	}
	const toSquare = Ox88.squareFromStr(toFileChar + toRankChar);
	if (toSquare == null) {
		return [
			,
			{
				type: 'invalidAlgebraicNotation',
				algebraic,
				context: 'to square is not a valid file/rank',
			},
		];
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
	const capturedPiece = ChessMovePacked.unpackCapturedPiece(move);
	if (isCapture !== (capturedPiece != null)) {
		const context = isCapture ? 'capture not allowed' : 'capture marker required';
		return [, { type: 'invalidAlgebraicNotation', algebraic, context }];
	}
	const movedPiece = ChessMovePacked.unpackMovedPiece(move);
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
): ChessMovePacked[] {
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
		const moveToSquare = ChessMovePacked.unpackToSquare(move);
		if (moveToSquare !== toSquare) return false;
		const moveFromSquare = ChessMovePacked.unpackFromSquare(move);
		if (desiredFile != null && Ox88.squareFile(moveFromSquare) !== desiredFile) return false;
		if (desiredRank != null && Ox88.squareRank(moveFromSquare) !== desiredRank) return false;
		return true;
	});
	return moves;
}

function tryParseAlgebraicPawnMove(
	algebraic: string,
	board: ChessBoard
): Either<ChessMovePacked, AlgebraicMoveError> | null {
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
	if (!Ox88.isValidFile(toFile) || !Ox88.isValidRank(toRank)) {
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
	const hasCheckOrMate =
		algebraic[offset] === ALGEBRAIC_CHECK_CHAR || algebraic[offset] === ALGEBRAIC_CHECKMATE_CHAR;

	if (hasCheckOrMate) offset += 1;
	const expectedLength = offset;
	if (algebraic.length !== expectedLength) {
		return [, { type: 'invalidAlgebraicNotation', algebraic }];
	}

	const pawn = board.isWhiteTurn ? PieceId.WHITE_PAWN : PieceId.BLACK_PAWN;
	const prevRank = board.isWhiteTurn ? toRank - 1 : toRank + 1;
	if (!Ox88.isValidRank(prevRank)) {
		return [, { type: 'invalidAlgebraicNotation', algebraic }];
	}

	const to = Ox88.square(toFile, toRank);
	const fromFile = fromCaptureFile != null ? fromCaptureFile : toFile;
	let from = Ox88.square(fromFile, prevRank);
	const pawnTwoStepRank = RankChar.indexOf(board.isWhiteTurn ? '4' : '5');
	if (board.get(from) !== pawn) {
		if (Ox88.squareRank(to) === pawnTwoStepRank) {
			const pawnStartRank = RankChar.indexOf(board.isWhiteTurn ? '2' : '7');
			from = Ox88.square(fromFile, pawnStartRank);
		} else {
			return [, { type: 'invalidAlgebraicNotation', algebraic }];
		}
	}

	const move = board.findMove(from, to, promotionPiece);
	if (move == null) {
		return [, ChessError.IllegalMove({ fromSquare: from, toSquare: to })];
	}
	const movedPiece = ChessMovePacked.unpackMovedPiece(move);
	if (movedPiece !== pawn) {
		return [, { type: 'invalidAlgebraicNotation', algebraic }];
	}
	const isCapture = fromCaptureFile != null;
	const capturedPiece = ChessMovePacked.unpackCapturedPiece(move);
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
): Either<ChessMovePacked, AlgebraicMoveError> | null {
	const isWhite = board.turnColor === PieceColor.WHITE;
	let from: ChessSquare | null = null;
	let to: ChessSquare | null = null;

	if (algebraic === KING_SIDE_CASTLING_STR) {
		from = ChessSquare.fromStr(isWhite ? 'e1' : 'e8');
		to = ChessSquare.fromStr(isWhite ? 'g1' : 'g8');
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
		from = Ox88.squareFromStr(isWhite ? 'e1' : 'e8');
		to = Ox88.squareFromStr(isWhite ? 'g1' : 'g8');
	} else if (algebraic === QUEEN_SIDE_CASTLING_STR) {
		from = Ox88.squareFromStr(isWhite ? 'e1' : 'e8');
		to = Ox88.squareFromStr(isWhite ? 'c1' : 'c8');
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
		from = Ox88.squareFromStr(isWhite ? 'e1' : 'e8');
		to = Ox88.squareFromStr(isWhite ? 'c1' : 'c8');
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

function ensureAlgebraicCheckMatchesMove(
	board: ChessBoard,
	move: ChessMovePacked,
	algebraic: string
): Either<ChessMovePacked, AlgebraicMoveError> {
	const checkSuffix = getAlgebraicCheckSuffix(algebraic.at(-1));
	if (checkSuffix == null) return [move];

	const resultingBoard = board.clone();
	resultingBoard.applyMove(move, /*skipValidation*/ true);
	resultingBoard.generateLegalMoves();

	const isCheck = resultingBoard.isKingInCheck();
	const isCheckmate = isCheck && resultingBoard.legalMovesThisTurn.length === 0;
	const suffixMatches =
		checkSuffix === ALGEBRAIC_CHECKMATE_CHAR ? isCheckmate : isCheck && !isCheckmate;
	if (!suffixMatches) {
		return [
			,
			{
				type: 'invalidAlgebraicNotation',
				algebraic,
				context: 'check suffix does not match resulting position',
			},
		];
	}

	return [move];
}

export function moveToAlgebraic(board: ChessBoard, move: ChessMove): string {
	if (isCastlingMove(null, move.movedPiece, move.fromSquare, move.toSquare)) {
		const isKingSide =
			CASTLING.KING_TO_KINGSIDE_SQUARE[PieceId.colorOf(move.movedPiece)] === move.toSquare;
		return isKingSide ? 'O-O' : 'O-O-O';
	}

	let notation = '';
	const isPawn = PieceId.isPawn(move.movedPiece);
	if (!isPawn) notation += pieceIdToAlgebraic(move.movedPiece)!;
	if (!isPawn) notation += getAlgebraicDisambiguation(board, move);
	if (move.capturedPiece && isPawn)
		notation += FileChar.fromIndexOrThrow(Ox88.squareFile(move.fromSquare));
	if (move.capturedPiece) notation += 'x';
	notation += Ox88.squareToString(move.toSquare);
	if (move.promotion) notation += '=' + pieceIdToAlgebraic(move.promotion);

	return notation;
}

// NOTE: This doesn't include disambiguation for moves that have multiple possible origins,
//       but doesn't depend on board state.
export function moveToLongAlgebraic(move: ChessMove): string {
	if (isCastlingMove(null, move.movedPiece, move.fromSquare, move.toSquare)) {
		const isKingSide =
			CASTLING.KING_TO_KINGSIDE_SQUARE[PieceId.colorOf(move.movedPiece)] === move.toSquare;
		return isKingSide ? 'O-O' : 'O-O-O';
	}

	let notation = '';
	const isPawn = PieceId.isPawn(move.movedPiece);
	if (!isPawn) notation += pieceIdToAlgebraic(move.movedPiece)!;
	if (!isPawn) notation += Ox88.squareToString(move.fromSquare);
	if (move.capturedPiece && isPawn)
		notation += FileChar.fromIndexOrThrow(Ox88.squareFile(move.fromSquare));
	if (move.capturedPiece) notation += 'x';
	notation += Ox88.squareToString(move.toSquare);
	if (move.promotion) notation += '=' + pieceIdToAlgebraic(move.promotion);

	return notation;
}

function getAlgebraicDisambiguation(board: ChessBoard, move: ChessMove): string {
	const competingMoves: ChessMovePacked[] = [];

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
		Ox88.sameFile(ChessMovePacked.unpackFromSquare(candidate), move.fromSquare)
	);
	const sameRankExists = competingMoves.some((candidate) =>
		Ox88.sameRank(ChessMovePacked.unpackFromSquare(candidate), move.fromSquare)
	);

	if (!sameFileExists) return FileChar.fromIndexOrThrow(Ox88.squareFile(move.fromSquare));
	if (!sameRankExists) return RankChar.fromIndexOrThrow(Ox88.squareRank(move.fromSquare));
	return Ox88.squareToString(move.fromSquare);
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
