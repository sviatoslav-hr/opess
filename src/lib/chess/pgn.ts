import { calculateMoveFromAlgebraic, type AlgebraicMoveError } from '$lib/chess/algebraic';
import { INITIAL_FEN, loadFen } from '$lib/chess/fen';
import { ChessBoard, ChessMove, type ChessMoveInfo } from '$lib/chess/engine';

export interface PGNResult {
	moves: ChessMoveInfo[];
	tags: Record<string, string>;
}

export function parsePGNMoves(pgn: string): PGNResult {
	const parser = new PGNParser();
	const moves = parser.parse(pgn);
	const tags = parser.tags;
	return { moves, tags };
}

class PGNParser {
	pgn = '';
	offset = 0;
	line = 1;
	lineOffset = 0;
	tags: Record<string, string> = {};

	parse(pgn: string): ChessMoveInfo[] {
		this.pgn = pgn;
		this.offset = 0;
		this.line = 1;
		this.lineOffset = 0;
		this.parseMetadata();
		const fen = this.tags['FEN'] ?? INITIAL_FEN;
		const board = new ChessBoard();
		loadFen(board, fen);

		const moves: ChessMoveInfo[] = [];
		let comment: 'line' | 'multiline' | null = null;
		let variationLevel = 0;
		while (this.hasMoreChars()) {
			const char = pgn[this.offset];
			if (comment) {
				if (char === '\n' && comment === 'line') {
					comment = null;
				}
				if (char === '}' && comment === 'multiline') {
					comment = null;
				}
				this.consumeChar();
				continue;
			}

			if (char === '(') {
				variationLevel++;
				this.consumeChar();
				continue;
			} else if (variationLevel > 0) {
				if (char === ')') {
					variationLevel--;
					this.consumeChar();
					continue;
				}
			}

			switch (char) {
				case '{':
					comment = 'multiline';
					this.consumeChar();
					continue;
				case ';':
					comment = 'line';
					this.consumeChar();
					continue;
				case ')':
					throw new Error(`Unmatched closing parenthesis in PGN string at ${this.locationStr()}`);
				case '}':
					throw new Error(`Unmatched closing bracket in PGN string at ${this.locationStr()}`);
				case '.':
				case ' ':
				case '\n':
				case '\r':
					this.consumeChar();
					continue;
			}

			const number = this.parseMoveNumber();
			if (number === null) {
				// no more moves
				break;
			}
			let offsetBeforeMove = this.offset;
			let [move, moveError] = this.parsePieceMove(board);
			if (moveError) {
				const errorStr = JSON.stringify(moveError);
				throw new Error(
					`Failed to parse white move at ${this.locationStr(offsetBeforeMove)}: ${errorStr}`
				);
			}
			if (!move) {
				// MOTE: After number there must be a white move.
				throw new Error(`Failed to parse move at ${this.locationStr(offsetBeforeMove)}`);
			}
			board.makeMove(move.fromSquare, move.toSquare, move.promotion ?? undefined);
			moves.push(move);

			offsetBeforeMove = this.offset;
			[move, moveError] = this.parsePieceMove(board);
			if (moveError) {
				const errorStr = JSON.stringify(moveError);
				throw new Error(
					`Failed to parse black move at ${this.locationStr(offsetBeforeMove)}: ${errorStr}`
				);
			}
			if (!move) {
				this.skipWhitespace();
				if (this.hasMoreChars()) {
					throw new Error(`Error at ${this.locationStr()}: expected black move or end of moves`);
				}
				// NOTE: Black move is allowed to be absent if there are no more moves.
				break;
			}
			board.makeMove(move.fromSquare, move.toSquare, move.promotion ?? undefined);
			moves.push(move);
		}

		if (variationLevel > 0) {
			throw new Error('Unmatched opening parenthesis in PGN string');
		}
		if (comment === 'multiline') {
			throw new Error('Unmatched opening bracket in PGN string');
		}
		return moves;
	}

