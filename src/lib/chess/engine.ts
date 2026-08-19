import {
	CastlingRights,
	CastlingType,
	ChessError,
	ChessSquare,
	Ox88,
	PieceColor,
	type ChessSquareStr,
	type RankChar,
} from '$lib/chess/basic';
import { PIECE_ID_MIN, PieceId, PROMOTION_PIECES, PromotionPiece } from '$lib/chess/piece';

// TODO: Fix all imports on these dependencies from this file.
export { CastlingRights as CASTLING_RIGHTS, ChessSquare, Ox88 } from '$lib/chess/basic';

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
	castlingRights = CastlingRights.all();
	/** The number of halfmoves since the last capture or pawn advance, used for the fifty-move rule. */
	halfMoveClock = 0;
	/** The number of the full moves. It starts at 1 and is incremented after Black's move. */
	fullMoveNumber = 1;
	legalMovesGenerated = false;
	readonly undoMoves: ChessMoveUndoInfo[] = [];
	readonly legalMovesThisTurn: ChessMove[] = [];
	private readonly pseudoLegalMoves: ChessMove[] = [];
	/** [white, black] */
	private readonly kingSquares: [ChessSquare | null, ChessSquare | null] = [null, null];

	get isWhiteTurn(): boolean {
		return this.turnColor === PieceColor.WHITE;
	}

	/**
	 * Writes a piece to a square, or clears it when `pieceId` is `null`, while keeping the
	 * cached king locations synchronized. All ordinary board mutations must use this method
	 * so check detection can locate each king in constant time without scanning the board.
	 * Bulk mutations must update {@link kingSquares} explicitly.
	 *
	 * This method does not regenerate legal moves. The caller must invoke
	 * {@link ChessBoard.generateLegalMoves} after changing a position when updated moves are needed.
	 */
	placePiece(square: ChessSquare | ChessSquareStr, pieceId: PieceId | null): ChessError | void {
		if (typeof square === 'string') {
			square = ChessSquare.from(square);
		}
		if (!ChessSquare.is(square)) {
			return ChessError.InvalidSquare({
				square,
				context: 'Cannot place a piece on an invalid square',
			});
		}

		const previousPiece = this.getPiece(square);
		if (previousPiece != null && PieceId.isKing(previousPiece)) {
			const previousKingColor = PieceId.colorOf(previousPiece);
			if (this.kingSquares[previousKingColor] === square) {
				this.kingSquares[previousKingColor] = null;
			}
		}

		this.board[square] = pieceId ?? PieceId.NONE;

		if (pieceId != null && PieceId.isKing(pieceId)) {
			this.kingSquares[PieceId.colorOf(pieceId)] = square;
		}
	}

	getPiece(square: ChessSquare | ChessSquareStr): PieceId | null {
		if (typeof square === 'string') {
			square = ChessSquare.from(square);
		}
		const value = this.board[square];
		if (value === PieceId.NONE) return null;
		// NOTE: Skipping type validation because this function is called often and we don't expect the board to be corrupted.
		return value as PieceId;
	}

	*iteratePieceSquares(): Generator<ChessSquare, void> {
		for (let square = 0; square < this.board.length; square++) {
			if (!ChessSquare.is(square)) continue;
			const piece = this.getPiece(square);
			if (piece != null) {
				yield square;
			}
		}
	}

	*iteratePieces(): Generator<[ChessSquare, PieceId], void> {
		for (let square = 0; square < this.board.length; square++) {
			if (!ChessSquare.is(square)) continue;
			const piece = this.getPiece(square);
			if (piece != null) {
				yield [square, piece];
			}
		}
	}

	findMove(
		from: ChessSquare | ChessSquareStr,
		to: ChessSquare | ChessSquareStr,
		promotion?: PromotionPiece
	): ChessMove | null {
		if (typeof from === 'string') from = ChessSquare.from(from);
		if (typeof to === 'string') to = ChessSquare.from(to);

		for (const move of this.legalMovesThisTurn) {
			const moveFrom = ChessMove.unpackFromSquare(move);
			const moveTo = ChessMove.unpackToSquare(move);
			if (moveFrom === from && moveTo === to) {
				if (promotion != null) {
					const movePromotion = ChessMove.unpackPromotion(move);
					if (movePromotion !== promotion) continue;
				}
				return move;
			}
		}
		return null;
	}

	findMovesByPiece(piece: PieceId): ChessMove[] {
		const moves: ChessMove[] = [];
		for (const move of this.legalMovesThisTurn) {
			const moveFrom = ChessMove.unpackFromSquare(move);
			if (this.getPiece(moveFrom) === piece) {
				moves.push(move);
			}
		}
		return moves;
	}

	makeMove(
		from: ChessSquare | ChessSquareStr,
		to: ChessSquare | ChessSquareStr,
		promotion?: PromotionPiece
	): ChessMove | null {
		const move = this.findMove(from, to, promotion);
		if (move == null) return null;

		const ok = this.applyMove(move, /*skipValidation*/ true);
		if (!ok) return null;

		this.generateLegalMoves();
		return move;
	}

	undoMove(skipGeneration = false): void {
		const move = this.undoMoves.pop();
		if (move == null) return; // No move to undo
		this.placePiece(move.fromSquare, move.movedPieceId);
		this.placePiece(move.toSquare, move.isEnPassantCapture ? null : move.capturedPieceId);
		if (move.isEnPassantCapture && move.capturedPieceId != null) {
			const capturedPawnSquare = ChessSquare.from(
				ChessSquare.fileOf(move.toSquare),
				ChessSquare.rankOf(move.toSquare) + (PieceId.isWhite(move.movedPieceId) ? -1 : 1)
			);
			this.placePiece(capturedPawnSquare, move.capturedPieceId);
		}
		this.castlingRights = move.castlingBeforeMove;
		this.halfMoveClock = move.halfMoveClockBeforeMove;
		this.fullMoveNumber = move.fullMoveNumberBeforeMove;
		this.turnColor = PieceColor.opposite(this.turnColor);
		this.enPassantTarget = move.enPassantTargetBeforeMove ?? null;
		const castlingType = getMoveCastlingType(move.movedPieceId, move.fromSquare, move.toSquare);
		if (castlingType !== null) {
			const rookFromSquare = CastlingRights.rookOriginalByKingTargetSquare(move.toSquare);
			const rookToSquare = CastlingRights.rookTargetByKingTargetSquare(move.toSquare);
			const rookPiece = this.getPiece(rookToSquare);
			if (rookPiece == null || !PieceId.colorEquals(move.movedPieceId, rookPiece)) {
				console.warn(
					`Castling move: rook piece (${rookPiece}) does not match move piece (${move.movedPieceId})`
				);
			}
			if (rookPiece != null) this.placePiece(rookFromSquare, rookPiece);
			this.placePiece(rookToSquare, null);
		}
		// PERF: It could be better to delegate move generation to the caller for faster undo operations.
		if (!skipGeneration) this.generateLegalMoves();
	}

	applyMove(move: ChessMove, skipValidation = false): boolean {
		if (!skipValidation && !this.legalMovesThisTurn.includes(move)) {
			return false;
		}
		const moveFromSquare = ChessMove.unpackFromSquare(move);
		const moveToSquare = ChessMove.unpackToSquare(move);
		const movePiece = ChessMove.unpackMovedPiece(move);
		const enPassantTargetAfterMove = ChessMove.unpackEnPassantTarget(move);
		const promotion = ChessMove.unpackPromotion(move) ?? PromotionPiece.QUEEN;
		const isEnPassantCapture = ChessMove.unpackIsEnPassantCapture(move);
		const boardPiece = this.getPiece(moveFromSquare);
		if (movePiece !== boardPiece) {
			throw new Error(`Move piece (${movePiece}) does not match board piece (${boardPiece})`);
		}
		let capturedPiece = this.getPiece(moveToSquare);

		if (isPromotingPawn(movePiece, moveToSquare)) {
			this.placePiece(
				moveToSquare,
				PromotionPiece.toPieceId(promotion, PieceId.colorOf(movePiece))
			);
		} else if (isEnPassantCapture) {
			if (this.enPassantTarget != null) {
				const capturedPawnSquare = ChessSquare.from(
					ChessSquare.fileOf(this.enPassantTarget),
					ChessSquare.rankOf(this.enPassantTarget) + (PieceId.isWhite(movePiece) ? -1 : 1)
				);
				capturedPiece = this.getPiece(capturedPawnSquare);
				const targetPiece = PieceId.isWhite(movePiece) ? PieceId.BLACK_PAWN : PieceId.WHITE_PAWN;
				if (capturedPiece === targetPiece) {
					this.placePiece(capturedPawnSquare, null);
				} else {
					console.error('No pawn to be captured as en passant target');
					return false;
				}
			} else {
				console.error(`En passant target is null, but move is marked as en passant capture`);
				return false;
			}
			this.placePiece(moveToSquare, movePiece);
		} else {
			const castlingType = getMoveCastlingType(movePiece, moveFromSquare, moveToSquare);
			if (castlingType !== null) {
				const rookFromSquare = CastlingRights.rookOriginalByKingTargetSquare(moveToSquare);
				const rookToSquare = CastlingRights.rookTargetByKingTargetSquare(moveToSquare);
				const rookPiece = this.getPiece(rookFromSquare);
				if (rookPiece == null || !PieceId.colorEquals(movePiece, rookPiece)) {
					console.error(
						`Castling move: rook piece (${rookPiece}) does not match move piece (${movePiece})`
					);
					return false;
				}
				this.placePiece(rookToSquare, rookPiece);
				this.placePiece(rookFromSquare, null);
			}
			this.placePiece(moveToSquare, movePiece);
		}
		this.placePiece(moveFromSquare, null);

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
		this.castlingRights = castlingRightsAfterMove(this.castlingRights, move);
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
	applyMove2(move: ChessMoveInfo): void {
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
		this.placePiece(move.toSquare, move.movedPiece);
		this.placePiece(move.fromSquare, null);
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
		moves: ChessMove[]
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
			while (ChessSquare.is(toSquare)) {
				const targetPiece = this.getPiece(toSquare);
				if (targetPiece != null && PieceId.colorEquals(targetPiece, piece)) {
					break; // Cannot capture own piece
				}

				const move = ChessMove.pack({
					fromSquare: fromSquare,
					toSquare: toSquare,
					movedPiece: piece,
					capturedPiece: targetPiece,
				});
				moves.push(move);
				if (!isContinuous) break;
				if (targetPiece != null) break; // NOTE: Piece blocks further movement in this direction
				toSquare = toSquare + offset;
			}
		}
	}

	private generatePseudoLegalMovesForPawn(
		fromSquare: ChessSquare,
		pawn: typeof PieceId.WHITE_PAWN | typeof PieceId.BLACK_PAWN,
		moves: ChessMove[]
	): void {
		const fromRank = ChessSquare.rankOf(fromSquare);
		const fromFile = ChessSquare.fileOf(fromSquare);

		let hasPieceInFront = false;
		const forwardRank = PieceId.isWhite(pawn) ? fromRank + 1 : fromRank - 1;
		hasPieceInFront = this.getPiece(ChessSquare.from(fromFile, forwardRank)) != null;
		if (!hasPieceInFront) {
			const toSquare = ChessSquare.from(fromFile, forwardRank);
			const promotions = ChessSquare.isPromotion(toSquare) ? PromotionPiece.all() : [null];
			for (const promotionPiece of promotions) {
				const move = ChessMove.pack({
					fromSquare: fromSquare,
					toSquare: toSquare,
					movedPiece: pawn,
					capturedPiece: null,
					promotion: promotionPiece,
				});
				moves.push(move);
			}
		}

		const doublePushFromRank = PieceId.isWhite(pawn) ? 1 : 6;
		if (fromRank === doublePushFromRank && !hasPieceInFront) {
			const doublePushSquare = ChessSquare.from(fromFile, PieceId.isWhite(pawn) ? 3 : 4);
			if (this.getPiece(doublePushSquare) == null) {
				const enPassantTarget = ChessSquare.from(fromFile, PieceId.isWhite(pawn) ? 2 : 5);
				const move = ChessMove.pack({
					fromSquare: fromSquare,
					toSquare: doublePushSquare,
					movedPiece: pawn,
					capturedPiece: null, // Cannot capture on a double push
					promotion: null, // Cannot promote on a double push
					// NOTE: The square behind the pawn is the en passant target
					enPassantTargetAfterMove: enPassantTarget,
				});
				moves.push(move);
			}
		}

		const captureSquares = Ox88.PAWN_ATTACK_OFFSETS[PieceId.colorOf(pawn)];
		for (const offset of captureSquares) {
			// NOTE: We subtract offsets here because the 0x88 board is "mirrored" vertically.
			const captureSquare = fromSquare - offset;
			if (!ChessSquare.is(captureSquare)) continue;
			const targetPiece = this.getPiece(captureSquare);
			if (targetPiece != null && !PieceId.colorEquals(targetPiece, pawn)) {
				const promotions = ChessSquare.isPromotion(captureSquare) ? PromotionPiece.all() : [null];
				for (const promotionPiece of promotions) {
					const move = ChessMove.pack({
						fromSquare: fromSquare,
						toSquare: captureSquare,
						movedPiece: pawn,
						capturedPiece: targetPiece,
						promotion: promotionPiece,
					});
					moves.push(move);
				}
			}
		}

		if (this.enPassantTarget != null) {
			const enPassantFromRank = PieceId.isWhite(pawn) ? 4 : 3;
			const enPassantToFile = ChessSquare.fileOf(this.enPassantTarget);
			// NOTE: Can only capture en passant if the pawn is on the correct rank and adjacent file
			if (fromRank === enPassantFromRank && Math.abs(fromFile - enPassantToFile) === 1) {
				const move = ChessMove.pack({
					fromSquare: fromSquare,
					toSquare: this.enPassantTarget,
					movedPiece: pawn,
					capturedPiece: PieceId.isWhite(pawn) ? PieceId.BLACK_PAWN : PieceId.WHITE_PAWN,
					promotion: null, // Cannot promote on an en passant capture
					isEnPassantCapture: true,
				});
				moves.push(move);
			}
		}
	}

	private generatePseudoLegalMovesForCastling(moves: ChessMove[]): void {
		const rook = this.turnColor === PieceColor.WHITE ? PieceId.WHITE_ROOK : PieceId.BLACK_ROOK;
		const king = this.turnColor === PieceColor.WHITE ? PieceId.WHITE_KING : PieceId.BLACK_KING;
		const rank: RankChar = this.turnColor === PieceColor.WHITE ? '1' : '8';
		const kingFromSquare = ChessSquare.from(`e${rank}`);
		const hasKing = this.getPiece(kingFromSquare) === king;
		const canCastleFromSquare = hasKing && !this.isSquareAttacked(kingFromSquare, this.turnColor);

		if (this.castlingRights & CastlingRights.by(CastlingType.QUEENSIDE, this.turnColor)) {
			const hasRook = this.getPiece(`a${rank}`) === rook;
			const hasSpaceBetween =
				this.getPiece(`b${rank}`) == null &&
				this.getPiece(`c${rank}`) == null &&
				this.getPiece(`d${rank}`) == null;
			const transitSquare = ChessSquare.from(`d${rank}`);
			const canCrossTransitSquare = !this.isSquareAttacked(transitSquare, this.turnColor);
			if (hasRook && canCastleFromSquare && hasSpaceBetween && canCrossTransitSquare) {
				const move = ChessMove.pack({
					fromSquare: ChessSquare.from(`e${rank}`),
					toSquare: ChessSquare.from(`c${rank}`),
					movedPiece: king,
					capturedPiece: null,
					promotion: null,
				});
				moves.push(move);
			}
		}

		if (this.castlingRights & CastlingRights.by(CastlingType.KINGSIDE, this.turnColor)) {
			const hasSpaceBetween =
				this.getPiece(`f${rank}`) == null && this.getPiece(`g${rank}`) == null;
			const hasRook = this.getPiece(`h${rank}`) === rook;
			const transitSquare = ChessSquare.from(`f${rank}`);
			const canCrossTransitSquare = !this.isSquareAttacked(transitSquare, this.turnColor);
			if (hasRook && canCastleFromSquare && hasSpaceBetween && canCrossTransitSquare) {
				const move = ChessMove.pack({
					fromSquare: ChessSquare.from(`e${rank}`),
					toSquare: ChessSquare.from(`g${rank}`),
					movedPiece: king,
					capturedPiece: null,
					promotion: null,
				});
				moves.push(move);
			}
		}
	}

	isKingInCheck(color: PieceColor = this.turnColor): boolean {
		const kingSquare = this.kingSquares[color];
		return kingSquare != null && this.isSquareAttacked(kingSquare, color);
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
			while (ChessSquare.is(targetSquare)) {
				const targetPiece = this.getPiece(targetSquare);
				if (targetPiece === attacker) return true;
				if (targetPiece != null || !isContinuous) break;
				targetSquare = targetSquare + offset;
			}
		}

		return false;
	}

	getMove(moveIndex: number): ChessMoveInfo | null {
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
		const nextUndoMove: ChessMoveUndoInfo | undefined = this.undoMoves[moveIndex + 1];
		const enPassantTarget = nextUndoMove?.enPassantTargetBeforeMove ?? this.enPassantTarget;

		return {
			fromSquare: undoMove.fromSquare,
			toSquare: undoMove.toSquare,
			movedPiece: undoMove.movedPieceId,
			enPassantTargetAfterMove: enPassantTarget,
			capturedPiece: undoMove.capturedPieceId,
			promotion: promotion,
			isEnPassantCapture: undoMove.isEnPassantCapture,
		};
	}

	clear(): void {
		this.board.fill(0);
		this.kingSquares.fill(null);
		this.turnColor = PieceColor.WHITE;
		this.enPassantTarget = null;
		this.castlingRights = CastlingRights.all();
		this.halfMoveClock = 0;
		this.fullMoveNumber = 1;
		this.undoMoves.length = 0;
	}

	/**
	 * FIXME:
	 * @deprecated his function was created as a temporary solution to replace the old engine.
	 * Ideally, we should avoid cloning the board or limit cloninig as much as possible.
	 */
	clone(): ChessBoard {
		const newBoard = new ChessBoard();
		newBoard.board.set(this.board);
		newBoard.kingSquares[PieceColor.WHITE] = this.kingSquares[PieceColor.WHITE];
		newBoard.kingSquares[PieceColor.BLACK] = this.kingSquares[PieceColor.BLACK];
		newBoard.turnColor = this.turnColor;
		newBoard.enPassantTarget = this.enPassantTarget;
		newBoard.castlingRights = this.castlingRights;
		newBoard.halfMoveClock = this.halfMoveClock;
		newBoard.fullMoveNumber = this.fullMoveNumber;
		newBoard.legalMovesGenerated = this.legalMovesGenerated;
		newBoard.undoMoves.push(...this.undoMoves);
		newBoard.legalMovesThisTurn.push(...this.legalMovesThisTurn);
		newBoard.pseudoLegalMoves.push(...this.pseudoLegalMoves);
		return newBoard;
	}
}

