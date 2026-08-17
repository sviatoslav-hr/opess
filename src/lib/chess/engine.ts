import {
	ALL_CASTLING_RIGHTS,
	CASTLING_RIGHTS,
	ChessSquare,
	Ox88,
	PieceColor,
	type PositionStr,
	type RankChar,
} from '$lib/chess/basic';
import {
	PIECE_ID_MIN,
	PieceId,
	PROMOTION_PIECES,
	PromotionPiece,
	type PieceIdMaybe,
} from '$lib/chess/piece';

// TODO: Fix all imports on these dependencies from this file.
export { CASTLING_RIGHTS, ChessSquare, Ox88 } from '$lib/chess/basic';

export class ChessBoard {
	// NOTE: Chess board is a 1D array of size 128 (0x80) using the 0x88 board representation.
	// a1 b1 c1 d1 e1 f1 g1 h1 ...8 padding
	// a2 b2 c2 d2 e2 f2 g2 h2 ...
	// a3 b3 c3 d3 e3 f3 g3 h3 ...
	// a4 b4 c4 d4 e4 f4 g4 h4 ...
	// a5 b5 c5 d5 e5 f5 g5 h5 ...
	// a6 b6 c6 d6 e6 f6 g6 h6 ...
	// a7 b7 c7 d7 e7 f7 g7 h7 ...
	// a8 b8 c8 d8 e8 f8 g8 h8 ...
	readonly board = new Int8Array(Ox88.BOARD_SIZE);
	turnColor: PieceColor = PieceColor.WHITE;
	enPassantTarget: ChessSquare | null = null;
	castlingRights = ALL_CASTLING_RIGHTS;
	/** The number of halfmoves since the last capture or pawn advance, used for the fifty-move rule. */
	halfMoveClock = 0;
	/** The number of the full moves. It starts at 1 and is incremented after Black's move. */
	fullMoveNumber = 1;
	legalMovesGenerated = false;
	readonly undoMoves: ChessUndoMoveInfo[] = [];
	readonly legalMovesThisTurn: ChessMovePacked[] = [];
	private readonly pseudoLegalMoves: ChessMovePacked[] = [];

	get isWhiteTurn(): boolean {
		return this.turnColor === PieceColor.WHITE;
	}

	/** NOTE: This function does NOT regenerate legal moves to allow to call it multiple times.
	 * It is the caller's responsibility to call {@link ChessBoard.generateLegalMoves} after placing a piece.
	 */
	placePiece(square: ChessSquare, pieceId: PieceId): ChessError | void {
		if (!Ox88.isValidSquare(square)) {
			return ChessError.InvalidSquare({
				square,
				context: 'Cannot place a piece on an invalid square',
			});
		}
		this.board[square] = pieceId;
	}

	get(square: number): PieceIdMaybe {
		const value = this.board[square];
		if (PieceId.is(value) || value === PieceId.NONE) {
			return value;
		}
		throw new Error(`Invalid board value: ${value}`);
	}

	getPiece(square: number): PieceId | null {
		const piece = this.get(square);
		if (piece === PieceId.NONE) return null;
		return piece;
	}

	getPieceByStr(position: PositionStr): PieceId | null {
		const square = Ox88.squareFromStr(position);
		if (square == null) throw new Error(`Invalid position str: "${position}"`);
		return this.getPiece(square);
	}

	*iteratePieceSquares(): Generator<ChessSquare, void> {
		for (let square = 0; square < this.board.length; square++) {
			if (!Ox88.isValidSquare(square)) continue;
			const piece = this.getPiece(square);
			if (piece != null) {
				yield square;
			}
		}
	}

	*iteratePieces(): Generator<[ChessSquare, PieceId], void> {
		for (let square = 0; square < this.board.length; square++) {
			if (!Ox88.isValidSquare(square)) continue;
			const piece = this.getPiece(square);
			if (piece != null) {
				yield [square, piece];
			}
		}
	}

	findMove(from: ChessSquare, to: ChessSquare, promotion?: PromotionPiece): ChessMovePacked | null {
		for (const move of this.legalMovesThisTurn) {
			const moveFrom = ChessMovePacked.unpackFromSquare(move);
			const moveTo = ChessMovePacked.unpackToSquare(move);
			if (moveFrom === from && moveTo === to) {
				if (promotion != null) {
					const movePromotion = ChessMovePacked.unpackPromotionKind(move);
					if (movePromotion !== promotion) continue;
				}
				return move;
			}
		}
		return null;
	}

	findMovesByPiece(piece: PieceId): ChessMovePacked[] {
		const moves: ChessMovePacked[] = [];
		for (const move of this.legalMovesThisTurn) {
			const moveFrom = ChessMovePacked.unpackFromSquare(move);
			if (this.getPiece(moveFrom) === piece) {
				moves.push(move);
			}
		}
		return moves;
	}

	makeMove(
		from: ChessSquare,
		to: ChessSquare,
		promotion?: PromotionPiece
	): ChessMovePacked | null {
		for (const move of this.legalMovesThisTurn) {
			const moveFrom = ChessMovePacked.unpackFromSquare(move);
			const moveTo = ChessMovePacked.unpackToSquare(move);
			if (moveFrom === from && moveTo === to) {
				if (
					promotion != null &&
					ChessMovePacked.unpackPromotionKind(move) !== promotion
				) {
					continue;
				}
				const ok = this.applyMove(move, /*skipValidation*/ true);
				if (ok) {
					this.generateLegalMoves();
					return move;
				}
				break;
			}
		}
		return null;
	}

