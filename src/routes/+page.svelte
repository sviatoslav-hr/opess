<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { ChessBoard, ChessMove } from '$lib/chess/engine';
	import { boardToFen, INITIAL_FEN, loadFen } from '$lib/chess/fen';
	import {
		getExpectedOpeningMoves,
		getOpeningLineIndexes,
		getOpenings,
		validateOpeningMove,
		type Opening
	} from '$lib/chess/openings';
	import { PieceId } from '$lib/chess/piece';
	import { errorAlert, successAlert } from '$lib/components/Alert';
	import Alert, { type AlertInfo } from '$lib/components/Alert.svelte';
	import Board, { type AutoMove } from '$lib/components/Board.svelte';
	import Button from '$lib/components/Button.svelte';
	import Editor from '$lib/components/Editor.svelte';
	import FenInput from '$lib/components/FenInput.svelte';
	import MoveHistory from '$lib/components/MoveHistory.svelte';
	import OpeningSelector from '$lib/components/OpeningSelector.svelte';
	import { sleep } from '$lib/utils';
	import { PieceColor } from '$lib/chess/basic';

	const AUTO_MOVE_DURATION_MS = 160;

	interface HistorySnapshot {
		board: ChessBoard;
		lineIndexes: number[];
	}

	type View = 'board' | 'editor';
	const DEFAULT_VIEW: View = 'board';

	let boardRotated = $state(false);
	let currentFenStr = $state(INITIAL_FEN);
	let board = $state(new ChessBoard());
	// svelte-ignore state_referenced_locally
	loadFen(board, INITIAL_FEN);
	let openings = $state(getOpenings());
	let currentOpening: Opening | null = $state(null);
	let openingLineIndexes: number[] = $state([]);
	let undoHistory: HistorySnapshot[] = $state([]);
	let alert: AlertInfo | null = $state(null);
	let autoMove: AutoMove | null = $state(null);
	let isAutoPlaying = $state(false);
	let canUndo = $derived(undoHistory.length > 0 && !isAutoPlaying);
	let title = $state('Opess');
	let isCoordsInside = $state(true);
	let view = $derived(parseView(page.url.searchParams.get('view')));
	if (browser) {
		if (location?.href.includes('localhost')) {
			title = 'Opess (dev)';
		}
		console.log('openings', openings);
	}

	function parseView(value: string | null): View {
		return value === 'editor' ? 'editor' : DEFAULT_VIEW;
	}

	async function setView(nextView: View): Promise<void> {
		alert = null;
		const url = new URL(page.url);
		url.searchParams.set('view', nextView);
		await goto(url, {
			replaceState: true,
			noScroll: true,
			keepFocus: true
		});
	}

	function onFenChange(fenStr: string) {
		if (currentFenStr === fenStr) return;
		currentFenStr = fenStr;
		loadFen(board, fenStr);
		autoMove = null;
		undoHistory = [];
		alert = null;
		if (currentOpening) {
			openingLineIndexes = getOpeningLineIndexes(currentOpening);
		}
	}

	async function onMove(movePacked: ChessMove) {
		if (isAutoPlaying) return;
		const move = ChessMove.unpack(movePacked);

		if (currentOpening) {
			if (PieceId.colorOf(move.movedPiece) !== currentOpening.color) {
				alert = errorAlert(`You are playing ${currentOpening.color} in ${currentOpening.name}.`);
				return;
			}

			const validation = validateOpeningMove(
				currentOpening,
				move,
				board.fullMoveNumber,
				openingLineIndexes
			);
			if (!validation.valid) {
				alert = errorAlert(validation.errorMessage ?? 'Move does not match the selected opening.');
				return;
			}
			pushUndoSnapshot();
			const boardAfterUserMove = board.clone()
			boardAfterUserMove.applyMove2(move);
			board = boardAfterUserMove;
			currentFenStr = boardToFen(boardAfterUserMove);
			const autoPlayed = await autoPlayOppositeOpeningMoves(
				currentOpening,
				boardAfterUserMove,
				validation.matchedLineIndexes
			);
			board = autoPlayed.board;
			openingLineIndexes = autoPlayed.lineIndexes;
			currentFenStr = boardToFen(board);
			updateOpeningCompletionAlert(board, openingLineIndexes);
			return;
		}

		pushUndoSnapshot();
		board.applyMove2(move);
		const newFenStr = boardToFen(board);
		currentFenStr = newFenStr;
		alert = null;
	}

	async function onOpeningSelected(opening: Opening) {
		currentOpening = opening;
		const fenError = loadFen(board, opening.fen ?? INITIAL_FEN);
		if (fenError) {
            alert = errorAlert(`Failed to load opening: ${fenError}`);
            return;
        }
		const initialLineIndexes = getOpeningLineIndexes(opening);
		undoHistory = [];
		autoMove = null;
		alert = null;
		currentFenStr = boardToFen(board);
		openingLineIndexes = initialLineIndexes;
		const initialSnapshot = createHistorySnapshot(board, initialLineIndexes);
		const autoPlayed = await autoPlayOppositeOpeningMoves(opening, board, initialLineIndexes);
		board = autoPlayed.board;
		currentFenStr = boardToFen(board);
		openingLineIndexes = autoPlayed.lineIndexes;
		if (autoPlayed.board.fullMoveNumber > board.fullMoveNumber) {
			undoHistory.push(initialSnapshot);
		}
		updateOpeningCompletionAlert(board, openingLineIndexes);
	}

	async function autoPlayOppositeOpeningMoves(
		opening: Opening,
		board: ChessBoard,
		lineIndexes: number[]
	): Promise<{ board: ChessBoard; lineIndexes: number[] }> {
		let nextBoard = board;
		let nextLineIndexes = lineIndexes;

		isAutoPlaying = true;
		try {
			while (nextBoard.turnColor !== opening.color) {
				const expectedMoves = getExpectedOpeningMoves(
					opening,
					nextBoard.fullMoveNumber,
					nextLineIndexes
				);
				if (expectedMoves.length === 0) break;

				const expected = expectedMoves[Math.floor(Math.random() * expectedMoves.length)];
				const validation = validateOpeningMove(
					opening,
					expected.move,
					nextBoard.fullMoveNumber,
					nextLineIndexes
				);
				if (!validation.valid) break;

				autoMove = {
					from: expected.move.fromSquare,
					to: expected.move.toSquare,
					piece: expected.move.movedPiece
				};
				await sleep(AUTO_MOVE_DURATION_MS);
				nextBoard.applyMove2(expected.move);
				board = nextBoard;
				currentFenStr = boardToFen(nextBoard);
				autoMove = null;
				nextLineIndexes = validation.matchedLineIndexes;
			}
		} finally {
			autoMove = null;
			isAutoPlaying = false;
		}

		return { board: nextBoard, lineIndexes: nextLineIndexes };
	}

	function createHistorySnapshot(
		chessBoard: ChessBoard = board,
		lineIndexes: number[] = openingLineIndexes
	): HistorySnapshot {
		return {
			board: chessBoard.clone(),
			lineIndexes: [...lineIndexes]
		};
	}

	function pushUndoSnapshot(): void {
		undoHistory.push(createHistorySnapshot());
	}

	function onUndo(): void {
		if (!canUndo) return;

		const snapshot = undoHistory.pop();
		if (!snapshot) return;

		board = snapshot.board.clone();
		currentFenStr = boardToFen(board);
		openingLineIndexes = [...snapshot.lineIndexes];
		autoMove = null;
		updateOpeningCompletionAlert(board, openingLineIndexes);
	}

	function updateOpeningCompletionAlert(board: ChessBoard, lineIndexes: number[]): void {
		if (!currentOpening) {
			alert = null;
			return;
		}

		const successMessage = getOpeningSuccessMessage(currentOpening, board, lineIndexes);
		alert = successMessage ? successAlert(successMessage) : null;
	}

	function getOpeningSuccessMessage(
		opening: Opening,
board: ChessBoard,
		lineIndexes: number[]
	): string | null {
		const expectedMoves = getExpectedOpeningMoves(opening, board.fullMoveNumber, lineIndexes);
		if (expectedMoves.length > 0) return null;
		if (lineIndexes.length === 1) {
			const lineName = opening.lines[lineIndexes[0]]?.name;
			if (lineName) return `Opening complete: ${opening.name} (${lineName}).`;
		}
		return `Opening complete: ${opening.name}.`;
	}