function isPromotingPawn(movedPiece: PieceId, toSquare: ChessSquare): boolean {
	if (!PieceId.isPawn(movedPiece)) return false;
	const promotionRank = PieceId.isWhite(movedPiece) ? 7 : 0;
	if (ChessSquare.rankOf(toSquare) === promotionRank) return true;
	return false;
}

function castlingRightsAfterMove(currentRights: number, move: ChessMove): number {
	const movedPiece = ChessMove.unpackMovedPiece(move);

	if (PieceId.isKing(movedPiece)) {
		currentRights &= ~CastlingRights.byColor(PieceId.colorOf(movedPiece));
	} else {
		const fromSquare = ChessMove.unpackFromSquare(move);
		currentRights = removeCastlingRightForRookOnSquare(currentRights, movedPiece, fromSquare);
	}

	const capturedPiece = ChessMove.unpackCapturedPiece(move);
	if (capturedPiece != null) {
		const toSquare = ChessMove.unpackToSquare(move);
		currentRights = removeCastlingRightForRookOnSquare(currentRights, capturedPiece, toSquare);
	}

	return currentRights;
}

function removeCastlingRightForRookOnSquare(
	castlingRights: number,
	piece: PieceId,
	square: ChessSquare
): number {
	if (piece === PieceId.WHITE_ROOK) {
		if (square === ChessSquare.from('a1')) {
			return castlingRights & ~CastlingRights.WHITE_QUEENSIDE;
		}
		if (square === ChessSquare.from('h1')) {
			return castlingRights & ~CastlingRights.WHITE_KINGSIDE;
		}
	} else if (piece === PieceId.BLACK_ROOK) {
		if (square === ChessSquare.from('a8')) {
			return castlingRights & ~CastlingRights.BLACK_QUEENSIDE;
		}
		if (square === ChessSquare.from('h8')) {
			return castlingRights & ~CastlingRights.BLACK_KINGSIDE;
		}
	}
	return castlingRights;
}