	undoMove(skipGeneration = false): void {
		const move = this.undoMoves.pop();
		if (move == null) return; // No move to undo
		this.board[move.fromSquare] = move.movedPieceId;
		this.board[move.toSquare] = move.isEnPassantCapture
			? PieceId.NONE
			: (move.capturedPieceId ?? PieceId.NONE);
		if (move.isEnPassantCapture && move.capturedPieceId != null) {
			const capturedPawnSquare = Ox88.square(
				Ox88.squareFile(move.toSquare),
				Ox88.squareRank(move.toSquare) + (PieceId.isWhite(move.movedPieceId) ? -1 : 1)
			);
			this.board[capturedPawnSquare] = move.capturedPieceId;
		}
		this.castlingRights = move.castlingBeforeMove;
		this.halfMoveClock = move.halfMoveClockBeforeMove;
		this.fullMoveNumber = move.fullMoveNumberBeforeMove;
		this.turnColor = PieceColor.opposite(this.turnColor);
		this.enPassantTarget = move.enPassantTargetBeforeMove ?? null;
		if (isCastlingMove(this, move.movedPieceId, move.fromSquare, move.toSquare)) {
			const rookFromSquare = CASTLING.ROOK_FROM_SQUARE_BY_KING_TO_SQUARE[move.toSquare];
			const rookToSquare = CASTLING.ROOK_TO_SQUARE_BY_KING_TO_SQUARE[move.toSquare];
			const rookPiece = this.getPiece(rookToSquare);
			if (rookPiece == null || !PieceId.colorEquals(move.movedPieceId, rookPiece)) {
				console.warn(
					`Castling move: rook piece (${rookPiece}) does not match move piece (${move.movedPieceId})`
				);
			}
			if (rookPiece != null) this.board[rookFromSquare] = rookPiece;
			this.board[rookToSquare] = PieceId.NONE;
		}
		// PERF: It could be better to delegate move generation to the caller for faster undo operations.
		if (!skipGeneration) this.generateLegalMoves();
	}

	applyMove(move: ChessMovePacked, skipValidation = false): boolean {
		if (!skipValidation && !this.legalMovesThisTurn.includes(move)) {
			return false;
		}
		const moveFromSquare = ChessMovePacked.unpackFromSquare(move);
		const moveToSquare = ChessMovePacked.unpackToSquare(move);
		const movePiece = ChessMovePacked.unpackMovedPiece(move);
		const castlingAfterMove = ChessMovePacked.unpackCastingRights(move);
		const enPassantTargetAfterMove = ChessMovePacked.unpackEnPassantTarget(move);
		const promotion = ChessMovePacked.unpackPromotionKind(move) ?? PromotionPiece.QUEEN;
		const isEnPassantCapture = ChessMovePacked.unpackIsEnPassantCapture(move);
		const boardPiece = this.getPiece(moveFromSquare);
		if (movePiece !== boardPiece) {
			throw new Error(`Move piece (${movePiece}) does not match board piece (${boardPiece})`);
		}
		let capturedPiece = this.getPiece(moveToSquare);

		if (isPromotingPawn(movePiece, moveToSquare)) {
			this.board[moveToSquare] = PromotionPiece.toPieceId(promotion, PieceId.colorOf(movePiece));
		} else if (isEnPassantCapture) {
			if (this.enPassantTarget != null) {
				const capturedPawnSquare = Ox88.square(
					Ox88.squareFile(this.enPassantTarget),
					Ox88.squareRank(this.enPassantTarget) + (PieceId.isWhite(movePiece) ? -1 : 1)
				);
				capturedPiece = this.getPiece(capturedPawnSquare);
				const targetPiece = PieceId.isWhite(movePiece) ? PieceId.BLACK_PAWN : PieceId.WHITE_PAWN;
				if (capturedPiece === targetPiece) {
					this.board[capturedPawnSquare] = PieceId.NONE;
				} else {
					console.error('No pawn to be captured as en passant target');
					return false;
				}
			} else {
				console.error(`En passant target is null, but move is marked as en passant capture`);
				return false;
			}
			this.board[moveToSquare] = movePiece;
		} else {
			if (isCastlingMove(this, movePiece, moveFromSquare, moveToSquare)) {
				const rookFromSquare = CASTLING.ROOK_FROM_SQUARE_BY_KING_TO_SQUARE[moveToSquare];
				const rookToSquare = CASTLING.ROOK_TO_SQUARE_BY_KING_TO_SQUARE[moveToSquare];
				const rookPiece = this.getPiece(rookFromSquare);
				if (rookPiece == null || !PieceId.colorEquals(movePiece, rookPiece)) {
					console.error(
						`Castling move: rook piece (${rookPiece}) does not match move piece (${movePiece})`
					);
					return false;
				}
				this.board[rookToSquare] = rookPiece;
				this.board[rookFromSquare] = PieceId.NONE;
			}
			this.board[moveToSquare] = movePiece;
		}
		this.board[moveFromSquare] = PieceId.NONE;

		this.undoMoves.push({
			fromSquare: moveFromSquare,
			toSquare: moveToSquare,
			movedPieceId: movePiece,
			castlingBeforeMove: this.castlingRights,
			halfMoveClockBeforeMove: this.halfMoveClock,
			fullMoveNumberBeforeMove: this.fullMoveNumber,
			enPassantTargetBeforeMove: this.enPassantTarget,
			capturedPieceId: capturedPiece,
			isEnPassantCapture,
		});
		this.castlingRights = castlingAfterMove;
		this.enPassantTarget = enPassantTargetAfterMove;

		if (PieceId.isPawn(movePiece) || capturedPiece != null) {
			this.halfMoveClock = 0;
		} else {
			this.halfMoveClock++;
		}
		if (this.turnColor === PieceColor.BLACK) {
			this.fullMoveNumber++;
		}
		this.turnColor = PieceColor.opposite(this.turnColor);
		this.legalMovesGenerated = false;

		return true;
	}

