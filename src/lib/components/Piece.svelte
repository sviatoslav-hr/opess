<script lang="ts">
	import { PieceId } from '$lib/chess/piece';
	import { base } from '$app/paths';
	import { cn } from '$lib/utils';

	interface Props {
		class?: string;
		id: PieceId;
	}

	let { class: classInput, id }: Props = $props();
	let pieceSrc = $derived.by(() => {
		const color = PieceId.isWhite(id) ? 'white' : 'black';
		const pieceType = id.toLowerCase();
		return `${base}/piece_${pieceType}_${color}.svg`;
	});
</script>

<div class={cn('flex h-20 w-20 items-center justify-center', classInput)}>
	<img draggable="false" src={pieceSrc} alt={id} class="h-16 w-16" />
</div>