export function getMoveCastlingType(
	movedPiece: PieceId,
	fromSquare: ChessSquare,
	toSquare: ChessSquare
): CastlingType | null {
	if (!PieceId.isKing(movedPiece)) return null;
	const color = PieceId.colorOf(movedPiece);
	const kingOriginalSquare = CastlingRights.kingOriginalSquare(color);
	if (fromSquare !== kingOriginalSquare) return null;
	const queenSideSquare = CastlingRights.kingTargetSquare(CastlingType.QUEENSIDE, color);
	if (toSquare === queenSideSquare) return CastlingType.QUEENSIDE;
	const kingSideSquare = CastlingRights.kingTargetSquare(CastlingType.KINGSIDE, color);
	if (toSquare === kingSideSquare) return CastlingType.KINGSIDE;
	return null;
}

export type ChessMoveInfo = {
	fromSquare: ChessSquare;
	toSquare: ChessSquare;
	movedPiece: PieceId;
	capturedPiece: PieceId | null;
	isEnPassantCapture?: boolean;
	promotion?: PromotionPiece | null;
	enPassantTargetAfterMove?: ChessSquare | null;
	comment?: string;
};

export function chessMoveInfoEquals(a: ChessMoveInfo, b: ChessMoveInfo): boolean {
	if (a.movedPiece !== b.movedPiece) return false;
	if (a.fromSquare !== b.fromSquare) return false;
	if (a.toSquare !== b.toSquare) return false;
	if (a.capturedPiece != b.capturedPiece) return false;
	if (a.promotion != b.promotion) return false;
	if (a.enPassantTargetAfterMove != b.enPassantTargetAfterMove) return false;
	if (a.isEnPassantCapture !== b.isEnPassantCapture) return false;
	return true;
}

