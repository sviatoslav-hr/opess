import { calculateMoveFromAlgebraic, type AlgebraicMoveError } from '$lib/chess/algebraic';
import { INITIAL_FEN, loadFen, type FENError } from '$lib/chess/fen';
import { ChessBoard, ChessMove, type ChessMoveInfo } from '$lib/chess/engine';

export interface PGNMovesLine {
	moves: ChessMoveInfo[];
	nodes: PGNMoveNode[];
	fen: string;
	tags: Record<string, string>;
}

export interface PGNTree {
	roots: PGNMoveNode[];
	fen: string;
	tags: Record<string, string>;
}

export interface PGNMoveNode {
	move: ChessMoveInfo;
	moveComment?: string;
	fullMoveNumber: number;
	next: PGNMoveNode[];
	prev: PGNMoveNode | null;
}

export type PGNError =
	| {
			type: 'invalidPGN';
			message: string;
			location?: string;
	  }
	| {
			type: 'invalidPGNMove';
			moveError: AlgebraicMoveError;
			location?: string;
	  }
	| {
			type: 'invalidPGNMoveNumber';
			message: string;
			location?: string;
	  }
	| {
			type: 'unterminatedPGNComment';
			comment: string;
			location?: string;
	  }
	| FENError;

function pgnError<T>(error: PGNError): Either<T, PGNError> {
	return [, error];
}

export class PGN {
	pgn = '';
	offset = 0;
	line = 1;
	lineOffset = 0;
	tags: Record<string, string> = {};
	board = new ChessBoard();

	private constructor() {}

	static parseMoves(pgn: string): Either<PGNMovesLine, PGNError> {
		const parser = new PGN();
		// TODO: Ignore variations during parsing in this case, because we don't want
		//       errors from variations to affect the result.
		const [roots, error] = parser.parse(pgn);
		if (error) return [, error];
		const moves: ChessMoveInfo[] = [];
		const nodes: PGNMoveNode[] = [];
		let node: PGNMoveNode | null = roots[0] ?? null;
		while (node) {
			nodes.push(node);
			moves.push(node.move);
			node = node.next[0] ?? null;
		}
		const fen = parser.tags['FEN'] ?? INITIAL_FEN;
		return [{ moves, nodes, tags: parser.tags, fen }];
	}

	static parse(pgn: string): Either<PGNTree, PGNError> {
		const parser = new PGN();
		const [roots, error] = parser.parse(pgn);
		if (error) return [, error];
		const fen = parser.tags['FEN'] ?? INITIAL_FEN;
		return [{ roots, tags: parser.tags, fen }];
	}

	parse(pgn: string): Either<PGNMoveNode[], PGNError> {
		this.pgn = pgn;
		this.offset = 0;
		this.line = 1;
		this.lineOffset = 0;
		this.parseMetadata();
		const fen = this.tags['FEN'] ?? INITIAL_FEN;
		this.board.clear();
		const [, fenError] = loadFen(this.board, fen);
		if (fenError) {
			return [, fenError];
		}

		const rootNodeResult = this.parseSequence();
		return rootNodeResult;
	}

