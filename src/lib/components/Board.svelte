<script lang="ts">
	import { FILE_CHARS, RANK_CHARS } from '$lib/chess/basic';
	import { ChessMove, ChessSquare, type ChessBoard } from '$lib/chess/engine';
	import { PieceId } from '$lib/chess/piece';
	import Piece from '$lib/components/Piece.svelte';
	import { isEven, isOdd } from '$lib/number';
	import { cn } from '$lib/utils';

	export interface AutoMove {
		from: ChessSquare;
		to: ChessSquare;
		piece: PieceId;
	}

	type Coordinates = 'inside' | 'outside';

	interface Props {
		class?: string;
		boardRotated?: boolean;
		board: ChessBoard;
		coordinates?: Coordinates;
		onMove: (move: ChessMove) => void | Promise<void>;
		autoMove?: AutoMove | null;
	}

	interface Vector2 {
		x: number;
		y: number;
	}

	const TILE_SIZE_PX = 80;

	let {
		class: classInput,
		boardRotated,
		board,
		coordinates = 'inside',
		onMove,
		autoMove = null,
	}: Props = $props();
	let lastMove = $derived.by(() => board.undoMoves.at(-1) ?? null);
	let dragSource: ChessSquare | null = $state(null);
	let dragTarget: ChessSquare | null = $state(null);
	let allowedMoves: ChessSquare[] | null = $derived.by(() => {
		if (!dragSource) return null;
		const legalMoves = board.legalMovesThisTurn.filter(
			(m) => ChessMove.fromSquareOf(m) === dragSource
		);
		return legalMoves.map((m) => ChessMove.toSquareOf(m));
	});
	const showDebugCoords = false;

	let dragImage: HTMLElement | null = null;

	function getDisplayCoords(position: ChessSquare): Vector2 {
		const fileIndex = ChessSquare.fileOf(position);
		const rankIndex = ChessSquare.rankOf(position);
		if (boardRotated) {
			return {
				x: FILE_CHARS.length - fileIndex - 1,
				y: rankIndex,
			};
		}
		return {
			x: fileIndex,
			y: RANK_CHARS.length - rankIndex - 1,
		};
	}

	function getAutoMoveOffset(from: ChessSquare, to: ChessSquare): Vector2 {
		const fromCoords = getDisplayCoords(from);
		const toCoords = getDisplayCoords(to);
		return {
			x: (toCoords.x - fromCoords.x) * TILE_SIZE_PX,
			y: (toCoords.y - fromCoords.y) * TILE_SIZE_PX,
		};
	}

	function handleDragStart(e: DragEvent, position: ChessSquare) {
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
	function handleTargetDraggedOver(event: DragEvent, position: ChessSquare) {
		event.preventDefault();
		dragTarget = position;
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'move';
		}
	}
	function handleDragDroppedOnTarget(event: DragEvent, targetPosition: ChessSquare) {
		event.preventDefault();
		if (dragSource === targetPosition) return;
		if (!dragSource) {
			console.warn('no drag source for position', targetPosition);
			return;
		}
		const move = board.findMove(dragSource, targetPosition);
		if (move == null) {
			// TODO: Report error to the user.
			const fromStr = ChessSquare.toString(dragSource);
			const toStr = ChessSquare.toString(targetPosition);
			console.error(`Invalid move: ${fromStr} -> ${toStr}`);
		} else {
			onMove(move);
		}
		dragSource = null;
		dragTarget = null;
	}
</script>

<!-- TODO: Make this scale up the screen size. -->

