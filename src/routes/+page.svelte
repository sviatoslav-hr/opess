<script lang="ts">
	import { browser } from '$app/environment';
	import { PlayerColor, type BoardInfo } from '$lib/chess/board';
	import { boardToFen, INITIAL_FEN, parseFen } from '$lib/chess/fen';
	import { applyMove, type Move } from '$lib/chess/moves';
	import {
		getExpectedOpeningMoves,
		getOpeningLineIndexes,
		getOpenings,
		validateOpeningMove,
		type Opening
	} from '$lib/chess/openings';
	import Board, { type AutoMove } from '$lib/components/Board.svelte';
	import Button from '$lib/components/Button.svelte';
	import FenInput from '$lib/components/FenInput.svelte';
	import OpeningSelector from '$lib/components/OpeningSelector.svelte';
	import { sleep } from '$lib/utils';

	const AUTO_MOVE_DURATION_MS = 160;

	let boardRotated = $state(false);
	let currentFenStr = $state(INITIAL_FEN);
	let boardInfo = $state(parseFen(INITIAL_FEN));
	let openings = $state(getOpenings());
	let currentOpening: Opening | null = $state(null);
	let openingLineIndexes: number[] = $state([]);
	let openingError: string | null = $state(null);
	let openingSuccess: string | null = $state(null);
	let autoMove = $state<AutoMove | null>(null);
	let title = $state('Opess');
	if (browser) {
		if (location?.href.includes('localhost')) {
			title = 'Opess (dev)';
		}
		console.log('openings', openings);
	}

	function onFenChange(fenStr: string) {
		if (currentFenStr === fenStr) return;
		currentFenStr = fenStr;
		boardInfo = parseFen(fenStr);
		openingError = null;
		openingSuccess = null;
		if (currentOpening) {
			openingLineIndexes = getOpeningLineIndexes(currentOpening);
		}
	}

	async function onMove(move: Move) {
		if (currentOpening) {
			if (move.turn !== currentOpening.color) {
				openingError = `You are playing ${currentOpening.color} in ${currentOpening.name}.`;
				openingSuccess = null;
				return;
			}

			const validation = validateOpeningMove(
				currentOpening,
				move,
				boardInfo.moves.length,
				openingLineIndexes
			);
			if (!validation.valid) {
				openingError = validation.errorMessage ?? 'Move does not match the selected opening.';
				openingSuccess = null;
				return;
			}
			const boardAfterUserMove = applyMove(boardInfo, move);
			boardInfo = boardAfterUserMove;
			currentFenStr = boardToFen(boardAfterUserMove);
			const autoPlayed = await autoPlayOppositeOpeningMoves(
				currentOpening,
				boardAfterUserMove,
				validation.matchedLineIndexes
			);
			boardInfo = autoPlayed.board;
			openingLineIndexes = autoPlayed.lineIndexes;
			openingError = null;
			openingSuccess = getOpeningSuccessMessage(currentOpening, boardInfo, openingLineIndexes);
			currentFenStr = boardToFen(boardInfo);
			return;
		}

		boardInfo = applyMove(boardInfo, move);
		const newFenStr = boardToFen(boardInfo);
		currentFenStr = newFenStr;
	}

	async function onOpeningSelected(opening: Opening) {
		currentOpening = opening;
		const board = parseFen(opening.fen ?? INITIAL_FEN);
		const initialLineIndexes = getOpeningLineIndexes(opening);
		boardInfo = board;
		currentFenStr = boardToFen(board);
		const autoPlayed = await autoPlayOppositeOpeningMoves(opening, board, initialLineIndexes);
		boardInfo = autoPlayed.board;
		currentFenStr = boardToFen(boardInfo);
		openingLineIndexes = autoPlayed.lineIndexes;
		openingError = null;
		openingSuccess = getOpeningSuccessMessage(opening, boardInfo, openingLineIndexes);
	}

	async function autoPlayOppositeOpeningMoves(
		opening: Opening,
		board: BoardInfo,
		lineIndexes: number[]
	): Promise<{ board: BoardInfo; lineIndexes: number[] }> {
		let nextBoard = board;
		let nextLineIndexes = lineIndexes;

		while (nextBoard.turnColor !== opening.color) {
			const expectedMoves = getExpectedOpeningMoves(
				opening,
				nextBoard.moves.length,
				nextLineIndexes
			);
			if (expectedMoves.length === 0) break;

			const expected = expectedMoves[Math.floor(Math.random() * expectedMoves.length)];
			const validation = validateOpeningMove(
				opening,
				expected.move,
				nextBoard.moves.length,
				nextLineIndexes
			);
			if (!validation.valid) break;

			autoMove = {
				from: expected.move.from,
				to: expected.move.to,
				piece: expected.move.piece
			};
			await sleep(AUTO_MOVE_DURATION_MS);
			nextBoard = applyMove(nextBoard, expected.move);
			boardInfo = nextBoard;
			currentFenStr = boardToFen(nextBoard);
			autoMove = null;
			nextLineIndexes = validation.matchedLineIndexes;
		}

		return { board: nextBoard, lineIndexes: nextLineIndexes };
	}

	function getOpeningSuccessMessage(
		opening: Opening,
		board: BoardInfo,
		lineIndexes: number[]
	): string | null {
		const expectedMoves = getExpectedOpeningMoves(opening, board.moves.length, lineIndexes);
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

<main class="flex grow flex-col items-start justify-center lg:items-center">
	<div class="fixed not-lg:right-4 not-lg:bottom-4 lg:top-4 lg:left-4">
		<FenInput class="w-96" value={currentFenStr} onChange={onFenChange} />
	</div>

	<Board {boardInfo} {boardRotated} {onMove} {autoMove} />

	<div class="fixed top-4 right-4 flex flex-col justify-center gap-2">
		<Button onClick={() => (boardRotated = !boardRotated)}>Rotate</Button>
		<div>{boardInfo.turnColor === PlayerColor.WHITE ? 'White' : 'Black'}'s turn</div>
		<OpeningSelector {openings} onSelected={onOpeningSelected} />
		{#if openingError}
			<div
				class="max-w-80 rounded-md border border-red-700 bg-red-950/40 px-3 py-2 text-sm text-red-100"
			>
				{openingError}
			</div>
		{:else if openingSuccess}
			<div
				class="max-w-80 rounded-md border border-emerald-700 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-100"
			>
				{openingSuccess}
			</div>
		{/if}
	</div>
</main>