	/** @deprecated use new API */
	applyMove2(move: ChessMove): void {
		this.undoMoves.push({
			fromSquare: move.fromSquare,
			toSquare: move.toSquare,
			movedPieceId: move.movedPiece,
			castlingBeforeMove: this.castlingRights,
			halfMoveClockBeforeMove: this.halfMoveClock,
			fullMoveNumberBeforeMove: this.fullMoveNumber,
			enPassantTargetBeforeMove: this.enPassantTarget,
			capturedPieceId: move.capturedPiece,
			isEnPassantCapture: move.isEnPassantCapture === true,
		});
		this.board[move.toSquare] = move.movedPiece;
		this.board[move.fromSquare] = PieceId.NONE;
		this.turnColor = this.turnColor === PieceColor.WHITE ? PieceColor.BLACK : PieceColor.WHITE;
	}

	generateLegalMoves(): void {
		this.generateAllPseudoLegalMoves();
		this.legalMovesThisTurn.length = 0;
		const color = this.turnColor; // Save color because applying move changes turn.
		for (const move of this.pseudoLegalMoves) {
			let moveOk = this.applyMove(move, /*skipValidation*/ true);
			moveOk = moveOk && !this.isKingInCheck(color);
			if (moveOk) this.legalMovesThisTurn.push(move);
			this.undoMove(/*skipGeneration*/ true);
		}
		this.legalMovesGenerated = true;
	}

	// NOTE: All Legal moves, except may leave the king in check
	private generateAllPseudoLegalMoves(): void {
		const moves = this.pseudoLegalMoves;
		moves.length = 0;

		for (const square of this.iteratePieceSquares()) {
			const piece = this.getPiece(square);
			if (piece == null || PieceId.colorOf(piece) !== this.turnColor) continue;
			this.generatePseudoLegalMovesForPiece(square, piece, moves);
		}
		this.generatePseudoLegalMovesForCastling(moves);
	}

	private generatePseudoLegalMovesForPiece(
		fromSquare: ChessSquare,
		piece: PieceId,
		moves: ChessMovePacked[]
	): void {
		let offsets: readonly number[];
		let isContinuous = false;
		switch (piece) {
			case PieceId.WHITE_KNIGHT:
			case PieceId.BLACK_KNIGHT:
				offsets = Ox88.KNIGHT_OFFSETS;
				break;
			case PieceId.WHITE_BISHOP:
			case PieceId.BLACK_BISHOP:
				offsets = Ox88.BISHOP_OFFSETS;
				isContinuous = true;
				break;
			case PieceId.WHITE_ROOK:
			case PieceId.BLACK_ROOK:
				offsets = Ox88.ROOK_OFFSETS;
				isContinuous = true;
				break;
			case PieceId.WHITE_QUEEN:
			case PieceId.BLACK_QUEEN:
				offsets = Ox88.QUEEN_OFFSETS;
				isContinuous = true;
				break;
			case PieceId.WHITE_KING:
			case PieceId.BLACK_KING:
				offsets = Ox88.KING_OFFSETS;
				break;
			case PieceId.WHITE_PAWN:
			case PieceId.BLACK_PAWN:
				return this.generatePseudoLegalMovesForPawn(fromSquare, piece, moves);
			default: {
				throw new Error(
					`Unknown piece for generating pseudo-legal moves: ${piece satisfies never}`
				);
			}
		}
		for (const offset of offsets) {
			let toSquare = fromSquare + offset;
			while (Ox88.isValidSquare(toSquare)) {
				const targetPiece = this.getPiece(toSquare);
				if (targetPiece != null && PieceId.colorEquals(targetPiece, piece)) {
					break; // Cannot capture own piece
				}

				let castling = this.castlingRights;
				if (PieceId.isKing(piece)) {
					// NOTE: On any king move, castling rights should be removed.
					const colorCastling = PieceId.isWhite(piece)
						? CASTLING_RIGHTS.WHITE_KINGSIDE | CASTLING_RIGHTS.WHITE_QUEENSIDE
						: CASTLING_RIGHTS.BLACK_KINGSIDE | CASTLING_RIGHTS.BLACK_QUEENSIDE;
					castling &= ~colorCastling;
				} else {
					castling = removeCastlingRightForRookOnSquare(castling, piece, fromSquare);
				}
				if (targetPiece != null && PieceId.isRook(targetPiece)) {
					castling = removeCastlingRightForRookOnSquare(castling, targetPiece, toSquare);
				}

				moves.push(
					ChessMovePacked.pack({
						fromSquare: fromSquare,
						toSquare: toSquare,
						movedPiece: piece,
						capturedPiece: targetPiece,
						castlingAfterMove: castling,
					})
				);
				if (!isContinuous) break;
				if (targetPiece != null) break; // NOTE: Piece blocks further movement in this direction
				toSquare = toSquare + offset;
			}
		}
	}