export type ChessMove = number & { __brand: 'ChessMove' };

export const ChessMove = Object.freeze({
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
	EN_PASSANT_SQUARE_OFFSET: 27,
	EN_PASSANT_SQUARE_BITS: 4,
	EN_PASSANT_CAPTURE_OFFSET: 31,
	EN_PASSANT_CAPTURE_BITS: 1,
	pack: (move: ChessMoveInfo): ChessMove => {
		let result = 0;
		{
			const rank = ChessSquare.rankOf(move.fromSquare);
			const file = ChessSquare.fileOf(move.fromSquare);
			const packed = (rank << 3) | file;
			result |= packed << ChessMove.FROM_SQUARE_OFFSET;
		}
		{
			const rank = ChessSquare.rankOf(move.toSquare);
			const file = ChessSquare.fileOf(move.toSquare);
			const packed = (rank << 3) | file;
			result |= packed << ChessMove.TO_SQUARE_OFFSET;
		}
		{
			// NOTE: Convert pieceId from [-6, 6] to [0, 12] so we can store it in 4 bits.
			const packed = move.movedPiece + Math.abs(PIECE_ID_MIN);
			result |= packed << ChessMove.MOVED_PIECE_OFFSET;
		}
		{
			const packed = (move.capturedPiece ?? 0) + Math.abs(PIECE_ID_MIN);
			result |= packed << ChessMove.CAPTURED_PIECE_OFFSET;
		}
		{
			// NOTE: 0 indicates no promotion and index is 1-based
			const packed = move.promotion == null ? 0 : PROMOTION_PIECES.indexOf(move.promotion) + 1;
			result |= packed << ChessMove.PROMOTION_OFFSET;
		}
		{
			let packed = 0;
			if (move.enPassantTargetAfterMove != null) {
				// NOTE: first bit indicates presence, remaining 3 bits represent the file.
				packed |= 1 << 3;
				packed |= ChessSquare.fileOf(move.enPassantTargetAfterMove) & 0b111;
			}
			result |= packed << ChessMove.EN_PASSANT_SQUARE_OFFSET;
		}
		{
			const packed = move.isEnPassantCapture === true ? 1 : 0;
			result |= packed << ChessMove.EN_PASSANT_CAPTURE_OFFSET;
		}
		return result as ChessMove;
	},
	unpack: (packedMove: ChessMove): ChessMoveInfo => {
		const from = ChessMove.unpackFromSquare(packedMove);
		const to = ChessMove.unpackToSquare(packedMove);
		const movedPiece = ChessMove.unpackMovedPiece(packedMove);
		const capturedPiece = ChessMove.unpackCapturedPiece(packedMove);
		const promotion = ChessMove.unpackPromotion(packedMove);
		const enPassantTarget = ChessMove.unpackEnPassantTarget(packedMove);
		const isEnPassantCapture = ChessMove.unpackIsEnPassantCapture(packedMove);
		return {
			fromSquare: from,
			toSquare: to,
			movedPiece: movedPiece,
			capturedPiece: capturedPiece,
			promotion: promotion,
			enPassantTargetAfterMove: enPassantTarget,
			isEnPassantCapture: isEnPassantCapture,
		};
	},
	unpackSquare: (packedSquare: number): ChessSquare => {
		const file = packedSquare & 0b111;
		const rank = (packedSquare >> 3) & 0b111;
		return ChessSquare.from(file, rank);
	},
	unpackPieceIdMaybe: (value: number): PieceId | null => {
		const pieceId = (value & 0b1111) - Math.abs(PieceId.WHITE_KING);
		if (PieceId.isMaybe(pieceId)) return pieceId === PieceId.NONE ? null : pieceId;
		throw new Error(`Invalid packed PieceIdMaybe: ${value}, unpacked=${pieceId}`);
	},
	unpackFromSquare: (move: ChessMove): ChessSquare => {
		const mask = (1 << ChessMove.FROM_SQUARE_BITS) - 1;
		const square = (move >> ChessMove.FROM_SQUARE_OFFSET) & mask;
		return ChessMove.unpackSquare(square);
	},
	unpackToSquare: (move: ChessMove): ChessSquare => {
		const mask = (1 << ChessMove.TO_SQUARE_BITS) - 1;
		const square = (move >> ChessMove.TO_SQUARE_OFFSET) & mask;
		return ChessMove.unpackSquare(square);
	},
	unpackColor: (move: ChessMove): PieceColor => {
		const movedPiece = ChessMove.unpackMovedPiece(move);
		return PieceId.colorOf(movedPiece);
	},
	unpackMovedPiece: (move: ChessMove): PieceId => {
		const mask = (1 << ChessMove.MOVED_PIECE_BITS) - 1;
		const value = (move >> ChessMove.MOVED_PIECE_OFFSET) & mask;
		const pieceId = ChessMove.unpackPieceIdMaybe(value);
		if (pieceId == null) throw new Error(`Got NONE when unpacking PieceId: ${value}`);
		return pieceId;
	},
	unpackCapturedPiece: (move: ChessMove): PieceId | null => {
		const mask = (1 << ChessMove.CAPTURED_PIECE_BITS) - 1;
		const value = (move >> ChessMove.CAPTURED_PIECE_OFFSET) & mask;
		return ChessMove.unpackPieceIdMaybe(value);
	},
	unpackPromotion: (move: ChessMove): PromotionPiece | null => {
		const mask = (1 << ChessMove.PROMOTION_BITS) - 1;
		const index = (move >> ChessMove.PROMOTION_OFFSET) & mask;
		if (index === 0) return null;
		const kind = PROMOTION_PIECES[index - 1];
		if (kind == null) throw new Error(`Invalid packed PromotionPieceKind index: ${index}`);
		return kind;
	},
	unpackEnPassantTarget: (value: ChessMove): ChessSquare | null => {
		const mask = (1 << ChessMove.EN_PASSANT_SQUARE_BITS) - 1;
		const enPassantValue = (value >> ChessMove.EN_PASSANT_SQUARE_OFFSET) & mask;
		const hasValue = (enPassantValue & (1 << 3)) !== 0;
		if (!hasValue) return null;
		const file = enPassantValue & 0b111;
		const color = ChessMove.unpackColor(value);
		const rank = color === PieceColor.WHITE ? 2 : 5;
		return ChessSquare.from(file, rank);
	},
	unpackIsEnPassantCapture: (value: ChessMove): boolean => {
		const mask = (1 << ChessMove.EN_PASSANT_CAPTURE_BITS) - 1;
		const enPassantCapture = (value >> ChessMove.EN_PASSANT_CAPTURE_OFFSET) & mask;
		return enPassantCapture !== 0;
	},
	toString: (move: ChessMove): string => {
		const fromSquare = ChessSquare.toString(ChessMove.unpackFromSquare(move));
		const toSquare = ChessSquare.toString(ChessMove.unpackToSquare(move));
		const promotion = ChessMove.unpackPromotion(move);
		let promotionStr = '';
		if (promotion !== null) {
			promotionStr = PromotionPiece.keyOf(promotion);
		}
		return `${fromSquare}${toSquare}${promotionStr}`;
	},
	castlingTypeOf: (value: ChessMove): CastlingType | null => {
		const movedPiece = ChessMove.unpackMovedPiece(value);
		const fromSquare = ChessMove.unpackFromSquare(value);
		const toSquare = ChessMove.unpackToSquare(value);
		return getMoveCastlingType(movedPiece, fromSquare, toSquare);
	},
});

export type ChessMoveUndoInfo = {
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
