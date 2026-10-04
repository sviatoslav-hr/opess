import { describe, expect, it } from 'vitest';

import { calculateMoveFromAlgebraic } from '$lib/chess/algebraic';
import { PieceColor } from '$lib/chess/basic';
import { ChessMove } from '$lib/chess/engine';
import { boardToFen, INITIAL_FEN } from '$lib/chess/fen';
import { ChessGame } from '$lib/chess/game';
import type { Opening } from '$lib/chess/openings';
import { PGN, countPGNNextMoveVariations, type PGNMoveNode } from '$lib/chess/pgn';

function createGame(fen = INITIAL_FEN, opening: Opening | null = null): ChessGame {
	const [game, error] = ChessGame.fromFen(fen, opening);
	if (!game) throw new Error(error?.message);
	return game;
}

function playMove(game: ChessGame, algebraic: string): void {
	const [move, error] = calculateMoveFromAlgebraic(game.board, algebraic);
	if (!move || error) throw new Error(`Failed to find ${algebraic}: ${JSON.stringify(error)}`);
	if (!game.playMove(move)) throw new Error(`Failed to play ${algebraic}`);
}

function createOpeningGame(
	pgn: string,
	color: PieceColor = PieceColor.WHITE
): [ChessGame, PGNMoveNode[]] {
	const [line, error] = PGN.parseMoves(pgn);
	if (error) throw new Error(`Failed to parse test PGN: ${JSON.stringify(error)}`);
	return [
		createGame(line.fen, {
			name: 'Test opening',
			fen: line.fen,
			color,
			rootNodes: [line.nodes[0]],
		}),
		line.nodes,
	];
}

function playOpeningNode(game: ChessGame, node: PGNMoveNode): void {
	if (!game.playMove(ChessMove.pack(node.move))) {
		throw new Error(`Failed to play ${node.algebraic}`);
	}
}

function redo(game: ChessGame): void {
	if (!game.redo()) throw new Error('Failed to redo game');
}