	private generatePseudoLegalMovesForPawn(
		fromSquare: ChessSquare,
		pawn: typeof PieceId.WHITE_PAWN | typeof PieceId.BLACK_PAWN,
		moves: ChessMovePacked[]
	): void {
		const fromRank = Ox88.squareRank(fromSquare);
		const fromFile = Ox88.squareFile(fromSquare);

		let hasPieceInFront = false;
		const forwardRank = PieceId.isWhite(pawn) ? fromRank + 1 : fromRank - 1;
		hasPieceInFront = this.getPiece(Ox88.square(fromFile, forwardRank)) != null;
		if (!hasPieceInFront) {
			const toSquare = Ox88.square(fromFile, forwardRank);
			const promotions = Ox88.isPromotionSquare(toSquare) ? PromotionPiece.all() : [null];
			for (const promotionPiece of promotions) {
				moves.push(
					ChessMovePacked.pack({
						fromSquare: fromSquare,
						toSquare: toSquare,
						movedPiece: pawn,
						capturedPiece: null,
						promotion: promotionPiece,
						castlingAfterMove: this.castlingRights,
					})
				);
			}
		}

		const doublePushFromRank = PieceId.isWhite(pawn) ? 1 : 6;
		if (fromRank === doublePushFromRank && !hasPieceInFront) {
			const doublePushSquare = Ox88.square(fromFile, PieceId.isWhite(pawn) ? 3 : 4);
			if (this.getPiece(doublePushSquare) == null) {
				const enPassantTarget = Ox88.square(fromFile, PieceId.isWhite(pawn) ? 2 : 5);
				moves.push(
					ChessMovePacked.pack({
						fromSquare: fromSquare,
						toSquare: doublePushSquare,
						movedPiece: pawn,
						capturedPiece: null, // Cannot capture on a double push
						promotion: null, // Cannot promote on a double push
						castlingAfterMove: this.castlingRights,
						// NOTE: The square behind the pawn is the en passant target
						enPassantTargetAfterMove: enPassantTarget,
					})
				);
			}
		}

		const captureSquares = Ox88.PAWN_ATTACK_OFFSETS[PieceId.colorOf(pawn)];
		for (const offset of captureSquares) {
			// NOTE: We subtract offsets here because the 0x88 board is "mirrored" vertically.
			const captureSquare = fromSquare - offset;
			if (!Ox88.isValidSquare(captureSquare)) continue;
			const targetPiece = this.getPiece(captureSquare);
			if (targetPiece != null && !PieceId.colorEquals(targetPiece, pawn)) {
				const promotions = Ox88.isPromotionSquare(captureSquare) ? PromotionPiece.all() : [null];
				for (const promotionPiece of promotions) {
					moves.push(
						ChessMovePacked.pack({
							fromSquare: fromSquare,
							toSquare: captureSquare,
							movedPiece: pawn,
							capturedPiece: targetPiece,
							promotion: promotionPiece,
							castlingAfterMove: removeCastlingRightForRookOnSquare(
								this.castlingRights,
								targetPiece,
								captureSquare
							),
						})
					);
				}
			}
		}

		if (this.enPassantTarget != null) {
			const enPassantFromRank = PieceId.isWhite(pawn) ? 4 : 3;
			const enPassantToFile = Ox88.squareFile(this.enPassantTarget);
			// NOTE: Can only capture en passant if the pawn is on the correct rank and adjacent file
			if (fromRank === enPassantFromRank && Math.abs(fromFile - enPassantToFile) === 1) {
				moves.push(
					ChessMovePacked.pack({
						fromSquare: fromSquare,
						toSquare: this.enPassantTarget,
						movedPiece: pawn,
						capturedPiece: PieceId.isWhite(pawn) ? PieceId.BLACK_PAWN : PieceId.WHITE_PAWN,
						promotion: null, // Cannot promote on an en passant capture
						castlingAfterMove: this.castlingRights,
						isEnPassantCapture: true,
					})
				);
			}
		}
	}

	private generatePseudoLegalMovesForCastling(moves: ChessMovePacked[]): void {
		const rook = this.turnColor === PieceColor.WHITE ? PieceId.WHITE_ROOK : PieceId.BLACK_ROOK;
		const king = this.turnColor === PieceColor.WHITE ? PieceId.WHITE_KING : PieceId.BLACK_KING;
		const rank: RankChar = this.turnColor === PieceColor.WHITE ? '1' : '8';
		const kingFromSquare = Ox88.squareFromStr(`e${rank}`);
		const hasKing = this.getPiece(kingFromSquare) === king;
		const canCastleFromSquare = hasKing && !this.isSquareAttacked(kingFromSquare, this.turnColor);

		// Clear castling to leave only opposite castling rights
		const oppositeCastling = CASTLING.BY_COLOR[PieceColor.opposite(this.turnColor)];

		if (this.castlingRights & CASTLING.QUEENSIDE[this.turnColor]) {
			const hasRook = this.getPieceByStr(`a${rank}`) === rook;
			const hasSpaceBetween =
				this.getPieceByStr(`b${rank}`) == null &&
				this.getPieceByStr(`c${rank}`) == null &&
				this.getPieceByStr(`d${rank}`) == null;
			const transitSquare = Ox88.squareFromStr(`d${rank}`);
			const canCrossTransitSquare = !this.isSquareAttacked(transitSquare, this.turnColor);
			if (hasRook && canCastleFromSquare && hasSpaceBetween && canCrossTransitSquare) {
				moves.push(
					ChessMovePacked.pack({
						fromSquare: Ox88.squareFromStr(`e${rank}`),
						toSquare: Ox88.squareFromStr(`c${rank}`),
						movedPiece: king,
						capturedPiece: null,
						promotion: null,
						castlingAfterMove: this.castlingRights & oppositeCastling,
					})
				);
			}
		}

		if (this.castlingRights & CASTLING.KINGSIDE[this.turnColor]) {
			const hasSpaceBetween =
				this.getPieceByStr(`f${rank}`) == null && this.getPieceByStr(`g${rank}`) == null;
			const hasRook = this.getPieceByStr(`h${rank}`) === rook;
			const transitSquare = Ox88.squareFromStr(`f${rank}`);
			const canCrossTransitSquare = !this.isSquareAttacked(transitSquare, this.turnColor);
			if (hasRook && canCastleFromSquare && hasSpaceBetween && canCrossTransitSquare) {
				moves.push(
					ChessMovePacked.pack({
						fromSquare: Ox88.squareFromStr(`e${rank}`),
						toSquare: Ox88.squareFromStr(`g${rank}`),
						movedPiece: king,
						capturedPiece: null,
						promotion: null,
						castlingAfterMove: this.castlingRights & oppositeCastling,
					})
				);
			}
		}
	}

