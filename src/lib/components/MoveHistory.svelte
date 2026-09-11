<script lang="ts">
	import { moveToAlgebraic } from '$lib/chess/algebraic';
	import type { ChessBoard } from '$lib/chess/engine';
	import { cn } from '$lib/utils';

	interface Props {
		board: ChessBoard;
		class?: string;
	}

	const { board, class: classInput }: Props = $props();
	interface HistoryRecord {
		moveNumber: number;
		whiteMove: string;
		blackMove: string | null;
	}

	let rows = $derived.by(() => {
		const historyRows: HistoryRecord[] = [];
		const moves = board.undoMoves.map((_move, index) => {
			const move = board.getHistoryMove(index);
			if (!move) throw new Error(`Unexpected null move at index ${index}`);
			return move;
		});
		// PERF: At some point reconstructing this might become too slow, could use some caching?
		const boardClone = board.clone();
		while (boardClone.undoMoves.length > 0) {
			boardClone.undoMove();
		}
		const startMoveNumber = boardClone.fullMoveNumber;

		for (let i = 0; i < moves.length; i += 2) {
			// NOTE: Currently we assume the first move will always be white, but that may
			//       not always be the case if FEN board was loaded from stated otherwise.
			const whiteMove = moves[i];
			if (!whiteMove) continue;
			const whiteAlgebraic = moveToAlgebraic(boardClone, whiteMove);
			let move = boardClone.makeMove(
				whiteMove.fromSquare,
				whiteMove.toSquare,
				whiteMove.promotion ?? undefined
			);
			if (!move) {
				console.error(`Failed to apply white move: ${whiteAlgebraic}`, { whiteMove });
				throw new Error(`Failed to apply white move: ${whiteAlgebraic}`);
			}
			const blackMove = moves[i + 1];
			let blackAlgebraic: string | null = null;
			if (blackMove) {
				blackAlgebraic = moveToAlgebraic(boardClone, blackMove);
				move = boardClone.makeMove(
					blackMove.fromSquare,
					blackMove.toSquare,
					blackMove.promotion ?? undefined
				);
				if (!move) {
					console.error(`Failed to apply black move: ${blackAlgebraic}`, { blackMove });
					throw new Error(`Failed to apply black move: ${blackAlgebraic}`);
				}
			}
			historyRows.push({
				moveNumber: startMoveNumber + Math.floor(i / 2),
				whiteMove: whiteAlgebraic,
				blackMove: blackAlgebraic,
			});
		}
		return historyRows;
	});
</script>

<div class={cn('rounded-md border border-teal-500 bg-teal-900/50 px-3 py-2', classInput)}>
	<div class="mb-2 text-sm font-semibold">Move History</div>
	{#if rows.length === 0}
		<div class="text-sm opacity-50">No moves yet.</div>
	{:else}
		<div class="flex max-h-60 flex-col gap-1 overflow-y-auto pr-1">
			{#each rows as row}
				<div class="grid grid-cols-[1.5rem_1fr_1fr] gap-2 text-sm">
					<div class="opacity-50">{row.moveNumber}.</div>
					<div class="font-mono">{row.whiteMove}</div>
					<div class="font-mono">{row.blackMove ?? ''}</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
