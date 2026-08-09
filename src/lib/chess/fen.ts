import { PieceColor } from '$lib/chess/basic';
import { FILE_CHARS, PositionStr, RANK_CHARS } from '$lib/chess/board';
import { CASTLING_RIGHTS, ChessSquare, Ox88, type ChessBoard } from '$lib/chess/engine';
import { PieceId } from '$lib/chess/piece';
import { isNumberChar } from '$lib/number';

export const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const FEN_PIECES = 'prnbqkPRNBQK';
// WARN: Order of this array must be the same
const PIECE_ID_TO_FEN: PieceId[] = [
	PieceId.BLACK_PAWN,
	PieceId.BLACK_ROOK,
	PieceId.BLACK_KNIGHT,
	PieceId.BLACK_BISHOP,
	PieceId.BLACK_QUEEN,
	PieceId.BLACK_KING,
	PieceId.WHITE_PAWN,
	PieceId.WHITE_ROOK,
	PieceId.WHITE_KNIGHT,
	PieceId.WHITE_BISHOP,
	PieceId.WHITE_QUEEN,
	PieceId.WHITE_KING
];

function fenPieceToPieceId(c: string): PieceId | null {
	if (c.length !== 1) return null;
	const index = FEN_PIECES.indexOf(c);
	return PIECE_ID_TO_FEN[index] ?? null;
}

export function pieceIdToFen(pieceId: PieceId): string {
	const index = PIECE_ID_TO_FEN.indexOf(pieceId);
	if (index === -1) {
		throw new Error(`Invalid piece ID: ${pieceId}`);
	}
	return FEN_PIECES[index] ?? null;
}

export function isValidFen(fen: string): boolean {
	if (!fen) return false;

	const fenParts = fen.split(' ');
	if (fenParts.length !== 6) return false;
	// TODO: @Incomplete: Validate turn, castling rights, en passant target, half move clock, and full move number
	const [piecePlacement] = fenParts;
	if (!piecePlacement) return false;

	const rows = piecePlacement.split('/');
	if (rows.length !== 8) return false;

	for (const row of rows) {
		let sum = 0;
		for (const char of row) {
			if (!isNaN(Number(char))) {
				sum += Number(char);
			} else {
				const pieceId = fenPieceToPieceId(char.toLowerCase());
				if (pieceId == null) {
					return false;
				}
				sum += 1;
			}
		}
		if (sum !== 8) return false;
	}

	return true;
}

export function boardToFen(board: ChessBoard): string {
	const ranks: string[] = [];
	for (let rankIndex = RANK_CHARS.length - 1; rankIndex >= 0; rankIndex--) {
		let rankStr = '';
		let emptyCount = 0;

		for (let fileIndex = 0; fileIndex < FILE_CHARS.length; fileIndex++) {
			const square = Ox88.square(fileIndex, rankIndex);
			const piece = board.getPiece(square);
			if (piece != null) {
				if (emptyCount > 0) {
					rankStr += emptyCount;
					emptyCount = 0;
				}
				rankStr += pieceIdToFen(piece);
			} else {
				emptyCount++;
			}
		}
		if (emptyCount > 0) {
			rankStr += emptyCount;
		}
		ranks.push(rankStr);
	}

	const placement = ranks.join('/');
	const turn = board.turnColor === PieceColor.WHITE ? 'w' : 'b';

	let castling = '';
	if (board.castlingRights & CASTLING_RIGHTS.WHITE_KINGSIDE) castling += 'K';
	if (board.castlingRights & CASTLING_RIGHTS.WHITE_QUEENSIDE) castling += 'Q';
	if (board.castlingRights & CASTLING_RIGHTS.BLACK_KINGSIDE) castling += 'k';
	if (board.castlingRights & CASTLING_RIGHTS.BLACK_QUEENSIDE) castling += 'q';
	if (!castling) castling = '-';

	let enPassant = '-';
	if (board.enPassantTarget != null) {
		enPassant = Ox88.squareToString(board.enPassantTarget);
	}
	const halfMove = board.halfMoveClock;
	const fullMove = board.fullMoveNumber;

	return `${placement} ${turn} ${castling} ${enPassant} ${halfMove} ${fullMove}`;
}

export function loadFen(board: ChessBoard, fen: string): Error | void {
	const fenParts = fen.split(' ');
	if (fenParts.length < 1) {
		return new Error('Invalid FEN string: must contain at least the piece placement');
	}

	const [
		piecePlacement,
		turnStr = 'w',
		castlingRightsStr = '-',
		enPassantTargetStr = '-',
		halfMoveClockStr = '0',
		fullMoveNumberStr = '1'
	] = fenParts;
	const fenRanks = piecePlacement.split('/');
	if (fenRanks.length !== 8) {
		return new Error('Invalid FEN string: must contain exactly 8 rows');
	}
	fenRanks.reverse(); // Reverse the rows to match the board's coordinate system, because FEN starts from rank 8 to rank 1
	board.clear();
	for (let rankIndex = fenRanks.length - 1; rankIndex >= 0; rankIndex--) {
		const rankStr = fenRanks[rankIndex];

		let fileIndex = 0;
		for (const char of rankStr) {
			if (isNumberChar(char)) {
				fileIndex += Number(char);
				continue;
			}
			const pieceId = fenPieceToPieceId(char);
			if (pieceId == null) return new Error(`Invalid piece ID in FEN string: "${char}"`);

			const square = Ox88.square(fileIndex, rankIndex);
			board.placePiece(square, pieceId);
			fileIndex += 1;
		}
	}

  let enPassantTarget: ChessSquare | null = null;
	if (enPassantTargetStr !== '-') {
		if (!PositionStr.is(enPassantTargetStr)) {
			return new Error(`Invalid en passant target position in FEN string: ${enPassantTarget}`);
		}
    enPassantTarget = Ox88.squareFromStr(enPassantTargetStr);
	}

	const halfMoveClock = parseInt(halfMoveClockStr, 10);
	if (isNaN(halfMoveClock) || halfMoveClock < 0) {
		return new Error(`Invalid half move clock in FEN string: ${halfMoveClock}`);
	}

	const fullMoveNumber = parseInt(fullMoveNumberStr, 10);
	if (isNaN(fullMoveNumber) || fullMoveNumber < 1) {
		return new Error(`Invalid full move number in FEN string: ${fullMoveNumber}`);
	}

	let castlingRights = 0;
	if (castlingRightsStr.includes('K')) castlingRights |= CASTLING_RIGHTS.WHITE_KINGSIDE;
	if (castlingRightsStr.includes('Q')) castlingRights |= CASTLING_RIGHTS.WHITE_QUEENSIDE;
	if (castlingRightsStr.includes('k')) castlingRights |= CASTLING_RIGHTS.BLACK_KINGSIDE;
	if (castlingRightsStr.includes('q')) castlingRights |= CASTLING_RIGHTS.BLACK_QUEENSIDE;
	board.castlingRights = castlingRights;
	board.turnColor = turnStr === 'w' ? PieceColor.WHITE : PieceColor.BLACK;
	board.enPassantTarget = enPassantTarget;
	board.halfMoveClock = halfMoveClock;
	board.fullMoveNumber = fullMoveNumber;
}
