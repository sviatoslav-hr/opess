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
		this.consumeEscapeLine();
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

	private parseSequence(isVariation = false): PGNMoveNode {
		let rootNode: PGNMoveNode | null = null;
		let currentNode: PGNMoveNode | null = null;
		let foundVariationEnd = false;
		while (this.hasMoreChars()) {
			const offset = this.offset;
			this.parseManyCommentsAndGetLast();

			const char = this.pgn[this.offset];

			if (char === '(') {
				if (!currentNode) {
					throw new Error('Variation cannot start before a move in PGN string');
				}
				this.consumeChar();
				const board = this.board;
				this.board = this.board.clone();
				this.board.undoMove();
				const variation = this.parseSequence(true);
				currentNode.variations.push(variation);
				this.board = board;
				this.consumeChar(); // Consume ')'
				continue;
			} else if (isVariation && char === ')') {
				foundVariationEnd = true;
				break;
			}

			this.parseManyCommentsAndGetLast();

			switch (char) {
				case ')':
					throw new Error(`Unmatched closing parenthesis in PGN string at ${this.locationStr()}`);
				case '}':
					throw new Error(`Unmatched closing bracket in PGN string at ${this.locationStr()}`);
			}

			if (this.endsWithResultMarker()) break;

			const moveNumber = this.parseMoveNumber();
			this.consumeWhitespace();
			if (this.board.isWhiteTurn && moveNumber == null) {
				// NOTE: For white there should always be a move number, unless we're done parsing.
				//       And for black move number is optional.
				if (this.hasMoreChars()) {
					throw new Error(`Expected move number for white at ${this.locationStr()}`);
				}
				break; // Done parsing - no number for white, no more moves.
			}

			let comment: string | null = null;
			if (moveNumber != null) {
				// NOTE: Comments may be located by both sides of the move number.
				comment = this.parseManyCommentsAndGetLast();
			}

			let moveOffset = this.offset;
			let [move, moveError] = this.parseMove();
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
				if (this.offset === offset) {
					throw new Error(`Invalid PGN at ${this.locationStr(offset)}`);
				}
				// NOTE: If we didn't find the black move, it means there are no more moves,
				//       but there might still be comment or something...
				continue;
			}
			// PERF: We already know this move is legal, so no need to look for legal moves in the board.
			this.board.makeMove(move.fromSquare, move.toSquare, move.promotion ?? undefined);

			comment = this.parseManyCommentsAndGetLast() ?? comment;
			this.consumeAnnotationGlyphs();
			comment = this.parseManyCommentsAndGetLast() ?? comment;
			move.comment = comment ?? undefined;
			const node: PGNMoveNode = { move, next: null, variations: [] };
			if (!currentNode) {
				currentNode = node;
				if (!rootNode) rootNode = currentNode;
			} else {
				currentNode.next = node;
				currentNode = currentNode.next;
			}
		}

		if (!isVariation) {
			this.consumeResultMarker();
		}

		if (isVariation && !foundVariationEnd) {
			// NOTE: If we got here, it means we didn't find a matching closing parenthesis.
			throw new Error('Unmatched opening parenthesis in PGN string');
		}
		if (!rootNode) {
			throw new Error('No moves found in PGN string sequences');
		}

		return rootNode;
	}

	private parseMetadata(): void {
		this.tags = {};
		this.consumeWhitespace();
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
			this.consumeWhitespace();
		}
	}

	private parseMoveNumber(): number | null {
		this.consumeWhitespace();

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

	private parseMove(): Either<ChessMoveInfo, AlgebraicMoveError | null> {
		this.consumeWhitespace();
		const moveStr = this.consumeUntilChars(NON_MOVE_CHARS);
		if (!moveStr) return [, null];
		const [movePacked, moveError] = calculateMoveFromAlgebraic(this.board, moveStr);
		if (moveError) {
			return [, moveError];
		}
		const move = ChessMove.unpack(movePacked);
		return [move];
	}

	private parseManyCommentsAndGetLast(): string | null {
		let lastComment: string | null = null;
		do {
			this.consumeWhitespace();
			const comment = this.consumeComment();
			if (comment == null) break;
			lastComment = comment;
		} while (true);
		return lastComment;
	}

	private consumeComment(): string | null {
		this.consumeWhitespace();
		const char = this.peekChar();
		const isMultiline = char === '{';
		const isSingleline = char === ';';
		if (!isMultiline && !isSingleline) return null;

		const endChar = isMultiline ? '}' : '\n';
		const commentStart = this.offset + 1; // skip '{' or ';'
		const commentEndFound = this.skipToChar(endChar);
		if (!commentEndFound) {
			if (isSingleline) {
				return this.pgn.slice(commentStart).trim();
			}
			const comment = this.pgn.slice(commentStart - 1, commentStart + 30);
			throw new Error(`Unterminated comment starting at ${this.locationStr()}: "${comment}..."`);
		}
		const commentEnd = this.offset - 1; // before '}' or '\n'
		const comment = this.pgn.slice(commentStart, commentEnd).trim();
		return comment;
	}

	private consumeAnnotationGlyphs(): void {
		while (true) {
			this.consumeWhitespace();
			if (this.peekChar() === '$') {
				this.consumeNumericAnnotationGlyphs();
				continue;
			}

			// NOTE: Consume all possible symbolic combinations (e.g. '!', '?', '!?', ...).
			if (ANNOTATION_GLYPH_CHARS.includes(this.peekChar()!)) {
				this.consumeChar();
				if (ANNOTATION_GLYPH_CHARS.includes(this.peekChar()!)) {
					this.consumeChar();
				}
			} else {
				return;
			}
		}
	}

	/** NOTE: NAGs are glyphs that start with '$' and are followed by digits (e.g. '$123') */
	private consumeNumericAnnotationGlyphs(): void {
		if (this.peekChar() !== '$') return;
		this.consumeChar();
		while (true) {
			const char = this.peekChar();
			if (char === null || !isDigitChar(char)) break;
			this.consumeChar();
		}
	}

	/** NOTE: Escape line is expected be the first line of the PGN and start with '%'. */
	private consumeEscapeLine(): void {
		if (this.peekChar() !== '%') return;
		this.consumeUntilChars(['\n']);
	}

	private consumeWhitespace(): void {
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

	private consumeUntilChars(chars: string[]): string | null {
		let str = '';
		for (; this.peekChar() !== null; this.consumeChar()) {
			const char = this.peekChar()!;
			if (char === null || chars.includes(char)) {
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

	private endsWithResultMarker(): boolean {
		const marker = this.pgn.slice(this.offset).trimEnd();
		return RESULT_MARKERS.includes(marker);
	}

	private consumeResultMarker(): void {
		this.consumeWhitespace();
		const marker = this.pgn.slice(this.offset).trimEnd();
		if (marker === '') return;
		// Ignore the marker since it doesn't seem to be useful...
		if (RESULT_MARKERS.includes(marker)) return;
		throw new Error(`Expected a result marker but found: "${marker}"`);
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

const RESULT_MARKERS = ['1-0', '0-1', '1/2-1/2', '*'];
const ANNOTATION_GLYPH_CHARS = ['!', '?'];
const META_CHARS = ['%', '[', ']', '{', '}', ';', '(', ')', '$', '!', '?', '*'];
const WHITESPACE_CHARS = [' ', '\n', '\r', '\t'];
const NON_MOVE_CHARS = [...META_CHARS, ...WHITESPACE_CHARS];

function isDigitChar(char: string): boolean {
	if (char.length !== 1) return false;
	const code = char.charCodeAt(0);
	return code >= '0'.charCodeAt(0) && code <= '9'.charCodeAt(0);
}

function isWhiteSpace(char: string): boolean {
	return char === ' ' || char === '\n' || char === '\r' || char === '\t';
}
