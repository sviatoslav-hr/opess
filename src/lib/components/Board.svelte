<script lang="ts">
	import {
		BOARD_FILES,
		BOARD_RANKS,
		Position,
		type BoardInfo,
		type PositionStr
	} from '$lib/chess/board';
	import { calculateMove, getLegalMovesFrom, type Move } from '$lib/chess/moves';
	import { PieceId } from '$lib/chess/piece';
	import Piece from '$lib/components/Piece.svelte';
	import { isEven, isOdd } from '$lib/number';
	import { cn } from '$lib/utils';

	export interface AutoMove {
		from: Position;
		to: Position;
		piece: PieceId;
	}

	interface Props {
		class?: string;
		boardRotated?: boolean;
		boardInfo: BoardInfo;
		onMove: (move: Move) => void | Promise<void>;
		autoMove?: AutoMove | null;
	}

	interface Vector2 {
		x: number;
		y: number;
	}

	const TILE_SIZE_PX = 80;

	let { class: classInput, boardRotated, boardInfo, onMove, autoMove = null }: Props = $props();
	let boardPieces = $derived.by(() => boardInfo.pieces);
	let lastMove = $derived.by(() => boardInfo.moves.at(-1) ?? null);
	let dragSource: PositionStr | null = $state(null);
	let dragTarget: PositionStr | null = $state(null);
	let allowedMoves: PositionStr[] | null = $derived.by(() => {
		if (!dragSource) return null;
		const legalMoves = getLegalMovesFrom(boardInfo, Position.fromStr(dragSource));
		return legalMoves.map((m) => m.toString());
	});
	const showDebugCoords = false;

	let dragImage: HTMLElement | null = null;

	function getDisplayCoords(position: Position): Vector2 {
		const fileIndex = BOARD_FILES.indexOf(position.file);
		const rankIndex = BOARD_RANKS.indexOf(position.rank);
		if (boardRotated) {
			return {
				x: BOARD_FILES.length - fileIndex - 1,
				y: rankIndex
			};
		}
		return {
			x: fileIndex,
			y: BOARD_RANKS.length - rankIndex - 1
		};
	}

	function getAutoMoveOffset(from: Position, to: Position): Vector2 {
		const fromCoords = getDisplayCoords(from);
		const toCoords = getDisplayCoords(to);
		return {
			x: (toCoords.x - fromCoords.x) * TILE_SIZE_PX,
			y: (toCoords.y - fromCoords.y) * TILE_SIZE_PX
		};
	}

	function handleDragStart(e: DragEvent, position: PositionStr) {
		const target = e.target;
		if (!(target instanceof HTMLElement)) return;
		dragSource = position;
		// NOTE: Sadly, we have to clone the dragged element so that we can make the original invisible.
		dragImage = target.cloneNode(true) as HTMLElement;
		dragImage.style.position = 'absolute';
		dragImage.style.top = '-1000px';
		dragImage.style.left = '-1000px';
		dragImage.style.width = '80px';
		dragImage.style.height = '80px';
		document.body.appendChild(dragImage);
		if (e.dataTransfer) {
			e.dataTransfer.setData('text/plain', '');
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setDragImage(dragImage, 40, 40);
		}
	}
	function handleDragEnd() {
		if (dragImage) {
			document.body.removeChild(dragImage);
			dragImage = null;
		}
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
					{@const isDraggedFrom = dragSource === position}
					{@const isValidMoveDest =
						dragSource && !isDraggedOver && allowedMoves?.includes(position)}
					{@const isLastMoveSquare =
						lastMove?.from.equals(position) || lastMove?.to.equals(position) || false}
					{@const isAutoMoveSource =
						autoMove && position === autoMove.from.toString() && piece === autoMove.piece}
					{@const autoMoveOffset = isAutoMoveSource
						? getAutoMoveOffset(autoMove.from, autoMove.to)
						: null}
					{@const autoMoveStyle = autoMoveOffset
						? `transform: translate(${autoMoveOffset.x}px, ${autoMoveOffset.y}px);`
						: undefined}
					{@const isWhiteSquare = isEven(rowIndex + 1) ? isOdd(colIndex + 1) : isEven(colIndex + 1)}
					<div
						class={cn('relative flex h-20 w-20 items-center justify-center border-teal-500', {
							'bg-teal-500': isWhiteSquare,
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
						{#if isLastMoveSquare && !autoMove}
							<div
								class="pointer-events-none absolute top-[4px] left-[4px] h-[calc(100%-8px)] w-[calc(100%-8px)] border-4 border-sky-600/50"
							></div>
						{/if}
						{#if showDebugCoords}
							<div class="absolute top-1 left-1 z-10">{col}{rank}</div>
						{/if}
						{#if piece}
							<div
								class={cn({
									'relative z-10': !isAutoMoveSource,
									'opacity-0': isDraggedFrom,
									'relative z-50 transition-transform duration-150 ease-linear': isAutoMoveSource
								})}
								style={autoMoveStyle}
								role="button"
								tabindex="0"
								draggable={boardInfo.turnColor === pieceColor}
								ondragstart={(e) => handleDragStart(e, position)}
								ondragend={handleDragEnd}
							>
								<Piece id={piece} class="cursor-pointer" />
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
