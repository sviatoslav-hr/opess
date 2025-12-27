import {
	BOARD_FILES,
	BOARD_RANKS,
	BoardMap,
	PlayerColor,
	Position,
	isPositionStr,
	type BoardInfo
} from '$lib/chess/board';
import { fillAllowedMoves } from '$lib/chess/moves';
import { isNumberChar } from '$lib/number';
import { PieceId } from '$lib/chess/piece';

export const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export function validateFen(fen: string): boolean {
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
				if (!PieceId.isPiece(char.toLowerCase())) {
					return false;
				}
				sum += 1;
			}
		}
		if (sum !== 8) return false;
	}

	return true;
}

export function boardToFen(fen: BoardInfo): string {
	const rows: string[] = [];
	for (let i = BOARD_RANKS.length - 1; i >= 0; i--) {
		const row = BOARD_RANKS[i];
		let rowStr = '';
		let emptyCount = 0;

		for (const col of BOARD_FILES) {
			const piece = fen.pieces.get(`${col}${row}`);
			if (piece) {
				if (emptyCount > 0) {
					rowStr += emptyCount;
					emptyCount = 0;
				}
				rowStr += piece;
			} else {
				emptyCount++;
			}
		}
		if (emptyCount > 0) {
			rowStr += emptyCount;
		}
		rows.push(rowStr);
	}

	const placement = rows.join('/');
	const turn = fen.turnColor;

	let castling = '';
	if (fen.canCastle.whiteKingSide) castling += 'K';
	if (fen.canCastle.whiteQueenSide) castling += 'Q';
	if (fen.canCastle.blackKingSide) castling += 'k';
	if (fen.canCastle.blackQueenSide) castling += 'q';
	if (!castling) castling = '-';

	const enPassant = fen.enPassantTarget || '-';
	const halfMove = fen.halfMoveClock;
	const fullMove = fen.fullMoveNumber;

	return `${placement} ${turn} ${castling} ${enPassant} ${halfMove} ${fullMove}`;
}

export function parseFen(fen: string): BoardInfo {
	const fenParts = fen.split(' ');
	if (fenParts.length < 1) {
		throw new Error('Invalid FEN string: must contain at least the piece placement');
	}

	const [
		piecePlacement,
		turnStr = 'w',
		castlingRightsStr = '-',
		enPassantTargetStr = '-',
		halfMoveClockStr = '0',
		fullMoveNumberStr = '1'
	] = fenParts;
	const fenRows = piecePlacement.split('/');
	if (fenRows.length !== 8) {
		throw new Error('Invalid FEN string: must contain exactly 8 rows');
	}
	fenRows.reverse(); // Reverse the rows to match the board's coordinate system, because FEN starts from rank 8 to rank 1

	const pieces = new BoardMap<PieceId>();
	for (let rowIndex = fenRows.length - 1; rowIndex >= 0; rowIndex--) {
		const rowStr = fenRows[rowIndex];

		let colIndex = 0;
		for (const char of rowStr) {
			if (isNumberChar(char)) {
				colIndex += Number(char);
				continue;
			}
			if (!PieceId.isPiece(char)) throw new Error(`Invalid piece ID in FEN string: ${char}`);
			const col = BOARD_FILES[colIndex];
			if (!col) throw new Error(`Invalid column index in FEN string: ${colIndex}`);
			const row = BOARD_RANKS[rowIndex];
			if (!row) throw new Error(`Invalid row index in FEN string: ${rowIndex}`);

			pieces.set(`${col}${row}`, char);
			colIndex += 1;
		}
	}

	const turnColor = turnStr === 'w' ? PlayerColor.WHITE : PlayerColor.BLACK;
	const canCastle = {
		whiteKingSide: castlingRightsStr.includes('K'),
		whiteQueenSide: castlingRightsStr.includes('Q'),
		blackKingSide: castlingRightsStr.includes('k'),
		blackQueenSide: castlingRightsStr.includes('q')
	};

	let enPassantTarget: Position | null = null;
	if (enPassantTargetStr !== '-') {
		if (!isPositionStr(enPassantTargetStr)) {
			throw new Error(`Invalid en passant target position in FEN string: ${enPassantTarget}`);
		}
		enPassantTarget = Position.fromStr(enPassantTargetStr);
	}

	const halfMoveClock = parseInt(halfMoveClockStr, 10);
	if (isNaN(halfMoveClock) || halfMoveClock < 0) {
		throw new Error(`Invalid half move clock in FEN string: ${halfMoveClock}`);
	}

	const fullMoveNumber = parseInt(fullMoveNumberStr, 10);
	if (isNaN(fullMoveNumber) || fullMoveNumber < 1) {
		throw new Error(`Invalid full move number in FEN string: ${fullMoveNumber}`);
	}

	const board: BoardInfo = {
		pieces,
		turnColor,
		canCastle,
		enPassantTarget,
		halfMoveClock,
		fullMoveNumber,
		allowedMoves: new BoardMap(),
		moves: []
	};

	fillAllowedMoves(board);

	return board;
}