	isKingInCheck(color: PieceColor = this.turnColor): boolean {
		// PERF: Store the king's square to avoid iterating over all pieces.
		for (const square of this.iteratePieceSquares()) {
			const piece = this.getPiece(square);
			if (piece == null) continue;
			if (PieceId.colorOf(piece) !== color) continue;
			if (PieceId.isKing(piece)) {
				if (this.isSquareAttacked(square, color)) return true;
				return false;
			}
		}
		return false;
	}

	private isSquareAttacked(square: ChessSquare, color: PieceColor): boolean {
		const isWhite = color === PieceColor.WHITE;
		const pawnAttacker = isWhite ? PieceId.BLACK_PAWN : PieceId.WHITE_PAWN;
		if (this.isSquareAttackedByPiece(square, pawnAttacker)) return true;
		const knightAttacker = isWhite ? PieceId.BLACK_KNIGHT : PieceId.WHITE_KNIGHT;
		if (this.isSquareAttackedByPiece(square, knightAttacker)) return true;
		const bishopAttacker = isWhite ? PieceId.BLACK_BISHOP : PieceId.WHITE_BISHOP;
		if (this.isSquareAttackedByPiece(square, bishopAttacker)) return true;
		const rookAttacker = isWhite ? PieceId.BLACK_ROOK : PieceId.WHITE_ROOK;
		if (this.isSquareAttackedByPiece(square, rookAttacker)) return true;
		const queenAttacker = isWhite ? PieceId.BLACK_QUEEN : PieceId.WHITE_QUEEN;
		if (this.isSquareAttackedByPiece(square, queenAttacker)) return true;
		const kingAttacker = isWhite ? PieceId.BLACK_KING : PieceId.WHITE_KING;
		if (this.isSquareAttackedByPiece(square, kingAttacker)) return true;
		return false;
	}

	private isSquareAttackedByPiece(square: ChessSquare, attacker: PieceId): boolean {
		let offsets: readonly number[];
		let isContinuous = false;
		switch (attacker) {
			case PieceId.WHITE_KNIGHT:
			case PieceId.BLACK_KNIGHT:
				offsets = Ox88.KNIGHT_OFFSETS;
				break;
			case PieceId.WHITE_BISHOP:
			case PieceId.BLACK_BISHOP:
				offsets = Ox88.BISHOP_OFFSETS;
				isContinuous = true;
				break;
			case PieceId.WHITE_ROOK:
			case PieceId.BLACK_ROOK:
				offsets = Ox88.ROOK_OFFSETS;
				isContinuous = true;
				break;
			case PieceId.WHITE_QUEEN:
			case PieceId.BLACK_QUEEN:
				offsets = Ox88.QUEEN_OFFSETS;
				isContinuous = true;
				break;
			case PieceId.WHITE_KING:
			case PieceId.BLACK_KING:
				offsets = Ox88.KING_OFFSETS;
				break;
			case PieceId.WHITE_PAWN:
			case PieceId.BLACK_PAWN:
				// NOTE: Use attacks from this color because we are tracing back from attacked square
				//       and "mirror" the attack to check for attacks from the opponent's perspective.
				//       (Since pawn attacks work only in one direction)
				offsets = Ox88.PAWN_ATTACK_OFFSETS[PieceColor.opposite(PieceId.colorOf(attacker))];
				break;
			default: {
				throw new Error(
					`Unknown piece for generating pseudo-legal moves: ${attacker satisfies never}`
				);
			}
		}

		for (const offset of offsets) {
			let targetSquare = square + offset;
			while (Ox88.isValidSquare(targetSquare)) {
				const targetPiece = this.getPiece(targetSquare);
				if (targetPiece === attacker) return true;
				if (targetPiece != null || !isContinuous) break;
				targetSquare = targetSquare + offset;
			}
		}

		return false;
	}

	getMove(moveIndex: number): ChessMove | null {
		if (moveIndex < 0 || moveIndex >= this.undoMoves.length) {
			return null;
		}
		const undoMove = this.undoMoves[moveIndex];
		const pieceAfterMove = this.getPiece(undoMove.toSquare);

		const promotion =
			PieceId.isPawn(undoMove.movedPieceId) &&
			pieceAfterMove != null &&
			pieceAfterMove !== undoMove.movedPieceId
				? PieceId.asPromotion(pieceAfterMove)
				: null;
		const nextUndoMove: ChessUndoMoveInfo | undefined = this.undoMoves[moveIndex + 1];
		const castling = nextUndoMove?.castlingBeforeMove ?? this.castlingRights;
		const enPassantTarget = nextUndoMove?.enPassantTargetBeforeMove ?? this.enPassantTarget;

		return {
			fromSquare: undoMove.fromSquare,
			toSquare: undoMove.toSquare,
			movedPiece: undoMove.movedPieceId,
			castlingAfterMove: castling,
			enPassantTargetAfterMove: enPassantTarget,
			capturedPiece: undoMove.capturedPieceId,
			promotion: promotion,
			isEnPassantCapture: undoMove.isEnPassantCapture,
		};
	}

	clear(): void {
		this.board.fill(0);
		this.turnColor = PieceColor.WHITE;
		this.enPassantTarget = null;
		this.castlingRights = ALL_CASTLING_RIGHTS;
		this.halfMoveClock = 0;
		this.fullMoveNumber = 1;
		this.undoMoves.length = 0;
		this.legalMovesThisTurn.length = 0;
		this.pseudoLegalMoves.length = 0;
		this.legalMovesGenerated = false;
	}

