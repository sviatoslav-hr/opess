<script lang="ts">
	import type { Move } from '$lib/chess/moves';
	import { cn } from '$lib/utils';

	interface Props {
		moves: Move[];
		class?: string;
	}

	const { moves, class: classInput }: Props = $props();
	interface HistoryRecord {
		moveNumber: number;
		whiteMove: string;
		blackMove: string | null;
	}

	let rows = $derived.by(() => {
		const historyRows: HistoryRecord[] = [];
		for (let i = 0; i < moves.length; i += 2) {
			const whiteMove = moves[i];
			const blackMove = moves[i + 1];
			if (!whiteMove) continue;
			historyRows.push({
				moveNumber: Math.floor(i / 2) + 1,
				whiteMove: whiteMove.algebraic,
				blackMove: blackMove?.algebraic ?? null
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
