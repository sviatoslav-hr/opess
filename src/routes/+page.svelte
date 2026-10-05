<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { PieceColor } from '$lib/chess/basic';
	import { ChessMove } from '$lib/chess/engine';
	import { boardToFen, INITIAL_FEN } from '$lib/chess/fen';
	import { ChessGame } from '$lib/chess/game';
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
	let game = getInitialGame(INITIAL_FEN);
	let gameView = $state.raw(getGameView());
	let board = $derived(gameView.board);
	let currentFenStr = $state(INITIAL_FEN);
	$effect(() => {
		currentFenStr = boardToFen(board);
	});
	let openings = $state.raw(getOpenings());
	let currentOpening: Opening | null = $state.raw(null);
	let alert: AlertInfo | null = $state(null);
	let autoMove: AutoMove | null = $state(null);
	let isAutoPlayingMove = $state(false);
	let canUndo = $derived(gameView.canUndo && !isAutoPlayingMove);
	let canRedo = $derived(gameView.canRedo && !isAutoPlayingMove);
	let canRestart = $derived(
		currentOpening !== null &&
			!isAutoPlayingMove &&
			gameView.moves.some((move) => move.color === currentOpening?.color)
	);
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

	function getInitialGame(fenStr: string): ChessGame {
		const [game, initialFenError] = ChessGame.fromFen(fenStr);
		if (!game) {
			throw new Error('Failed to load the initial position', { cause: initialFenError });
		}
		return game;
	}

	// Domain classes are mutable. Publish fresh references at the Svelte rendering boundary.
	function getGameView() {
		return {
			board: game.board.clone(),
			moves: game.getMoveHistory(),
			appliedMoveCount: game.board.appliedMoveCount,
			canUndo: game.canUndo,
			canRedo: game.canRedo,
		};
	}

	function refreshGameView(): void {
		gameView = getGameView();
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
		const [nextGame, fenError] = ChessGame.fromFen(fenStr);
		if (fenError) {
			console.error('[onFENChange] Failed to load FEN:', fenError);
			alert = errorAlert(fenError.message);
			return;
		}
		currentFenStr = fenStr;
		autoMove = null;
		alert = null;
		currentOpening = null;
		game = nextGame;
		refreshGameView();
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
				game.currentOpeningNode,
				move
			);
			if (!nextNode) {
				alert = errorAlert(errorMessage ?? 'Move does not match the selected opening.');
				return;
			}
			if (!game.playMove(movePacked)) {
				alert = errorAlert('Failed to apply the move.');
				return;
			}
			refreshGameView();
			await autoPlayOpeningOpponentMove(currentOpening, nextNode);
			game.completeTurn();
			refreshGameView();
			updateOpeningCompletionAlert();
			return;
		}

		if (!game.playMove(movePacked)) {
			alert = errorAlert('Failed to apply the move.');
			return;
		}
		game.completeTurn();
		refreshGameView();
		alert = null;
	}

	async function onOpeningSelected(opening: Opening) {
		if (isAutoPlayingMove) return;
		const [nextGame, fenError] = ChessGame.fromFen(opening.fen, opening);
		if (fenError) {
			alert = errorAlert(`Failed to load opening: ${fenError.message}`);
			return;
		}
		currentOpening = opening;
		game = nextGame;
		refreshGameView();
		autoMove = null;
		alert = null;
		await autoPlayOpeningOpponentMove(opening, null);
		game.finishSetup();
		refreshGameView();
		updateOpeningCompletionAlert();
	}

	async function onRestart(): Promise<void> {
		if (!canRestart || !currentOpening) return;
		await onOpeningSelected(currentOpening);
	}

	async function autoPlayOpeningOpponentMove(
		opening: Opening,
		node: PGNMoveNode | null
	): Promise<void> {
		isAutoPlayingMove = true;
		try {
			while (game.board.turnColor !== opening.color) {
				const opponentMoves = node
					? getPGNNextMoveVariations(node)
					: opening.rootNodes.map((v) => v.move);
				if (opponentMoves.length === 0) break;

				const nextMove = opponentMoves[Math.floor(Math.random() * opponentMoves.length)];
				const [nextNode, errorMessage] = matchOpeningNextNode(opening, node, nextMove);
				if (!nextNode) {
					console.error('Failed to find next opening node:', errorMessage);
					break;
				}
				autoMove = {
					from: nextMove.fromSquare,
					to: nextMove.toSquare,
					piece: nextMove.movedPiece,
				};
				// TODO: This is not optimal, we shouldn't delay board update simply to animate the move.
				//       Ideally, we would update the board immediately and ask to animate the latest move.
				//       Or even simpler - pass in a piece color to animate moves for.
				await sleep(AUTO_MOVE_DURATION_MS);
				if (!game.playMove(ChessMove.pack(nextMove))) {
					alert = errorAlert('Failed to apply an opening move.');
					break;
				}
				autoMove = null;
				refreshGameView();
				node = nextNode;
			}
		} finally {
			autoMove = null;
			isAutoPlayingMove = false;
		}
	}

	function onUndo(): void {
		if (!canUndo) return;

		if (!game.undo()) return;
		refreshGameView();
		autoMove = null;
		updateOpeningCompletionAlert();
	}

	function onRedo(): void {
		if (!canRedo) return;
		if (!game.redo()) {
			alert = errorAlert('Failed to redo the recorded moves.');
			return;
		}
		refreshGameView();
		autoMove = null;
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
		const currentOpeningNode = game.currentOpeningNode;
		if (!currentOpening || !currentOpeningNode) return null;
		const nextMovesCount = countPGNNextMoveVariations(currentOpeningNode);
		if (nextMovesCount > 0) return null;
		return `Opening complete: ${currentOpening.name}.`;
	}
