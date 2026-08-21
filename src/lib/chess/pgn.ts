import { calculateMoveFromAlgebraic, type AlgebraicMoveError } from '$lib/chess/algebraic';
import { INITIAL_FEN, loadFen } from '$lib/chess/fen';
import { ChessBoard, ChessMove, type ChessMoveInfo } from '$lib/chess/engine';

export interface PGNMovesResult {
	moves: ChessMoveInfo[];
	tags: Record<string, string>;
}

export interface PGNResult {
	tags: Record<string, string>;
	root: PGNMoveNode;
}

export interface PGNMoveNode {
	// TODO: Store depth?
	// TODO: Store comment in the node, not in the move.
	move: ChessMoveInfo;
	next: PGNMoveNode | null;
	variations: PGNMoveNode[];
}

// TODO: Rename to 'PGN'
export class PGNParser {
	pgn = '';
	offset = 0;
	line = 1;
	lineOffset = 0;
	tags: Record<string, string> = {};
	board = new ChessBoard();

	private constructor() {}

	static parseMoves(pgn: string): PGNMovesResult {
		const parser = new PGNParser();
		// TODO: Ignore variations during parsing in this case, because we don't want
		//       errors from variations to affect the result.
		const root = parser.parse(pgn);
		const moves: ChessMoveInfo[] = [];
		let node: PGNMoveNode | null = root;
		while (node) {
			moves.push(node.move);
			// NOTE: We ignore variations here.
			node = node.next;
		}
		const tags = parser.tags;
		return { moves, tags };
	}

	static parse(pgn: string): PGNResult {
		const parser = new PGNParser();
		// TODO: Ignore variations during parsing in this case, because we don't want
		//       errors from variations to affect the result.
		const root = parser.parse(pgn);
		const tags = parser.tags;
		return { root, tags };
	}

	// TODO: Return Either<PGNMoveNode, error?> instead of throwing errors.
	parse(pgn: string): PGNMoveNode {
		this.pgn = pgn;
		this.offset = 0;
		this.line = 1;
		this.lineOffset = 0;
		this.parseMetadata();
		const fen = this.tags['FEN'] ?? INITIAL_FEN;
		this.board.clear();
		const fenError = loadFen(this.board, fen);
		if (fenError) {
			throw fenError;
		}

		const rootNode = this.parseSequence();
		return rootNode;
	}

	private parseSequence(): PGNMoveNode {
		let rootNode: PGNMoveNode | null = null;
		let currentNode: PGNMoveNode | null = null;
		let comment: 'line' | 'multiline' | null = null;
		let variationLevel = 0;
		while (this.hasMoreChars()) {
			const char = this.pgn[this.offset];
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

			const moveNumber = this.parseMoveNumber();
			this.skipWhitespace();
			if (this.board.isWhiteTurn && moveNumber == null) {
				// NOTE: For white there should always be a move number, unless we're done parsing.
				//       And for black move number is optional.
				if (this.hasMoreChars()) {
					throw new Error(`Expected move number for white at ${this.locationStr()}`);
				}
				break; // Done parsing - no number for white, no more moves.
			}
			let moveOffset = this.offset;
			let [move, moveError] = this.parsePieceMove();
			if (moveError) {
				const errorStr = JSON.stringify(moveError);
				const loc = this.locationStr(moveOffset);
				throw new Error(`Failed to parse white move at ${loc}: ${errorStr}`);
			}
			if (!move) {
				// NOTE: For white there must be a move after a number.
				if (this.board.isWhiteTurn) {
					throw new Error(`Failed to parse move at ${this.locationStr(moveOffset)}`);
				}
				// NOTE: If we didn't find the black move, it means there are no more moves,
				//       but there might still be comment or something...
				continue;
			}
			// PERF: We already know this move is legal, so no need to look for legal moves in the board.
			this.board.makeMove(move.fromSquare, move.toSquare, move.promotion ?? undefined);
			if (!currentNode) {
				currentNode = { move, next: null, variations: [] };
				if (!rootNode) rootNode = currentNode;
			} else {
				currentNode.next = { move, next: null, variations: [] };
				currentNode = currentNode.next;
			}
		}

		if (variationLevel > 0) {
			throw new Error('Unmatched opening parenthesis in PGN string');
		}
		if (comment === 'multiline') {
			throw new Error('Unmatched opening bracket in PGN string');
		}
		if (!rootNode) {
			throw new Error('No moves found in PGN string sequences');
		}

		return rootNode;
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

		const numberStart = this.offset;
		let numberEnd = numberStart;
		while (numberEnd < this.pgn.length && isDigitChar(this.pgn[numberEnd])) {
			numberEnd++;
		}
		if (numberEnd === numberStart) return null;

		let dotEnd = numberEnd;
		while (dotEnd < this.pgn.length && this.pgn[dotEnd] === '.') {
			dotEnd++;
		}
		const dotCount = dotEnd - numberEnd;
		if (dotCount === 0) return null;

		// NOTE: White moves are represented by a single dot (e.g. "1."),
		//       while black moves are represented by three dots (e.g. "1...").
		const expectedDotCount = this.board.isWhiteTurn ? 1 : 3;
		if (dotCount !== expectedDotCount) {
			const color = this.board.isWhiteTurn ? 'white' : 'black';
			throw new Error(
				`Invalid ${color} move number at ${this.locationStr()}, expected ${expectedDotCount} dot(s), got ${dotCount}`
			);
		}

		const number = parseInt(this.pgn.slice(numberStart, numberEnd), 10);
		if (number !== this.board.fullMoveNumber) {
			throw new Error(
				`Expected move number ${this.board.fullMoveNumber} at ${this.locationStr()}, got ${number}`
			);
		}

		while (this.offset < dotEnd) this.consumeChar();
		return number;
	}

	private parsePieceMove(): Either<ChessMoveInfo, AlgebraicMoveError | null> {
		this.skipWhitespace();
		const moveStr = this.consumeUntilWhiteSpace();
		if (!moveStr) return [, null];
		const [movePacked, moveError] = calculateMoveFromAlgebraic(this.board, moveStr);
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

function isDigitChar(char: string): boolean {
	if (char.length !== 1) return false;
	const code = char.charCodeAt(0);
	return code >= '0'.charCodeAt(0) && code <= '9'.charCodeAt(0);
}

function isWhiteSpace(char: string): boolean {
	return char === ' ' || char === '\n' || char === '\r';
}
