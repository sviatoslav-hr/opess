<script lang="ts">
	import {
		BOARD_FILES,
		BOARD_RANKS,
		Position,
		type BoardInfo,
		type PositionStr
	} from '$lib/chess/board';
	import { calculateMove, type Move } from '$lib/chess/moves';
	import { PieceId } from '$lib/chess/piece';
	import Piece from '$lib/components/Piece.svelte';
	import { isEven, isOdd } from '$lib/number';
	import { cn } from '$lib/utils';

	interface Props {
		class?: string;
		boardRotated?: boolean;
		boardInfo: BoardInfo;
		onMove: (move: Move) => void;
	}

	let { class: classInput, boardRotated, boardInfo, onMove }: Props = $props();
	let boardPieces = $derived.by(() => boardInfo.pieces);
	let dragSource: PositionStr | null = $state(null);
	let dragTarget: PositionStr | null = $state(null);
	let allowedMoves: PositionStr[] | null = $derived.by(() => {
		if (!dragSource) return null;
		return boardInfo.allowedMoves.get(dragSource)?.map((m) => m.toString()) ?? null;
	});
	const showDebugCoords = false;

	function handleDragStart(e: DragEvent, position: PositionStr) {
		dragSource = position;
		if (e.dataTransfer) {
			e.dataTransfer.setData('text/plain', '');
			e.dataTransfer.effectAllowed = 'move';
		}
	}
	function handleDragEnd() {
		dragSource = null;
		dragTarget = null;
	}
	function handleTargetDraggedOver(event: DragEvent, position: PositionStr) {
		event.preventDefault();
		dragTarget = position;
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'move';
		}
	}
	function handleDragDroppedOnTarget(event: DragEvent, targetPosition: PositionStr) {
		event.preventDefault();
		if (dragSource === targetPosition) return;
		if (!dragSource) {
			console.warn('no drag source for position', targetPosition);
			return;
		}
		const from = Position.fromStr(dragSource);
		const to = Position.fromStr(targetPosition);
		const [move, moveError] = calculateMove(boardInfo, from, to);
		if (move) {
			onMove(move);
		} else {
			// TODO: Report error to the user.
			console.error('Invalid move:', moveError.type, moveError);
		}
		dragSource = null;
		dragTarget = null;
	}
</script>

<!-- TODO: Make this scale up the screen size. -->

<div class={cn('flex justify-center', classInput)}>
	<div class={cn('flex h-full w-9 justify-around', boardRotated ? 'flex-col' : 'flex-col-reverse')}>
		{#each BOARD_RANKS as rank}
			<div class="flex h-20 items-center justify-end pr-4 text-center">{rank}</div>
		{/each}
	</div>

	<div class={cn('flex pr-9', boardRotated ? 'flex-col' : 'flex-col-reverse')}>
		{#each BOARD_RANKS as rank, rowIndex}
			<div class={cn('flex bg-teal-900', { 'flex-row-reverse': boardRotated })}>
				{#each BOARD_FILES as col, colIndex}
					{@const position: PositionStr = `${col}${rank}`}
					{@const piece = boardPieces.get(position)}
					{@const pieceColor = piece && PieceId.getColor(piece)}
					{@const isDraggedOver = dragTarget === position && dragSource !== dragTarget}
					{@const isDraggedFrom = dragSource === position && dragSource !== dragTarget}
					{@const isValidMoveDest =
						dragSource && !isDraggedOver && allowedMoves?.includes(position)}
					<div
						class={cn('relative flex h-20 w-20 items-center justify-center border-teal-500', {
							'bg-teal-500': isEven(rowIndex + 1) ? isOdd(colIndex + 1) : isEven(colIndex + 1),
							'border-t': rank === (boardRotated ? '1' : '8'),
							'border-b': rank === (boardRotated ? '8' : '1'),
							'border-r': col === (boardRotated ? 'a' : 'h'),
							'border-l': col === (boardRotated ? 'h' : 'a'),
							'z-69 rounded-sm outline-4 outline-red-600': isDraggedOver,
							'z-69 rounded-sm outline-4 outline-green-600': isValidMoveDest
						})}
						data-position={position}
						role="gridcell"
						tabindex="0"
						ondragover={(e) => handleTargetDraggedOver(e, position)}
						ondrop={(e) => handleDragDroppedOnTarget(e, position)}
						ondragenter={(e) => e.preventDefault()}
					>
						{#if showDebugCoords}
							<div class="absolute top-1 left-1">{col}{rank}</div>
						{/if}
						{#if piece}
							<div
								class={cn({ 'z-42 rounded-xs outline-2 outline-indigo-500': isDraggedFrom })}
								role="button"
								tabindex="0"
								draggable={boardInfo.turnColor === pieceColor}
								ondragstart={(e) => handleDragStart(e, position)}
								ondragend={handleDragEnd}
							>
								<Piece id={piece} />
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/each}
	</div>
</div>

<div class={cn('flex justify-center px-9', { 'flex-row-reverse': boardRotated })}>
	{#each BOARD_FILES as col}
		<div class="w-20 pt-2 text-center">{col}</div>
	{/each}
</div>
