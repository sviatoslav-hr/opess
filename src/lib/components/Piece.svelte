<script lang="ts">
	import { PieceId } from '$lib/chess/piece';
	import { asset } from '$app/paths';
	import { cn } from '$lib/utils';
	import { pieceIdToFen } from '$lib/chess/fen';

	interface Props {
		class?: string;
		id: PieceId;
	}

	let { class: classInput, id }: Props = $props();
	let pieceSrc = $derived.by(() => {
		const color = PieceId.isWhite(id) ? 'white' : 'black';
		const pieceType = pieceIdToFen(id).toLowerCase();
		return asset(`/piece_${pieceType}_${color}.svg`);
	});
	let name = $derived.by(() => PieceId.nameOf(id));
</script>

<div class={cn('flex aspect-square items-center justify-center', classInput)}>
	<img draggable="false" src={pieceSrc} alt={name} class="h-4/5 w-4/5" />
</div>