	private parseSequence(isVariation = false): Either<PGNMoveNode[], PGNError> {
		let roots: PGNMoveNode[] = [];
		let currentNode: PGNMoveNode | null = null;
		let foundVariationEnd = false;
		while (this.hasMoreChars()) {
			const offset = this.offset;
			const [, leadingCommentError] = this.parseManyCommentsAndGetLast();
			if (leadingCommentError) return [, leadingCommentError];

			const char = this.pgn[this.offset];

			if (char === '(') {
				if (!currentNode) {
					return pgnError({
						type: 'invalidPGN',
						message: 'Variation cannot start before a move in PGN string',
						location: this.locationStr(),
					});
				}
				this.consumeChar();
				const board = this.board;
				this.board = this.board.clone();
				this.board.undoMove();
				const [variations, error] = this.parseSequence(true);
				if (error) return [, error];
				const parentNode = currentNode.prev;
				if (parentNode) {
					for (const variation of variations) {
						variation.prev = parentNode;
					}
					parentNode.next.push(...variations);
				} else {
					roots.push(...variations);
				}
				this.board = board;
				this.consumeChar(); // Consume ')'
				continue;
			} else if (isVariation && char === ')') {
				foundVariationEnd = true;
				break;
			}

			const [, commentError] = this.parseManyCommentsAndGetLast();
			if (commentError) return [, commentError];

			switch (char) {
				case ')':
					return pgnError({
						type: 'invalidPGN',
						message: 'Unmatched closing parenthesis in PGN string',
						location: this.locationStr(),
					});
				case '}':
					return pgnError({
						type: 'invalidPGN',
						message: 'Unmatched closing bracket in PGN string',
						location: this.locationStr(),
					});
			}

			if (this.endsWithResultMarker()) break;

			const [moveNumber, moveNumberError] = this.parseMoveNumber();
			if (moveNumberError) return [, moveNumberError];
			this.consumeWhitespaceAndEscapeLines();
			if (this.board.isWhiteTurn && moveNumber == null) {
				// NOTE: For white there should always be a move number, unless we're done parsing.
				//       And for black move number is optional.
				if (this.hasMoreChars()) {
					return pgnError({
						type: 'invalidPGNMoveNumber',
						message: 'Expected move number for white',
						location: this.locationStr(),
					});
				}
				break; // Done parsing - no number for white, no more moves.
			}

			let comment: string | null = null;
			if (moveNumber != null) {
				// NOTE: Comments may be located by both sides of the move number.
				const [lastComment, commentError] = this.parseManyCommentsAndGetLast();
				if (commentError) return [, commentError];
				comment = lastComment ?? comment;
			}

			let moveOffset = this.offset;
			let [move, moveError] = this.parseMove();
			if (moveError) {
				return pgnError({
					type: 'invalidPGNMove',
					moveError: moveError,
					location: this.locationStr(moveOffset),
				});
			}
			if (!move) {
				// NOTE: For white there must be a move after a number.
				if (this.board.isWhiteTurn) {
					return pgnError({
						type: 'invalidPGN',
						message: 'Expected move after move number',
						location: this.locationStr(moveOffset),
					});
				}

				// NOTE: Avoid looping forever on an unexpected token that no parser consumed.
				if (this.offset === offset) {
					return pgnError({
						type: 'invalidPGN',
						message: 'Failed to advance during parsing',
						location: this.locationStr(offset),
					});
				}
				// NOTE: If we didn't find the black move, it means there are no more moves,
				//       but there might still be comment or something...
				continue;
			}
			const fullMoveNumber = this.board.fullMoveNumber;
			// PERF: We already know this move is legal, so no need to look for legal moves in the board.
			this.board.makeMove(move.fromSquare, move.toSquare, move.promotion ?? undefined);

			{
				const [lastComment, commentError] = this.parseManyCommentsAndGetLast();
				if (commentError) return [, commentError];
				comment = lastComment ?? comment;
			}
			this.consumeAnnotationGlyphs();
			{
				const [lastComment, commentError] = this.parseManyCommentsAndGetLast();
				if (commentError) return [, commentError];
				comment = lastComment ?? comment;
			}
			const node: PGNMoveNode = {
				move,
				next: [],
				prev: null,
				fullMoveNumber,
			};
			node.moveComment = comment ?? undefined;
			if (!currentNode) {
				currentNode = node;
				roots.push(currentNode); // WARN: This can potentially cause problems because previously it was under "if"
			} else {
				currentNode.next.push(node);
				node.prev = currentNode;
				currentNode = node;
			}
		}

		if (!isVariation) {
			const [, error] = this.consumeResultMarker();
			if (error) return [, error];
		}

		if (isVariation && !foundVariationEnd) {
			// NOTE: If we got here, it means we didn't find a matching closing parenthesis.
			return pgnError({
				type: 'invalidPGN',
				message: 'Unmatched opening parenthesis in PGN string',
				location: this.locationStr(),
			});
		}
		if (!roots.length) {
			return pgnError({
				type: 'invalidPGN',
				message: 'No moves found in PGN string sequences',
				location: this.locationStr(),
			});
		}

		return [roots];
	}