	/**
	 * FIXME:
	 * @deprecated his function was created as a temporary solution to replace the old engine.
	 * Ideally, we should avoid cloning the board or limit cloninig as much as possible.
	 */
	clone(): ChessBoard {
		const newBoard = new ChessBoard();
		newBoard.board.set(this.board);
		newBoard.turnColor = this.turnColor;
		newBoard.enPassantTarget = this.enPassantTarget;
		newBoard.castlingRights = this.castlingRights;
		newBoard.halfMoveClock = this.halfMoveClock;
		newBoard.fullMoveNumber = this.fullMoveNumber;
		newBoard.undoMoves.push(...this.undoMoves);
		return newBoard;
	}
}

function isPromotingPawn(movedPiece: PieceId, toSquare: ChessSquare): boolean {
	if (!PieceId.isPawn(movedPiece)) return false;
	const promotionRank = PieceId.isWhite(movedPiece) ? 7 : 0;
	if (Ox88.squareRank(toSquare) === promotionRank) return true;
	return false;
}

function removeCastlingRightForRookOnSquare(
	castlingRights: number,
	piece: PieceId,
	square: ChessSquare
): number {
	if (piece === PieceId.WHITE_ROOK) {
		if (square === Ox88.squareFromStr('a1')) {
			return castlingRights & ~CASTLING_RIGHTS.WHITE_QUEENSIDE;
		}
		if (square === Ox88.squareFromStr('h1')) {
			return castlingRights & ~CASTLING_RIGHTS.WHITE_KINGSIDE;
		}
	} else if (piece === PieceId.BLACK_ROOK) {
		if (square === Ox88.squareFromStr('a8')) {
			return castlingRights & ~CASTLING_RIGHTS.BLACK_QUEENSIDE;
		}
		if (square === Ox88.squareFromStr('h8')) {
			return castlingRights & ~CASTLING_RIGHTS.BLACK_KINGSIDE;
		}
	}
	return castlingRights;
}

export const CASTLING = Object.freeze({
	BY_COLOR: {
		[PieceColor.WHITE]: CASTLING_RIGHTS.WHITE_QUEENSIDE | CASTLING_RIGHTS.WHITE_KINGSIDE,
		[PieceColor.BLACK]: CASTLING_RIGHTS.BLACK_QUEENSIDE | CASTLING_RIGHTS.BLACK_KINGSIDE,
	},
	KINGSIDE: {
		[PieceColor.WHITE]: CASTLING_RIGHTS.WHITE_KINGSIDE,
		[PieceColor.BLACK]: CASTLING_RIGHTS.BLACK_KINGSIDE,
	},
	QUEENSIDE: {
		[PieceColor.WHITE]: CASTLING_RIGHTS.WHITE_QUEENSIDE,
		[PieceColor.BLACK]: CASTLING_RIGHTS.BLACK_QUEENSIDE,
	},
	KING_FROM_SQUARE: {
		[PieceColor.WHITE]: Ox88.squareFromStr('e1'),
		[PieceColor.BLACK]: Ox88.squareFromStr('e8'),
	},
	KING_TO_QUEENSIDE_SQUARE: {
		[PieceColor.WHITE]: Ox88.squareFromStr('c1'),
		[PieceColor.BLACK]: Ox88.squareFromStr('c8'),
	},
	KING_TO_KINGSIDE_SQUARE: {
		[PieceColor.WHITE]: Ox88.squareFromStr('g1'),
		[PieceColor.BLACK]: Ox88.squareFromStr('g8'),
	},
	ROOK_FROM_SQUARE_BY_KING_TO_SQUARE: {
		[Ox88.squareFromStr('c1')]: Ox88.squareFromStr('a1'),
		[Ox88.squareFromStr('c8')]: Ox88.squareFromStr('a8'),
		[Ox88.squareFromStr('g1')]: Ox88.squareFromStr('h1'),
		[Ox88.squareFromStr('g8')]: Ox88.squareFromStr('h8'),
	},
	ROOK_TO_SQUARE_BY_KING_TO_SQUARE: {
		[Ox88.squareFromStr('c1')]: Ox88.squareFromStr('d1'),
		[Ox88.squareFromStr('c8')]: Ox88.squareFromStr('d8'),
		[Ox88.squareFromStr('g1')]: Ox88.squareFromStr('f1'),
		[Ox88.squareFromStr('g8')]: Ox88.squareFromStr('f8'),
	},
});

export function isCastlingMove(
	board: ChessBoard | null,
	movedPiece: PieceId,
	fromSquare: ChessSquare,
	toSquare: ChessSquare
): boolean {
	if (!PieceId.isKing(movedPiece)) return false;
	const kingSideCastling = CASTLING.KINGSIDE[PieceId.colorOf(movedPiece)];
	const queenSideCastling = CASTLING.QUEENSIDE[PieceId.colorOf(movedPiece)];
	if (board && (board.castlingRights & (kingSideCastling | queenSideCastling)) === 0) return false;

	const fromRank = Ox88.squareRank(fromSquare);
	const toRank = Ox88.squareRank(toSquare);
	if (fromRank !== toRank) return false;
	const color = PieceId.colorOf(movedPiece);
	const kingFromSquare = CASTLING.KING_FROM_SQUARE[color];
	if (kingFromSquare !== fromSquare) return false;

	const queenSideSquare = CASTLING.KING_TO_QUEENSIDE_SQUARE[color];
	const kingSideSquare = CASTLING.KING_TO_KINGSIDE_SQUARE[color];
	if (toSquare === queenSideSquare) {
		return !board || Boolean(board.castlingRights & queenSideCastling);
	}
	if (toSquare === kingSideSquare) {
		return !board || Boolean(board.castlingRights & kingSideCastling);
	}
	return false;
}

export type ChessMove = {
	fromSquare: ChessSquare;
	toSquare: ChessSquare;
	movedPiece: PieceId;
	capturedPiece: PieceId | null;
	promotion?: PromotionPiece | null;
	castlingAfterMove: number;
	enPassantTargetAfterMove?: ChessSquare | null;
	isEnPassantCapture?: boolean;
	comment?: string;
};