</script>

<svelte:head>
	<title>{title}</title>
</svelte:head>

<main class="flex grow flex-row items-stretch justify-between gap-4 overflow-hidden p-4">
	{#if view === 'board'}
		<div class="shrink-0">
			<FenInput
				class="w-96"
				value={currentFenStr}
				disabled={isAutoPlayingMove || !!currentOpening || canUndo}
				onChange={onFENChange}
			/>
		</div>

		<Board
			{board}
			{boardRotated}
			{onMove}
			{autoMove}
			class="min-w-0 flex-1"
			coordinates={isCoordsInside ? 'inside' : 'outside'}
		/>
	{:else if view === 'editor'}
		<Editor opening={openings[0]} onError={(error) => (alert = errorAlert(error))}>
			{#snippet controls()}
				<Button onClick={() => setView('board')}>Switch to Board</Button>
			{/snippet}
			{#if alert}
				<Alert variant={alert.type}>{alert.text}</Alert>
			{/if}
		</Editor>
	{/if}

	{#if view === 'board'}
		<div class="flex w-48 shrink-0 flex-col justify-center gap-2 self-start">
			<Button onClick={() => setView('editor')}>Switch to Editor</Button>
			<div>{board.turnColor === PieceColor.WHITE ? 'White' : 'Black'}'s turn</div>
			<Button onClick={() => (isCoordsInside = !isCoordsInside)}>Coordinates</Button>
			<Button onClick={() => (boardRotated = !boardRotated)}>Rotate</Button>
			<OpeningSelector {openings} disabled={isAutoPlayingMove} onSelected={onOpeningSelected} />
			<Button onClick={onRestart} disabled={!canRestart}>Restart</Button>
			<div class="grid grid-cols-2 gap-2">
				<Button onClick={onUndo} disabled={!canUndo}>Undo</Button>
				<Button onClick={onRedo} disabled={!canRedo}>Redo</Button>
			</div>
			<MoveHistory moves={gameView.moves} appliedMoveCount={gameView.appliedMoveCount} />
			{#if alert}
				<Alert variant={alert.type}>{alert.text}</Alert>
			{/if}
		</div>
	{/if}
</main>
