import { calculateMoveFromAlgebraic, type AlgebraicMoveError } from '$lib/chess/algebraic';
import { type BoardInfo } from '$lib/chess/board';
import { INITIAL_FEN, parseFen } from '$lib/chess/fen';
import { applyMove, type Move } from '$lib/chess/moves';

export function parsePGNMoves(pgn: string): Move[] {
	console.log('Parsing PGN:\n', pgn);
	const parser = new PGNParser();
	return parser.parse(pgn);
}

class PGNParser {
	pgn = '';
	offset = 0;
	line = 1;
	lineOffset = 0;
	tags: Record<string, string> = {};

	parse(pgn: string): Move[] {
		this.pgn = pgn;
		this.offset = 0;
		this.line = 1;
		this.lineOffset = 0;
		this.parseMetadata();
		const fen = this.tags['FEN'] ?? INITIAL_FEN;
		let board = parseFen(fen);

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
			let [move, moveError] = this.parsePieceMove(board);
			if (moveError) {
				const errorStr = JSON.stringify(moveError);
				throw new Error(`Failed to parse white move at ${this.locationStr()}: ${errorStr}`);
			}
			if (!move) {
				// MOTE: After number there must be a white move.
				throw new Error(`Failed to parse move at ${this.locationStr()}`);
			}
			board = applyMove(board, move);

			[move, moveError] = this.parsePieceMove(board);
			if (moveError) {
				const errorStr = JSON.stringify(moveError);
				throw new Error(`Failed to parse black move at ${this.locationStr()}: ${errorStr}`);
			}
			if (!move) {
				this.skipWhitespace();
				if (this.hasMoreChars()) {
					throw new Error(`Error at ${this.locationStr()}: expected black move or end of moves`);
				}
				// NOTE: Black move is allowed to be absent if there are no more moves.
				break;
			}
			board = applyMove(board, move);
		}

		if (variationLevel > 0) {
			throw new Error('Unmatched opening parenthesis in PGN string');
		}
		if (comment === 'multiline') {
			throw new Error('Unmatched opening bracket in PGN string');
		}
		return board.moves;
	}

	private parseMetadata(): void {
		this.tags = {};
		this.skipWhitespace();
		let tagStart: number;
		while (this.peekChar() === '[') {
			this.consumeChar(); // eat [
			tagStart = this.offset;
			this.skipToChar('"');
			this.consumeChar(); // eat "
			const tagEnd = this.offset;
			const tagName = this.pgn.slice(tagStart + 1, tagEnd).trim();
			const valueStart = this.offset;
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

	private parsePieceMove(board: BoardInfo): Either<Move, AlgebraicMoveError | null> {
		this.skipWhitespace();
		const moveStr = this.consumeUntilWhiteSpace();
		if (!moveStr) return [, null];
		const [move, moveError] = calculateMoveFromAlgebraic(board, moveStr);
		if (moveError) {
			return [, moveError];
		}
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
			console.error(`Unterminated comment starting at ${this.locationStr()}`);
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

	private locationStr(): string {
		const strPeek = this.pgn.slice(this.offset, this.offset + 3).replace(/\n/g, '\\n');
		return `${this.line}:${this.lineOffset} "${strPeek}"`;
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