export function chessMoveEquals(a: ChessMove, b: ChessMove): boolean {
	if (a.movedPiece !== b.movedPiece) return false;
	if (a.fromSquare !== b.fromSquare) return false;
	if (a.toSquare !== b.toSquare) return false;
	if (a.capturedPiece != b.capturedPiece) return false;
	if (a.promotion != b.promotion) return false;
	if (a.castlingAfterMove !== b.castlingAfterMove) return false;
	if (a.enPassantTargetAfterMove != b.enPassantTargetAfterMove) return false;
	if (a.isEnPassantCapture !== b.isEnPassantCapture) return false;
	return true;
}

export type ChessMovePacked = number & { __packedChessMove: true };

export const ChessMovePacked = Object.freeze({
	FROM_SQUARE_OFFSET: 0,
	FROM_SQUARE_BITS: 6,
	TO_SQUARE_OFFSET: 6,
	TO_SQUARE_BITS: 6,
	MOVED_PIECE_OFFSET: 12,
	MOVED_PIECE_BITS: 4,
	CAPTURED_PIECE_OFFSET: 16,
	CAPTURED_PIECE_BITS: 4,
	PROMOTION_OFFSET: 20,
	PROMOTION_BITS: 3,
	CASTLING_RIGHTS_OFFSET: 23,
	CASTLING_RIGHTS_BITS: 4,
	EN_PASSANT_SQUARE_OFFSET: 27,
	EN_PASSANT_SQUARE_BITS: 4,
	EN_PASSANT_CAPTURE_OFFSET: 31,
	EN_PASSANT_CAPTURE_BITS: 1,
	pack: (move: ChessMove): ChessMovePacked => {
		let result = 0;
		{
			const rank = Ox88.squareRank(move.fromSquare);
			const file = Ox88.squareFile(move.fromSquare);
			const packed = (rank << 3) | file;
			result |= packed << ChessMovePacked.FROM_SQUARE_OFFSET;
		}
		{
			const rank = Ox88.squareRank(move.toSquare);
			const file = Ox88.squareFile(move.toSquare);
			const packed = (rank << 3) | file;
			result |= packed << ChessMovePacked.TO_SQUARE_OFFSET;
		}
		{
			// NOTE: Convert pieceId from [-6, 6] to [0, 12] so we can store it in 4 bits.
			const packed = move.movedPiece + Math.abs(PIECE_ID_MIN);
			result |= packed << ChessMovePacked.MOVED_PIECE_OFFSET;
		}
		{
			const packed = (move.capturedPiece ?? 0) + Math.abs(PIECE_ID_MIN);
			result |= packed << ChessMovePacked.CAPTURED_PIECE_OFFSET;
		}
		{
			// NOTE: 0 indicates no promotion and index is 1-based
			const packed = move.promotion == null ? 0 : PROMOTION_PIECES.indexOf(move.promotion) + 1;
			result |= packed << ChessMovePacked.PROMOTION_OFFSET;
		}
		{
			const packed = move.castlingAfterMove & 0b1111;
			result |= packed << ChessMovePacked.CASTLING_RIGHTS_OFFSET;
		}
		{
			let packed = 0;
			if (move.enPassantTargetAfterMove != null) {
				// NOTE: first bit indicates presence, remaining 3 bits represent the file.
				packed |= 1 << 3;
				packed |= Ox88.squareFile(move.enPassantTargetAfterMove) & 0b111;
			}
			result |= packed << ChessMovePacked.EN_PASSANT_SQUARE_OFFSET;
		}
		{
			const packed = move.isEnPassantCapture === true ? 1 : 0;
			result |= packed << ChessMovePacked.EN_PASSANT_CAPTURE_OFFSET;
		}
		return result as ChessMovePacked;
	},
	unpack: (packedMove: ChessMovePacked): ChessMove => {
		const from = ChessMovePacked.unpackFromSquare(packedMove);
		const to = ChessMovePacked.unpackToSquare(packedMove);
		const movedPiece = ChessMovePacked.unpackMovedPiece(packedMove);
		const capturedPiece = ChessMovePacked.unpackCapturedPiece(packedMove);
		const promotionKind = ChessMovePacked.unpackPromotionKind(packedMove);
		const castlingRights = ChessMovePacked.unpackCastingRights(packedMove);
		const enPassantTarget = ChessMovePacked.unpackEnPassantTarget(packedMove);
		const isEnPassantCapture = ChessMovePacked.unpackIsEnPassantCapture(packedMove);
		return {
			fromSquare: from,
			toSquare: to,
			movedPiece: movedPiece,
			castlingAfterMove: castlingRights,
			capturedPiece: capturedPiece,
			promotion: promotionKind,
			enPassantTargetAfterMove: enPassantTarget,
			isEnPassantCapture: isEnPassantCapture,
		};
	},
	unpackSquare: (packedSquare: number): ChessSquare => {
		const rank = packedSquare & 0b111;
		const file = (packedSquare >> 3) & 0b111;
		return Ox88.square(rank, file);
	},
	unpackPieceIdMaybe: (value: number): PieceId | null => {
		const pieceId = (value & 0b1111) - Math.abs(PieceId.WHITE_KING);
		if (PieceId.isMaybe(pieceId)) return pieceId === PieceId.NONE ? null : pieceId;
		throw new Error(`Invalid packed PieceIdMaybe: ${value}, unpacked=${pieceId}`);
	},
	unpackFromSquare: (move: ChessMovePacked): ChessSquare => {
		const mask = (1 << ChessMovePacked.FROM_SQUARE_BITS) - 1;
		const square = (move >> ChessMovePacked.FROM_SQUARE_OFFSET) & mask;
		return ChessMovePacked.unpackSquare(square);
	},
	unpackToSquare: (move: ChessMovePacked): ChessSquare => {
		const mask = (1 << ChessMovePacked.TO_SQUARE_BITS) - 1;
		const square = (move >> ChessMovePacked.TO_SQUARE_OFFSET) & mask;
		return ChessMovePacked.unpackSquare(square);
	},
	unpackColor: (move: ChessMovePacked): PieceColor => {
		const movedPiece = ChessMovePacked.unpackMovedPiece(move);
		return PieceId.colorOf(movedPiece);
	},
	unpackMovedPiece: (move: ChessMovePacked): PieceId => {
		const mask = (1 << ChessMovePacked.MOVED_PIECE_BITS) - 1;
		const value = (move >> ChessMovePacked.MOVED_PIECE_OFFSET) & mask;
		const pieceId = ChessMovePacked.unpackPieceIdMaybe(value);
		if (pieceId == null) throw new Error(`Got NONE when unpacking PieceId: ${value}`);
		return pieceId;
	},
	unpackCapturedPiece: (move: ChessMovePacked): PieceId | null => {
		const mask = (1 << ChessMovePacked.CAPTURED_PIECE_BITS) - 1;
		const value = (move >> ChessMovePacked.CAPTURED_PIECE_OFFSET) & mask;
		return ChessMovePacked.unpackPieceIdMaybe(value);
	},
	unpackPromotionKind: (move: ChessMovePacked): PromotionPiece | null => {
		const mask = (1 << ChessMovePacked.PROMOTION_BITS) - 1;
		const index = (move >> ChessMovePacked.PROMOTION_OFFSET) & mask;
		if (index === 0) return null;
		const kind = PROMOTION_PIECES[index - 1];
		if (kind == null) throw new Error(`Invalid packed PromotionPieceKind index: ${index}`);
		return kind;
	},
	unpackCastingRights: (value: ChessMovePacked): number => {
		const mask = (1 << ChessMovePacked.CASTLING_RIGHTS_BITS) - 1;
		const castlingRights = (value >> ChessMovePacked.CASTLING_RIGHTS_OFFSET) & mask;
		return castlingRights;
	},
	unpackEnPassantTarget: (value: ChessMovePacked): ChessSquare | null => {
		const mask = (1 << ChessMovePacked.EN_PASSANT_SQUARE_BITS) - 1;
		const enPassantValue = (value >> ChessMovePacked.EN_PASSANT_SQUARE_OFFSET) & mask;
		const hasValue = (enPassantValue & (1 << 3)) !== 0;
		if (!hasValue) return null;
		const file = enPassantValue & 0b111;
		const color = ChessMovePacked.unpackColor(value);
		const rank = color === PieceColor.WHITE ? 2 : 5;
		return Ox88.square(file, rank);
	},
	unpackIsEnPassantCapture: (value: ChessMovePacked): boolean => {
		const mask = (1 << ChessMovePacked.EN_PASSANT_CAPTURE_BITS) - 1;
		const enPassantCapture = (value >> ChessMovePacked.EN_PASSANT_CAPTURE_OFFSET) & mask;
		return enPassantCapture !== 0;
	},
	stringOf: (move: ChessMovePacked): string => {
		const fromSquare = Ox88.squareToString(ChessMovePacked.unpackFromSquare(move));
		const toSquare = Ox88.squareToString(ChessMovePacked.unpackToSquare(move));
		const promotion = ChessMovePacked.unpackPromotionKind(move);
		let promotionStr = '';
		if (promotion !== null) {
			promotionStr = PromotionPiece.keyOf(promotion);
		}
		return `${fromSquare}${toSquare}${promotionStr}`;
	},
});