	private parseMetadata(): void {
		this.tags = {};
		this.consumeWhitespaceAndEscapeLines();
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
			this.consumeWhitespaceAndEscapeLines();
		}
	}

	private parseMoveNumber(): Either<number | null, PGNError> {
		this.consumeWhitespaceAndEscapeLines();

		const numberStart = this.offset;
		let numberEnd = numberStart;
		while (numberEnd < this.pgn.length && isDigitChar(this.pgn[numberEnd])) {
			numberEnd++;
		}
		if (numberEnd === numberStart) return [null];

		let dotEnd = numberEnd;
		while (dotEnd < this.pgn.length && this.pgn[dotEnd] === '.') {
			dotEnd++;
		}
		const dotCount = dotEnd - numberEnd;
		if (dotCount === 0) return [null];

		// NOTE: White moves are represented by a single dot (e.g. "1."),
		//       while black moves are represented by three dots (e.g. "1...").
		const expectedDotCount = this.board.isWhiteTurn ? 1 : 3;
		if (dotCount !== expectedDotCount) {
			const color = this.board.isWhiteTurn ? 'white' : 'black';
			return pgnError({
				type: 'invalidPGNMoveNumber',
				message: `Invalid ${color} move number at ${this.locationStr()}, expected ${expectedDotCount} dot(s), got ${dotCount}`,
			});
		}

		const number = parseInt(this.pgn.slice(numberStart, numberEnd), 10);
		if (number !== this.board.fullMoveNumber) {
			return pgnError({
				type: 'invalidPGNMoveNumber',
				message: `Expected move number ${this.board.fullMoveNumber} at ${this.locationStr()}, got ${number}`,
			});
		}

		while (this.offset < dotEnd) this.consumeChar();
		return [number];
	}

	private parseMove(): Either<ChessMoveInfo | null, AlgebraicMoveError> {
		this.consumeWhitespaceAndEscapeLines();
		const moveStr = this.consumeUntilChars(NON_MOVE_CHARS);
		if (!moveStr) return [null];
		const [movePacked, moveError] = calculateMoveFromAlgebraic(this.board, moveStr);
		if (moveError) {
			return [, moveError];
		}
		const move = ChessMove.unpack(movePacked);
		return [move];
	}

	private parseManyCommentsAndGetLast(): Either<string | null, PGNError> {
		let lastComment: string | null = null;
		do {
			this.consumeWhitespaceAndEscapeLines();
			const [comment, error] = this.consumeComment();
			if (error) return [, error];
			if (comment == null) break;
			lastComment = comment;
		} while (true);
		return [lastComment];
	}

	private consumeComment(): Either<string | null, PGNError> {
		this.consumeWhitespaceAndEscapeLines();
		const char = this.peekChar();
		const isMultiline = char === '{';
		const isSingleline = char === ';';
		if (!isMultiline && !isSingleline) return [null];

		const endChar = isMultiline ? '}' : '\n';
		const commentStart = this.offset + 1; // skip '{' or ';'
		const commentEndFound = this.skipToChar(endChar);
		if (!commentEndFound) {
			if (isSingleline) {
				return [this.pgn.slice(commentStart).trim()];
			}
			const comment = this.pgn.slice(commentStart - 1, commentStart + 30);
			return pgnError({ type: 'unterminatedPGNComment', comment, location: this.locationStr() });
		}
		const commentEnd = this.offset - 1; // before '}' or '\n'
		const comment = this.pgn.slice(commentStart, commentEnd).trim();
		return [comment];
	}

	private consumeAnnotationGlyphs(): void {
		while (true) {
			this.consumeWhitespaceAndEscapeLines();
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

	private consumeWhitespaceAndEscapeLines(): void {
		while (true) {
			const char = this.peekChar();
			if (char === null) return;
			if (isWhiteSpace(char)) {
				this.consumeChar();
				continue;
			}

			// NOTE: This handles escape lines (lines starting with '%') and they should be ignored.
			const isStartOfLine = this.offset === 0 || this.pgn[this.offset - 1] === '\n';
			if (isStartOfLine && char === '%') {
				this.skipToChar('\n');
				continue;
			}
			return;
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

	private consumeResultMarker(): Either<null, PGNError> {
		this.consumeWhitespaceAndEscapeLines();
		const marker = this.pgn.slice(this.offset).trimEnd();
		if (marker === '') return [null];
		// Ignore the marker since it doesn't seem to be useful...
		if (RESULT_MARKERS.includes(marker)) return [null];
		return pgnError({
			type: 'invalidPGN',
			message: `Expected a result marker but found: "${marker}"`,
			location: this.locationStr(),
		});
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

export function countPGNNextMoveVariations(node: PGNMoveNode): number {
	if (!node.next) return 0;
	return node.next.length;
}

export function getPGNNextMoveVariations(node: PGNMoveNode): ChessMoveInfo[] {
	const moves = node.next.map((n) => n.move);
	return moves;
}
