<script lang="ts">
	import { PlayerColor } from '$lib/chess/board';
	import { boardToFen, INITIAL_FEN, parseFen } from '$lib/chess/fen';
	import { applyMove, type Move } from '$lib/chess/moves';
	import { fullTestPgn, londonSystemPgn } from '$lib/chess/openings';
	import { parsePGNMoves } from '$lib/chess/pgn';
	import Board from '$lib/components/Board.svelte';
	import Button from '$lib/components/Button.svelte';
	import FenInput from '$lib/components/FenInput.svelte';

	let boardRotated = $state(false);
	let currentFenStr = $state(INITIAL_FEN);
	let boardInfo = $state(parseFen(INITIAL_FEN));

	try {
		const moves = parsePGNMoves(fullTestPgn);
		console.log('moves', moves);
	} catch (err) {
		console.error('failed to parse pgn', err);
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
</script>

<main class="flex grow flex-col items-start justify-center lg:items-center">
	<div class="fixed not-lg:right-4 not-lg:bottom-4 lg:top-4 lg:left-4">
		<FenInput class="w-96" value={currentFenStr} onChange={onFenChange} />
	</div>

	<Board {boardInfo} {boardRotated} {onMove} />

	<div class="fixed top-4 right-4 flex flex-col justify-center gap-2">
		<Button onClick={() => (boardRotated = !boardRotated)}>Rotate</Button>
		<div>{boardInfo.turnColor === PlayerColor.WHITE ? 'White' : 'Black'}'s turn</div>
	</div>
</main>
