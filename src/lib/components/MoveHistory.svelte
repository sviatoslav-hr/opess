<script lang="ts">
	import { PieceColor } from '$lib/chess/basic';
	import type { ChessMoveDisplay } from '$lib/chess/game';
	import { cn } from '$lib/utils';

	interface Props {
		moves: readonly ChessMoveDisplay[];
		appliedMoveCount: number;
		class?: string;
	}

	const { moves, appliedMoveCount, class: classInput }: Props = $props();
	interface HistoryMove {
		algebraic: string;
		index: number;
	}
	interface HistoryRecord {
		moveNumber: number;
		whiteMove: HistoryMove | null;
		blackMove: HistoryMove | null;
	}

	let rows = $derived.by(() => {
		const historyRows: HistoryRecord[] = [];
		for (const [index, move] of moves.entries()) {
			let row = historyRows.at(-1);
			if (!row || row.moveNumber !== move.moveNumber) {
				row = { moveNumber: move.moveNumber, whiteMove: null, blackMove: null };
				historyRows.push(row);
			}
			const historyMove = { algebraic: move.algebraic, index };
			if (move.color === PieceColor.WHITE) row.whiteMove = historyMove;
			else row.blackMove = historyMove;
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
					<div
						class={cn('font-mono', {
							'opacity-40': row.whiteMove && row.whiteMove.index >= appliedMoveCount,
						})}
						title={row.whiteMove && row.whiteMove.index >= appliedMoveCount
							? 'Undone move'
							: undefined}
					>
						{row.whiteMove?.algebraic ?? ''}
					</div>
					<div
						class={cn('font-mono', {
							'opacity-40': row.blackMove && row.blackMove.index >= appliedMoveCount,
						})}
						title={row.blackMove && row.blackMove.index >= appliedMoveCount
							? 'Undone move'
							: undefined}
					>
						{row.blackMove?.algebraic ?? ''}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
