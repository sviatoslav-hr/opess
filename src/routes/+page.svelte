<script lang="ts">
	import { browser } from '$app/environment';
	import { PlayerColor } from '$lib/chess/board';
	import { boardToFen, INITIAL_FEN, parseFen } from '$lib/chess/fen';
	import { applyMove, type Move } from '$lib/chess/moves';
	import { getOpenings, type Opening } from '$lib/chess/openings';
	import Board from '$lib/components/Board.svelte';
	import Button from '$lib/components/Button.svelte';
	import FenInput from '$lib/components/FenInput.svelte';
	import OpeningSelector from '$lib/components/OpeningSelector.svelte';

	let boardRotated = $state(false);
	let currentFenStr = $state(INITIAL_FEN);
	let boardInfo = $state(parseFen(INITIAL_FEN));
	let openings = $state(getOpenings());
	let currentOpening: Opening | null = $state(null);
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
	}

	function onMove(move: Move) {
		boardInfo = applyMove(boardInfo, move);
		const newFenStr = boardToFen(boardInfo);
		currentFenStr = newFenStr;
	}

	function onOpeningSelected(opening: Opening) {
		currentOpening = opening;
		boardInfo = parseFen(opening.fen ?? INITIAL_FEN);
	}
</script>

<svelte:head>
	<title>{title}</title>
</svelte:head>

<main class="flex grow flex-col items-start justify-center lg:items-center">
	<div class="fixed not-lg:right-4 not-lg:bottom-4 lg:top-4 lg:left-4">
		<FenInput class="w-96" value={currentFenStr} onChange={onFenChange} />
	</div>

	<Board {boardInfo} {boardRotated} {onMove} />

	<div class="fixed top-4 right-4 flex flex-col justify-center gap-2">
		<Button onClick={() => (boardRotated = !boardRotated)}>Rotate</Button>
		<div>{boardInfo.turnColor === PlayerColor.WHITE ? 'White' : 'Black'}'s turn</div>
		<OpeningSelector {openings} onSelected={onOpeningSelected} />
	</div>
</main>