<div class={cn('flex justify-center', classInput)}>
	{#if coordinates === 'outside'}
		<div
			class={cn(
				'flex h-full w-9 items-center justify-around pt-9 text-base font-semibold text-teal-500',
				boardRotated ? 'flex-col' : 'flex-col-reverse'
			)}
		>
			{#each RANK_CHARS as rank}
				<div class="flex h-20 items-center justify-end">{rank}</div>
			{/each}
		</div>
	{/if}

	<div
		class={cn('flex', boardRotated ? 'flex-col' : 'flex-col-reverse', {
			'pt-9 pr-9': coordinates === 'outside',
		})}
	>
		{#each RANK_CHARS as rank, rowIndex}
			<div class={cn('flex bg-teal-900', { 'flex-row-reverse': boardRotated })}>
				{#each FILE_CHARS as fileChar, fileIndex}
					{@const position = ChessSquare.from(fileIndex, rowIndex)}
					{@const piece = board.getPiece(position)}
					{@const pieceColor = piece && PieceId.colorOf(piece)}
					{@const isDraggedOver = dragTarget === position && dragSource !== dragTarget}
					{@const isDraggedFrom = dragSource === position}
					{@const isValidMoveDest = dragSource && allowedMoves?.includes(position)}
					{@const isLastMoveSquare =
						lastMove?.fromSquare === position || lastMove?.toSquare === position || false}
					{@const isAutoMoveSource =
						autoMove && position === autoMove.from && piece === autoMove.piece}
					{@const autoMoveOffset = isAutoMoveSource
						? getAutoMoveOffset(autoMove.from, autoMove.to)
						: null}
					{@const autoMoveStyle = autoMoveOffset
						? `transform: translate(${autoMoveOffset.x}px, ${autoMoveOffset.y}px);`
						: undefined}
					{@const isWhiteSquare = isEven(rowIndex + 1)
						? isOdd(fileIndex + 1)
						: isEven(fileIndex + 1)}

					<div
						class={cn('relative flex h-20 w-20 items-center justify-center border-teal-500', {
							'bg-teal-500': isWhiteSquare,
							'border-t': rank === (boardRotated ? '1' : '8'),
							'border-b': rank === (boardRotated ? '8' : '1'),
							'border-r': fileChar === (boardRotated ? 'a' : 'h'),
							'border-l': fileChar === (boardRotated ? 'h' : 'a'),
						})}
						data-position={position}
						role="gridcell"
						tabindex="0"
						ondragover={(e) => handleTargetDraggedOver(e, position)}
						ondrop={(e) => handleDragDroppedOnTarget(e, position)}
						ondragenter={(e) => e.preventDefault()}
					>
						{#if (isLastMoveSquare && !autoMove) || isDraggedOver || isDraggedFrom || isValidMoveDest}
							<div
								class={cn(
									'pointer-events-none absolute top-1 left-1 h-[calc(100%-8px)] w-[calc(100%-8px)] border-4',
									{
										'border-sky-600/50': (isLastMoveSquare && !autoMove) || isDraggedFrom,
										'border-orange-600/50': isDraggedOver && !isValidMoveDest,
										'border-green-600/95': isDraggedOver && isValidMoveDest,
										'border-green-600/50': !isDraggedOver && isValidMoveDest,
									}
								)}
							></div>
						{/if}
						{#if showDebugCoords}
							<div class="absolute top-1 left-1 z-10">{fileChar}{rank}</div>
						{/if}
						{#if coordinates === 'inside' && fileChar === 'a'}
							<div
								class={cn('absolute top-0 left-1 z-10 text-base font-semibold', {
									'text-teal-900': isWhiteSquare,
									'text-teal-500': !isWhiteSquare,
								})}
							>
								{rank}
							</div>
						{/if}
						{#if coordinates === 'inside' && rank === '1'}
							<div
								class={cn('absolute right-1 bottom-0 z-10 text-base font-semibold', {
									'text-teal-900': isWhiteSquare,
									'text-teal-500': !isWhiteSquare,
								})}
							>
								{fileChar}
							</div>
						{/if}
						{#if piece}
							<div
								class={cn({
									'relative z-10': !isAutoMoveSource,
									'opacity-0': isDraggedFrom,
									'relative z-50 transition-transform duration-150 ease-linear': isAutoMoveSource,
								})}
								style={autoMoveStyle}
								role="button"
								tabindex="0"
								draggable={board.turnColor === pieceColor}
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

{#if coordinates === 'outside'}
	<div
		class={cn('flex h-9 items-center justify-center px-9 text-base font-semibold text-teal-500', {
			'flex-row-reverse': boardRotated,
		})}
	>
		{#each FILE_CHARS as col}
			<div class="w-20 text-center">{col}</div>
		{/each}
	</div>
{/if}
