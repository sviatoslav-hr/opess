import { moveToAlgebraic } from '$lib/chess/algebraic';
import type { PieceColor } from '$lib/chess/basic';
import { ChessBoard, ChessMove, type ChessMoveRecord } from '$lib/chess/engine';
import { INITIAL_FEN, loadFen, type FENError } from '$lib/chess/fen';
import { matchOpeningNextNode, type Opening } from '$lib/chess/openings';
import type { PGNMoveNode } from '$lib/chess/pgn';

export interface ChessMoveDisplay {
	readonly algebraic: string;
	readonly moveNumber: number;
	readonly color: PieceColor;
}

/** Manages game moves, opening progress, and turn-based undo/redo. */
export class ChessGame {
	board: ChessBoard;
	private readonly moveNotation = new WeakMap<ChessMoveRecord, string>();
	private readonly turnEndMoveCounts: number[] = [];
	private setupMoveCount = 0;
	private readonly opening: Opening | null;
	private openingNode: PGNMoveNode | null = null;

	private constructor(board: ChessBoard, opening: Opening | null) {
		this.board = board;
		this.opening = opening;
	}

	static fromFen(fen = INITIAL_FEN, opening: Opening | null = null): Either<ChessGame, FENError> {
		const board = new ChessBoard();
		const [, error] = loadFen(board, fen);
		if (error) return [, error];
		board.generateLegalMoves();
		return [new ChessGame(board, opening)];
	}

	get currentOpeningNode(): PGNMoveNode | null {
		return this.openingNode;
	}

	get canUndo(): boolean {
		return this.board.appliedMoveCount > this.setupMoveCount;
	}

	get canRedo(): boolean {
		return this.board.canRedo && this.getMoveCountAfterRedo() > this.board.appliedMoveCount;
	}

	private getMoveCountAfterUndo(): number {
		return (
			this.turnEndMoveCounts.findLast((count) => count < this.board.appliedMoveCount) ??
			this.setupMoveCount
		);
	}

	private getMoveCountAfterRedo(): number {
		return (
			this.turnEndMoveCounts.find((count) => count > this.board.appliedMoveCount) ??
			this.board.appliedMoveCount
		);
	}

	/** Display data is derived from engine records; only notation is cached outside the engine. */
	getMoveHistory(): ChessMoveDisplay[] {
		return this.board.moveHistory.map((record) => {
			const algebraic = this.moveNotation.get(record);
			if (algebraic === undefined) throw new Error('Missing notation for recorded game move');
			return {
				algebraic,
				moveNumber: record.fullMoveNumberBeforeMove,
				color: ChessMove.colorOf(record.move),
			};
		});
	}

	playMove(move: ChessMove): boolean {
		const board = this.board;
		if (!board.legalMovesGenerated) board.generateLegalMoves();
		if (!board.legalMovesThisTurn.includes(move)) return false;

		let nextNode: PGNMoveNode | null = null;
		if (this.opening) {
			const [matchedNode] = matchOpeningNextNode(
				this.opening,
				this.openingNode,
				ChessMove.unpack(move)
			);
			if (!matchedNode) return false;
			nextNode = matchedNode;
		}
		const algebraic = moveToAlgebraic(board, move);
		const previousMoveCount = board.appliedMoveCount;
		if (!board.applyMove(move)) return false;
		board.generateLegalMoves();
		this.moveNotation.set(board.moveHistory[board.appliedMoveCount - 1], algebraic);
		this.discardTurnEndsAfter(previousMoveCount);
		this.openingNode = nextNode;
		return true;
	}

	private discardTurnEndsAfter(moveCount: number): void {
		while (true) {
			const lastTurnEnd = this.turnEndMoveCounts.at(-1);
			if (lastTurnEnd === undefined || lastTurnEnd <= moveCount) return;

			this.turnEndMoveCounts.pop();
		}
	}

	/**
	 * Marks the current position as the end of an undo/redo group.
	 * Call after each move in free play, or after the player move and opponent reply
	 * in opening practice. Repeated calls at the same position do not add a boundary.
	 */
	completeTurn(): void {
		const count = this.board.appliedMoveCount;
		if (!this.canUndo || this.turnEndMoveCounts.includes(count)) return;
		this.turnEndMoveCounts.push(count);
	}

	/**
	 * Makes the current position the earliest point undo can reach and clears turn boundaries.
	 * Use after setup moves, such as White's initial move when practicing Black.
	 * These moves remain in history, and opening progress is preserved.
	 */
	finishSetup(): void {
		this.setupMoveCount = this.board.appliedMoveCount;
		this.turnEndMoveCounts.length = 0;
	}

	/** Undoes moves back to the previous completed turn, without undoing setup moves. */
	undo(): boolean {
		if (!this.canUndo) return false;
		const targetMoveCount = this.getMoveCountAfterUndo();
		while (this.board.appliedMoveCount > targetMoveCount) {
			this.board.undoMove(/*skipGeneration*/ true);
			this.openingNode = this.openingNode?.prev ?? null;
		}
		this.board.generateLegalMoves();
		return true;
	}

	/** Replays the next completed turn. If any move fails, leaves the game unchanged. */
	redo(): boolean {
		if (!this.canRedo) return false;
		const targetMoveCount = this.getMoveCountAfterRedo();
		// Only redo stages a board copy: failed replay must not leave half a turn applied.
		const board = this.board.clone();
		let node = this.openingNode;
		while (board.appliedMoveCount < targetMoveCount) {
			if (!board.redoMove()) return false;
			if (this.opening) {
				const [nextNode] = matchOpeningNextNode(this.opening, node, board.lastMove!);
				if (!nextNode) return false;
				node = nextNode;
			}
		}
		this.board = board;
		this.openingNode = node;
		return true;
	}
}
