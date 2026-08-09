<script lang="ts">
	import { PieceId } from '$lib/chess/piece';
	import { base } from '$app/paths';
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
		return `${base}/piece_${pieceType}_${color}.svg`;
	});
	let name = $derived.by(() => PieceId.nameOf(id));
</script>

<div class={cn('flex h-20 w-20 items-center justify-center', classInput)}>
	<img draggable="false" src={pieceSrc} alt={name} class="h-16 w-16" />
</div>