export type ChessUndoMoveInfo = {
	fromSquare: ChessSquare;
	toSquare: ChessSquare;
	movedPieceId: PieceId;
	capturedPieceId: PieceId | null;
	isEnPassantCapture: boolean;
	castlingBeforeMove: number; // CASTLING_RIGHTS bitmask before the move
	enPassantTargetBeforeMove?: ChessSquare | null;
	halfMoveClockBeforeMove: number;
	fullMoveNumberBeforeMove: number;
};

export type ChessError =
	| {
			type: 'InvalidMove';
			fromSquare: ChessSquare;
			toSquare: ChessSquare;
			context?: string;
	  }
	| {
			type: 'IllegalMove';
			fromSquare: ChessSquare;
			toSquare: ChessSquare;
			context?: string;
	  }
	| {
			type: 'InvalidSquare';
			square: number;
			context?: string;
	  }
	| {
			type: 'WrongTurn';
			color: PieceColor;
	  };

const ChessErrorConstructors = {
	InvalidMove: (options: Omit<ChessError & { type: 'InvalidMove' }, 'type'>): ChessError => ({
		type: 'InvalidMove',
		...options,
	}),
	IllegalMove: (options: Omit<ChessError & { type: 'IllegalMove' }, 'type'>): ChessError => ({
		type: 'IllegalMove',
		...options,
	}),
	InvalidSquare: (options: Omit<ChessError & { type: 'InvalidSquare' }, 'type'>): ChessError => ({
		type: 'InvalidSquare',
		...options,
	}),
	WrongTurn: (color: PieceColor): ChessError => ({ type: 'WrongTurn', color }),
	// TODO: Improve this type to be more specific to the error.
} satisfies Record<ChessError['type'], (...args: any[]) => ChessError>;

const chessErrorTypes = Object.keys(
	ChessErrorConstructors
) as (keyof typeof ChessErrorConstructors)[];

export const ChessError = Object.freeze({
	...ChessErrorConstructors,
	is: (error: any): error is ChessError => {
		if (error == null || typeof error !== 'object') return false;
		if (typeof error.type !== 'string') return false;
		return chessErrorTypes.includes(error.type as ChessError['type']);
	},
});