</script>

<svelte:head>
	<title>{title}</title>
</svelte:head>

<main class="flex grow flex-col items-start justify-center overflow-hidden lg:items-center">
	{#if view === 'board'}
		<div class="fixed not-lg:right-4 not-lg:bottom-4 lg:top-4 lg:left-4">
			<FenInput
				class="w-96"
				value={currentFenStr}
				disabled={isAutoPlaying}
				onChange={onFenChange}
			/>
		</div>

		<Board
			{board}
			{boardRotated}
			{onMove}
			{autoMove}
			coordinates={isCoordsInside ? 'inside' : 'outside'}
		/>
	{:else if view === 'editor'}
		<Editor opening={openings[0]} onError={(error) => (alert = errorAlert(error))} />
	{/if}

	<div class="fixed top-4 right-4 flex w-48 flex-col justify-center gap-2">
		<Button class="" onClick={() => setView(view === 'board' ? 'editor' : 'board')}>
			Switch to {view === 'board' ? 'Editor' : 'Board'}
		</Button>

		{#if view === 'board'}
			<div>{board.turnColor === PieceColor.WHITE ? 'White' : 'Black'}'s turn</div>
			<Button onClick={() => (isCoordsInside = !isCoordsInside)}>Coordinates</Button>
			<Button onClick={() => (boardRotated = !boardRotated)}>Rotate</Button>
			<OpeningSelector {openings} disabled={isAutoPlaying} onSelected={onOpeningSelected} />
			<Button onClick={onUndo} disabled={!canUndo}>Undo</Button>
			<MoveHistory {board} />
		{/if}
		{#if alert}
			<Alert variant={alert.type}>{alert.text}</Alert>
		{/if}
	</div>
</main>
