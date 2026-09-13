<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { PieceColor } from '$lib/chess/basic';
	import { ChessBoard, ChessMove } from '$lib/chess/engine';
	import { boardToFen, INITIAL_FEN, loadFen } from '$lib/chess/fen';
	import { matchOpeningNextNode, getOpenings, type Opening } from '$lib/chess/openings';
	import {
		countPGNNextMoveVariations,
		getPGNNextMoveVariations,
		type PGNMoveNode,
	} from '$lib/chess/pgn';
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

	const AUTO_MOVE_DURATION_MS = 160;

	type View = 'board' | 'editor';
	const DEFAULT_VIEW: View = 'board';

	let boardRotated = $state(false);
	// NOTE: Using state.raw to prevent getting values wrapped in proxies
	//       and make change detection more predictive.
	let board = $state.raw(getInitialBoard(INITIAL_FEN));
	let currentFenStr = $state(INITIAL_FEN);
	$effect(() => {
		currentFenStr = boardToFen(board);
	});
	let openings = $state.raw(getOpenings());
	let currentOpening: Opening | null = $state.raw(null);
	// TODO: This probably should be encapsulated inside the opening manager.
	let currentOpeningNode: PGNMoveNode | null = $state.raw(null);
	let undoHistory = $derived.by(() => board.undoMoves);
	let alert: AlertInfo | null = $state(null);
	let autoMove: AutoMove | null = $state(null);
	let isAutoPlayingMove = $state(false);
	let canUndo = $derived(undoHistory.length > 0 && !isAutoPlayingMove);
	let title = $state('Opess');
	let isCoordsInside = $state(true);
	let view = $derived.by(() => {
		if (browser) {
			return parseView(page.url.searchParams.get('view'));
		}
		return DEFAULT_VIEW;
	});
	if (browser) {
		if (location?.href.includes('localhost')) {
			title = 'Opess (dev)';
		}
	}

	function getInitialBoard(fenStr: string) {
		const board = new ChessBoard();
		const [, initialFenError] = loadFen(board, fenStr);
		if (initialFenError) {
			throw new Error('Failed to load the initial position', { cause: initialFenError });
		}
		board.generateLegalMoves();
		return board;
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
			keepFocus: true,
		});
	}

	function onFENChange(fenStr: string) {
		if (currentFenStr === fenStr) {
			console.warn('[onFENChange] Got duplicate FEN change, skipping.');
			return;
		}
		const [, fenError] = loadFen(board, fenStr);
		if (fenError) {
			console.error('[onFENChange] Failed to load FEN:', fenError);
			alert = errorAlert(fenError.message);
			return;
		}
		currentFenStr = fenStr;
		autoMove = null;
		alert = null;
		currentOpening = null;
		currentOpeningNode = null;
		board.generateLegalMoves();
		board = board.clone();
	}

	async function onMove(movePacked: ChessMove) {
		if (isAutoPlayingMove) return;
		const move = ChessMove.unpack(movePacked);

		if (currentOpening) {
			if (PieceId.colorOf(move.movedPiece) !== currentOpening.color) {
				alert = errorAlert(
					`You are playing ${PieceColor.toString(currentOpening.color)} in ${currentOpening.name}.`
				);
				return;
			}
			const [nextNode, errorMessage] = matchOpeningNextNode(
				currentOpening,
				currentOpeningNode,
				move
			);
			if (!nextNode) {
				alert = errorAlert(errorMessage ?? 'Move does not match the selected opening.');
				return;
			}
			if (!board.applyMove(movePacked, true)) {
				alert = errorAlert('Failed to apply the move.');
				return;
			}
			board = board.clone();
			currentOpeningNode = nextNode;
			await autoPlayOpeningOpponentMove(currentOpening, nextNode);
			updateOpeningCompletionAlert();
			return;
		}

		if (!board.applyMove(movePacked, true)) {
			alert = errorAlert('Failed to apply the move.');
			return;
		}
		board.generateLegalMoves();
		board = board.clone();
		alert = null;
	}

	async function onOpeningSelected(opening: Opening) {
		const [, fenError] = loadFen(board, opening.fen);
		if (fenError) {
			alert = errorAlert(`Failed to load opening: ${fenError.message}`);
			return;
		}
		currentOpening = opening;
		undoHistory = [];
		autoMove = null;
		alert = null;
		currentOpeningNode = null;
		board.generateLegalMoves();
		board = board.clone();
		await autoPlayOpeningOpponentMove(opening, null);
		updateOpeningCompletionAlert();
	}

	async function autoPlayOpeningOpponentMove(
		opening: Opening,
		node: PGNMoveNode | null
	): Promise<void> {
		isAutoPlayingMove = true;
		try {
			while (board.turnColor !== currentOpening?.color) {
				const opponentMoves = node
					? getPGNNextMoveVariations(node)
					: opening.rootNodes.map((v) => v.move);
				if (opponentMoves.length === 0) break;

				const nextMove = opponentMoves[Math.floor(Math.random() * opponentMoves.length)];
				const [nextNode, errorMessage] = matchOpeningNextNode(opening, node, nextMove);
				if (errorMessage != null) {
					console.error('Failed to find next opening node:', errorMessage);
					break;
				}
				currentOpeningNode = nextNode;

				autoMove = {
					from: nextMove.fromSquare,
					to: nextMove.toSquare,
					piece: nextMove.movedPiece,
				};
				// TODO: This is not optimal, we shouldn't delay board update simply to animate the move.
				//       Ideally, we would update the board immediately and ask to animate the latest move.
				await sleep(AUTO_MOVE_DURATION_MS);
				if (!board.applyMove(ChessMove.pack(nextMove), true)) {
					alert = errorAlert('Failed to apply an opening move.');
					break;
				}
				autoMove = null;
				board.generateLegalMoves();
				board = board.clone();
			}
		} finally {
			autoMove = null;
			isAutoPlayingMove = false;
		}
	}

	function onUndo(): void {
		if (!canUndo || !undoHistory.length) {
			console.warn('Trying to undo without a snapshot.');
			return;
		}

		board.undoMove();
		board = board.clone();
		autoMove = null;
		if (currentOpening && currentOpeningNode) {
			currentOpeningNode = currentOpeningNode.prev;
		}
		updateOpeningCompletionAlert();
	}

	function updateOpeningCompletionAlert(): void {
		if (!currentOpening) {
			alert = null;
			return;
		}
		const successMessage = getOpeningSuccessMessage();
		alert = successMessage ? successAlert(successMessage) : null;
	}

	function getOpeningSuccessMessage(): string | null {
		if (!currentOpening || !currentOpeningNode) return null;
		const nextMovesCount = countPGNNextMoveVariations(currentOpeningNode);
		if (nextMovesCount > 0) return null;
		return `Opening complete: ${currentOpening.name}.`;
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
				disabled={isAutoPlayingMove}
				onChange={onFENChange}
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
			<OpeningSelector {openings} disabled={isAutoPlayingMove} onSelected={onOpeningSelected} />
			<Button onClick={onUndo} disabled={!canUndo}>Undo</Button>
			<MoveHistory {board} />
		{/if}
		{#if alert}
			<Alert variant={alert.type}>{alert.text}</Alert>
		{/if}
	</div>
</main>