	private parseMetadata(): void {
		this.tags = {};
		this.skipWhitespace();
		let tagStart: number;
		while (this.peekChar() === '[') {
			this.consumeChar(); // eat [
			tagStart = this.offset - 1;
			this.skipToChar('"');
			const tagEnd = this.offset - 1;
			this.consumeChar(); // eat "
			const tagName = this.pgn.slice(tagStart + 1, tagEnd).trim();
			const valueStart = this.offset - 1;
			this.skipToChar('"');
			const valueEnd = this.offset - 1;
			const tagValue = this.pgn.slice(valueStart, valueEnd).trim();
			this.tags[tagName] = tagValue;
			this.skipToChar(']');
			this.skipWhitespace();
		}
	}

	private parseMoveNumber(): number | null {
		this.skipWhitespace();
		let numberStr = '';
		for (let char: string | null = this.peekChar(); char != null; char = this.peekChar()) {
			if (char === '.') {
				this.consumeChar(); // consume '.'
				break;
			}
			if (!isNumberChar(char)) {
				console.error(`Expected move number at ${this.locationStr()}`);
				return null;
			}
			numberStr += char;
			this.consumeChar();
		}
		if (!numberStr.length) return null;
		const number = parseInt(numberStr, 10);
		if (isNaN(number)) {
			console.error(`Invalid move number at ${this.locationStr()}`);
			return null;
		}
		return number;
	}

	private parsePieceMove(board: ChessBoard): Either<ChessMoveInfo, AlgebraicMoveError | null> {
		this.skipWhitespace();
		const moveStr = this.consumeUntilWhiteSpace();
		if (!moveStr) return [, null];
		const [movePacked, moveError] = calculateMoveFromAlgebraic(board, moveStr);
		if (moveError) {
			return [, moveError];
		}
		const move = ChessMove.unpack(movePacked);
		const comment = this.maybeParseMoveComment();
		move.comment = comment ?? undefined;
		return [move];
	}

	private maybeParseMoveComment(): string | null {
		this.skipWhitespace();
		const char = this.peekChar();
		if (char !== '{') return null;
		const commentStart = this.offset + 1; // eat '{'
		const commentEndFound = this.skipToChar('}');
		if (!commentEndFound) {
			console.error(
				`Unterminated comment starting at ${this.locationStr()}: "${this.pgn.slice(commentStart - 1, commentStart + 30)}..."`
			);
			return null;
		}
		const commentEnd = this.offset - 1; // before '}'
		const comment = this.pgn.slice(commentStart, commentEnd).trim();
		return comment;
	}

	private skipWhitespace(): void {
		while (true) {
			const char = this.peekChar();
			if (char === null) break;
			if (isWhiteSpace(char)) {
				this.consumeChar();
				continue;
			}
			break;
		}
	}

	private consumeUntilWhiteSpace(): string | null {
		let str = '';
		for (; this.peekChar() !== null; this.consumeChar()) {
			const char = this.peekChar()!;
			if (char === null || isWhiteSpace(char)) {
				break;
			}
			str += char;
		}
		if (str.length === 0) return null;
		return str;
	}

	private skipToChar(target: string): boolean {
		while (true) {
			const char = this.consumeChar();
			if (char === null) return false;
			if (char === target) return true;
		}
	}

	private peekChar(): string | null {
		if (this.offset >= this.pgn.length) return null;
		return this.pgn[this.offset];
	}

	private consumeChar(): string | null {
		const char = this.peekChar();
		if (char === null) return null;
		if (char === '\n') {
			this.line++;
			this.lineOffset = 0;
		}
		this.offset++;
		this.lineOffset++;
		return char;
	}

	private hasMoreChars(): boolean {
		return this.offset < this.pgn.length;
	}

	private locationStr(
		offset = this.offset,
		lineOffset = this.lineOffset,
		line = this.line
	): string {
		const strPeek = this.pgn.slice(offset, offset + 10).replace(/\n/g, '\\n');
		return `${line}:${lineOffset} "${strPeek}"`;
	}
}

function popUntilValue(arr: string[], value: string): void {
	while (arr.length > 0) {
		const popped = arr.pop();
		if (popped === value) {
			break;
		}
	}
}

function isNumberChar(char: string): boolean {
	return char >= '0' && char <= '9';
}

function isWhiteSpace(char: string): boolean {
	return char === ' ' || char === '\n' || char === '\r';
}