describe('ChessGame', () => {
	it('starts with legal moves and empty navigation state', () => {
		const game = createGame();
		expect(boardToFen(game.board)).toBe(INITIAL_FEN);
		expect(game.board.legalMovesGenerated).toBe(true);
		expect(game.board.legalMovesThisTurn).toHaveLength(20);
		expect(game.board.moveHistory).toEqual([]);
		expect(game.board.appliedMoveCount).toBe(0);
		expect(game.getMoveHistory()).toEqual([]);
		expect(game.currentOpeningNode).toBe(null);
		expect(game.canUndo).toBe(false);
		expect(game.canRedo).toBe(false);
		game.completeTurn();
		expect(game.undo()).toBe(false);
		expect(game.redo()).toBe(false);
	});

	it('returns a FEN error without changing an existing game', () => {
		const game = createGame();
		playMove(game, 'e4');
		game.completeTurn();
		const fen = boardToFen(game.board);
		const [invalidGame, error] = ChessGame.fromFen('invalid');
		expect(invalidGame).toBeUndefined();
		expect(error?.type).toBe('invalidFEN');
		expect(boardToFen(game.board)).toBe(fen);
		expect(game.board.appliedMoveCount).toBe(1);
	});

	it('mutates the board and its single history when playing and undoing', () => {
		const game = createGame();
		const board = game.board;
		const records = board.moveHistory;
		const initialMoves = [...board.legalMovesThisTurn];
		playMove(game, 'e4');
		game.completeTurn();
		expect(game.board).toBe(board);
		expect(board.moveHistory).toBe(records);
		expect(board.appliedMoveCount).toBe(1);
		expect(records).toHaveLength(1);

		expect(game.undo()).toBe(true);
		expect(game.board).toBe(board);
		expect(board.moveHistory).toBe(records);
		expect(board.appliedMoveCount).toBe(0);
		expect(boardToFen(board)).toBe(INITIAL_FEN);
		expect(board.legalMovesThisTurn).toEqual(initialMoves);
		expect(records).toHaveLength(1);
	});

	it('commits successful redo without replacing recorded moves or losing cached notation', () => {
		const game = createGame();
		playMove(game, 'e4');
		game.completeTurn();
		const recorded = game.board.moveHistory[0];
		const display = game.getMoveHistory();
		const playedFen = boardToFen(game.board);
		game.undo();
		const undoneBoard = game.board;
		expect(game.redo()).toBe(true);
		expect(game.board.moveHistory[0]).toBe(recorded);
		expect(game.board.appliedMoveCount).toBe(1);
		expect(game.getMoveHistory()).toEqual(display);
		expect(boardToFen(game.board)).toBe(playedFen);
		// Redo swaps in its staged board rather than exposing a partially replayed turn.
		expect(game.board).not.toBe(undoneBoard);
		expect(boardToFen(undoneBoard)).toBe(INITIAL_FEN);
	});

	it('undoes and redoes one half-move at a time in free play', () => {
		const game = createGame();
		playMove(game, 'e4');
		game.completeTurn();
		const afterWhite = boardToFen(game.board);
		playMove(game, 'e5');
		game.completeTurn();
		const afterBlack = boardToFen(game.board);
		const legalMoves = [...game.board.legalMovesThisTurn];
		const records = game.board.moveHistory;

		game.undo();
		expect(game.board.appliedMoveCount).toBe(1);
		expect(game.board.moveHistory).toBe(records);
		expect(game.canUndo).toBe(true);
		expect(game.canRedo).toBe(true);
		expect(boardToFen(game.board)).toBe(afterWhite);
		expect(game.board.moveHistory).toHaveLength(2);
		redo(game);
		expect(game.board.appliedMoveCount).toBe(2);
		expect(game.canRedo).toBe(false);
		expect(boardToFen(game.board)).toBe(afterBlack);
		expect(game.board.legalMovesThisTurn).toEqual(legalMoves);
	});

	it('supports repeated undo and redo without removing recorded moves', () => {
		const game = createGame();
		for (const algebraic of ['e4', 'e5', 'Nf3']) {
			playMove(game, algebraic);
			game.completeTurn();
		}
		const finalFen = boardToFen(game.board);
		for (let count = 2; count >= 0; count--) {
			game.undo();
			expect(game.board.appliedMoveCount).toBe(count);
			expect(game.board.moveHistory).toHaveLength(3);
		}
		expect(game.canUndo).toBe(false);
		expect(boardToFen(game.board)).toBe(INITIAL_FEN);
		for (let count = 1; count <= 3; count++) {
			redo(game);
			expect(game.board.appliedMoveCount).toBe(count);
			expect(game.board.moveHistory).toHaveLength(3);
		}
		expect(boardToFen(game.board)).toBe(finalFen);
		expect(game.canRedo).toBe(false);
	});

	it('discards future moves only after a new move is successfully played', () => {
		const game = createGame();
		playMove(game, 'e4');
		game.completeTurn();
		playMove(game, 'e5');
		game.completeTurn();
		const invalidMove = game.board.moveHistory[1].move;
		game.undo();
		game.undo();
		const originalBoard = game.board;
		const originalHistory = game.board.moveHistory;
		expect(game.playMove(invalidMove)).toBe(false);
		expect(game.board).toBe(originalBoard);
		expect(game.board.moveHistory).toBe(originalHistory);
		expect(game.getMoveHistory().map((move) => move.algebraic)).toEqual(['e4', 'e5']);
		expect(game.board.appliedMoveCount).toBe(0);
		expect(game.canRedo).toBe(true);
		expect(boardToFen(game.board)).toBe(INITIAL_FEN);

		playMove(game, 'd4');
		game.completeTurn();
		expect(game.getMoveHistory().map((move) => move.algebraic)).toEqual(['d4']);
		expect(game.canRedo).toBe(false);
		const newFen = boardToFen(game.board);
		game.undo();
		redo(game);
		expect(boardToFen(game.board)).toBe(newFen);
	});

	it('does not record speculative moves used for legal moves or notation', () => {
		const game = createGame();
		playMove(game, 'e4');
		game.completeTurn();
		game.board.generateLegalMoves();
		expect(game.board.moveHistory).toHaveLength(1);
		expect(game.getMoveHistory()[0]).toEqual({
			algebraic: 'e4',
			moveNumber: 1,
			color: PieceColor.WHITE,
		});
	});

	it('keeps later turn boundaries when completing an already redone step', () => {
		const game = createGame();
		for (const algebraic of ['e4', 'e5', 'Nf3']) {
			playMove(game, algebraic);
			game.completeTurn();
			game.completeTurn();
		}
		const finalFen = boardToFen(game.board);
		game.undo();
		game.undo();
		redo(game);
		game.completeTurn();
		expect(game.board.appliedMoveCount).toBe(2);
		expect(game.canRedo).toBe(true);
		redo(game);
		expect(game.board.appliedMoveCount).toBe(3);
		expect(boardToFen(game.board)).toBe(finalFen);
		expect(game.redo()).toBe(false);
	});

	it('rejects legal moves outside the opening without discarding redo', () => {
		const [game, [e4, e5]] = createOpeningGame('1. e4 e5');
		playOpeningNode(game, e4);
		playOpeningNode(game, e5);
		game.completeTurn();
		game.undo();
		const records = [...game.board.moveHistory];
		const [d4] = calculateMoveFromAlgebraic(game.board, 'd4');
		expect(game.playMove(d4!)).toBe(false);
		expect(game.board.moveHistory).toEqual(records);
		expect(game.board.appliedMoveCount).toBe(0);
		expect(game.currentOpeningNode).toBe(null);
		expect(game.canRedo).toBe(true);
		redo(game);
		expect(game.currentOpeningNode).toBe(e5);
	});

	it('undoes and redoes the player move and exact opponent variation together', () => {
		const [game, [e4, e5, nf3]] = createOpeningGame('1. e4 e5 2. Nf3 Nc6 (2... Nf6)');
		const nf6 = nf3.next[1];
		playOpeningNode(game, e4);
		playOpeningNode(game, e5);
		game.completeTurn();
		const afterFirstTurn = boardToFen(game.board);
		playOpeningNode(game, nf3);
		playOpeningNode(game, nf6);
		game.completeTurn();
		const afterSecondTurn = boardToFen(game.board);

		game.undo();
		expect(game.board.appliedMoveCount).toBe(2);
		expect(game.currentOpeningNode).toBe(e5);
		expect(game.board.turnColor).toBe(PieceColor.WHITE);
		expect(boardToFen(game.board)).toBe(afterFirstTurn);
		redo(game);
		expect(game.board.appliedMoveCount).toBe(4);
		expect(game.currentOpeningNode).toBe(nf6);
		expect(boardToFen(game.board)).toBe(afterSecondTurn);
		game.undo();
		game.undo();
		expect(game.currentOpeningNode).toBe(null);
		expect(boardToFen(game.board)).toBe(INITIAL_FEN);
		redo(game);
		redo(game);
		expect(game.currentOpeningNode).toBe(nf6);
		expect(boardToFen(game.board)).toBe(afterSecondTurn);
	});

	it('matches redone opening moves within the current path, not globally', () => {
		const [game, nodes] = createOpeningGame('1. e4 e5 2. Nf3 Nc6 3. Ng1 Nb8 4. Nf3');
		for (const [index, node] of nodes.entries()) {
			playOpeningNode(game, node);
			if (index % 2 === 1 || index === nodes.length - 1) game.completeTurn();
		}
		expect(game.currentOpeningNode).toBe(nodes[6]);
		expect(game.currentOpeningNode).not.toBe(nodes[2]);
		for (const record of game.board.moveHistory) expect(record).not.toHaveProperty('openingNode');
		game.undo();
		expect(game.currentOpeningNode).toBe(nodes[5]);
		game.undo();
		expect(game.currentOpeningNode).toBe(nodes[3]);
		redo(game);
		redo(game);
		expect(game.currentOpeningNode).toBe(nodes[6]);
	});

	it('does not commit a replayed turn if its opening continuation no longer matches', () => {
		const [game, [e4, e5, nf3, nc6]] = createOpeningGame('1. e4 e5 2. Nf3 Nc6');
		playOpeningNode(game, e4);
		playOpeningNode(game, e5);
		game.completeTurn();
		playOpeningNode(game, nf3);
		playOpeningNode(game, nc6);
		game.completeTurn();
		game.undo();
		const board = game.board;
		const fen = boardToFen(board);
		const records = [...board.moveHistory];
		// Opening data may change independently of the engine's recorded moves.
		nf3.next.length = 0;
		expect(game.redo()).toBe(false);
		expect(game.board).toBe(board);
		expect(boardToFen(board)).toBe(fen);
		expect(board.appliedMoveCount).toBe(2);
		expect(board.moveHistory).toEqual(records);
		expect(game.currentOpeningNode).toBe(e5);
		expect(game.canRedo).toBe(true);
	});

	it('handles a final player move with no opponent reply', () => {
		const [game, [e4, e5, nf3]] = createOpeningGame('1. e4 e5 2. Nf3');
		playOpeningNode(game, e4);
		playOpeningNode(game, e5);
		game.completeTurn();
		const beforeFinalMove = boardToFen(game.board);
		playOpeningNode(game, nf3);
		game.completeTurn();
		const completedFen = boardToFen(game.board);
		game.undo();
		expect(game.board.appliedMoveCount).toBe(2);
		expect(game.currentOpeningNode).toBe(e5);
		expect(boardToFen(game.board)).toBe(beforeFinalMove);
		redo(game);
		expect(game.board.appliedMoveCount).toBe(3);
		expect(game.currentOpeningNode).toBe(nf3);
		expect(countPGNNextMoveVariations(game.currentOpeningNode!)).toBe(0);
		expect(boardToFen(game.board)).toBe(completedFen);
	});

	it('protects the initial opponent move when practicing Black', () => {
		const [game, [e4, e5, nf3, nc6]] = createOpeningGame('1. e4 e5 2. Nf3 Nc6', PieceColor.BLACK);
		playOpeningNode(game, e4);
		game.finishSetup();
		const setupFen = boardToFen(game.board);
		expect(game.canUndo).toBe(false);
		expect(game.canRedo).toBe(false);
		playOpeningNode(game, e5);
		playOpeningNode(game, nf3);
		game.completeTurn();
		const firstTurnFen = boardToFen(game.board);
		playOpeningNode(game, nc6);
		game.completeTurn();
		game.undo();
		expect(game.board.appliedMoveCount).toBe(3);
		expect(boardToFen(game.board)).toBe(firstTurnFen);
		game.undo();
		expect(game.board.appliedMoveCount).toBe(1);
		expect(game.currentOpeningNode).toBe(e4);
		expect(game.canUndo).toBe(false);
		expect(boardToFen(game.board)).toBe(setupFen);
		expect(game.board.turnColor).toBe(PieceColor.BLACK);
		redo(game);
		expect(game.currentOpeningNode).toBe(nf3);
		expect(boardToFen(game.board)).toBe(firstTurnFen);
		expect(game.board.turnColor).toBe(PieceColor.BLACK);
	});

	it('replaces a whole opening continuation after another player move', () => {
		const [game, [e4, e5, nf3, nc6]] = createOpeningGame('1. e4 e5 2. Nf3 (2. Bc4 Nf6) Nc6');
		const bc4 = e5.next[1];
		const nf6 = bc4.next[0];
		playOpeningNode(game, e4);
		playOpeningNode(game, e5);
		game.completeTurn();
		playOpeningNode(game, nf3);
		playOpeningNode(game, nc6);
		game.completeTurn();
		game.undo();
		playOpeningNode(game, bc4);
		playOpeningNode(game, nf6);
		game.completeTurn();
		expect(game.getMoveHistory().map((move) => move.algebraic)).toEqual(['e4', 'e5', 'Bc4', 'Nf6']);
		expect(game.canRedo).toBe(false);
		const variationFen = boardToFen(game.board);
		game.undo();
		redo(game);
		expect(game.currentOpeningNode).toBe(nf6);
		expect(boardToFen(game.board)).toBe(variationFen);
	});

	it.each(['e2', 'e7'] as const)(
		'does not advance board or history when redo fails at %s',
		(square) => {
			const game = createGame();
			playMove(game, 'e4');
			playMove(game, 'e5');
			game.completeTurn();
			game.undo();
			// Simulate a corrupted position to make the first or second recorded move fail.
			game.board.placePiece(square, null);
			game.board.generateLegalMoves();
			const board = game.board;
			const history = board.moveHistory;
			const records = [...history];
			const display = game.getMoveHistory();
			const fen = boardToFen(board);
			const legalMoves = [...board.legalMovesThisTurn];
			expect(game.redo()).toBe(false);
			expect(game.board).toBe(board);
			expect(game.board.moveHistory).toBe(history);
			expect(boardToFen(board)).toBe(fen);
			expect(board.appliedMoveCount).toBe(0);
			expect(board.legalMovesThisTurn).toEqual(legalMoves);
			expect(history).toEqual(records);
			expect(game.getMoveHistory()).toEqual(display);
			expect(game.canRedo).toBe(true);
		}
	);

	it.each([
		['double pawn push', INITIAL_FEN, 'e4'],
		['capture', '4k3/8/8/8/8/2b5/8/1N2K3 w - - 4 7', 'Nxc3'],
		['en passant', '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 12', 'exd6'],
		['castling', '4k3/8/8/8/8/8/8/4K2R w K - 4 7', 'O-O'],
		['underpromotion', '4k3/P7/8/8/8/8/8/4K3 w - - 0 7', 'a8=N'],
		['Black move', '4k1n1/8/8/8/8/8/8/4K3 b - - 4 7', 'Nf6'],
	])('round-trips %s with board metadata and legal moves', (_name, fen, algebraic) => {
		const game = createGame(fen);
		const originalMoves = [...game.board.legalMovesThisTurn];
		playMove(game, algebraic);
		game.completeTurn();
		const afterMoveFen = boardToFen(game.board);
		const afterMoveLegalMoves = [...game.board.legalMovesThisTurn];
		const afterMoveRecords = [...game.board.moveHistory];
		expect(game.getMoveHistory()[0].algebraic).toBe(algebraic);
		expect(game.getMoveHistory()[0].moveNumber).toBe(Number(fen.split(' ')[5]));
		game.undo();
		expect(boardToFen(game.board)).toBe(fen);
		expect(game.board.legalMovesThisTurn).toEqual(originalMoves);
		expect(game.board.appliedMoveCount).toBe(0);
		redo(game);
		expect(boardToFen(game.board)).toBe(afterMoveFen);
		expect(game.board.legalMovesThisTurn).toEqual(afterMoveLegalMoves);
		expect(game.board.moveHistory).toEqual(afterMoveRecords);
		expect(game.board.appliedMoveCount).toBe(1);
	});

	it('starts a new position with no undo, redo or opening node', () => {
		const [game, [e4, e5]] = createOpeningGame('1. e4 e5');
		playOpeningNode(game, e4);
		playOpeningNode(game, e5);
		game.completeTurn();
		game.undo();
		expect(game.canRedo).toBe(true);
		const resetGame = createGame('4k3/8/8/8/8/8/8/4K3 b - - 4 7');
		expect(resetGame.board.moveHistory).toEqual([]);
		expect(resetGame.board.appliedMoveCount).toBe(0);
		expect(resetGame.currentOpeningNode).toBe(null);
		expect(resetGame.canUndo).toBe(false);
		expect(resetGame.canRedo).toBe(false);
		expect(resetGame.board.turnColor).toBe(PieceColor.BLACK);
	});
});
