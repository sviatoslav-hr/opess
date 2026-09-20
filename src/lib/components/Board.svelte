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

	let tileSizePx = $state(0);
	let mousePosition = $state({ x: 0, y: 0 });

	let {
		class: classInput,
		boardRotated,
		board,
		coordinates = 'inside',
		onMove,
		autoMove = null,
	}: Props = $props();
	let lastMove = $derived.by(() => board.undoMoves.at(-1) ?? null);
	let dragSourceSquare: ChessSquare | null = $state(null);
	let dragTargetSquare: ChessSquare | null = $state(null);
	let allowedMoves: ChessSquare[] | null = $derived.by(() => {
		if (!dragSourceSquare) return null;
		const legalMoves = board.legalMovesThisTurn.filter(
			(m) => ChessMove.fromSquareOf(m) === dragSourceSquare
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
			x: (toCoords.x - fromCoords.x) * tileSizePx,
			y: (toCoords.y - fromCoords.y) * tileSizePx,
		};
	}

	function handleDragStart(e: DragEvent, square: ChessSquare) {
		const target = e.target;
		if (!(target instanceof HTMLElement)) return;
		dragSourceSquare = square;
		// NOTE: Sadly, we have to clone the dragged element so that we can make the original invisible.
		dragImage = target.cloneNode(true) as HTMLElement;
		dragImage.style.position = 'absolute';
		dragImage.style.top = '-1000px';
		dragImage.style.left = '-1000px';
		dragImage.style.width = `${tileSizePx}px`;
		dragImage.style.height = `${tileSizePx}px`;
		document.body.appendChild(dragImage);
		// TODO: Expain what this does and why.
		if (e.dataTransfer) {
			e.dataTransfer.setData('text/plain', '');
			e.dataTransfer.effectAllowed = 'move';
			const rect = target.getBoundingClientRect();
			const mouseOffsetX = mousePosition.x - rect.left;
			const mouseOffsetY = mousePosition.y - rect.top;
			e.dataTransfer.setDragImage(dragImage, mouseOffsetX, mouseOffsetY);
		}
	}
	function handleDragEnd() {
		if (dragImage) {
			document.body.removeChild(dragImage);
			dragImage = null;
		}
		dragSourceSquare = null;
		dragTargetSquare = null;
	}
	function handleTargetDraggedOver(event: DragEvent, position: ChessSquare) {
		event.preventDefault();
		dragTargetSquare = position;
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'move';
		}
	}
	function handleDragDroppedOnTarget(event: DragEvent, targetSquare: ChessSquare) {
		event.preventDefault();
		if (dragSourceSquare === targetSquare) return;
		if (!dragSourceSquare) {
			console.warn('no drag source for position', targetSquare);
			return;
		}
		const move = board.findMove(dragSourceSquare, targetSquare);
		if (move == null) {
			// TODO: Report error to the user.
			const fromStr = ChessSquare.toString(dragSourceSquare);
			const toStr = ChessSquare.toString(targetSquare);
			console.error(`Invalid move: ${fromStr} -> ${toStr}`);
		} else {
			onMove(move);
		}
		dragSourceSquare = null;
		dragTargetSquare = null;
	}
	function handlePointerMove(event: PointerEvent) {
		mousePosition = { x: event.clientX, y: event.clientY };
	}
</script>

<svelte:window on:pointermove={handlePointerMove} />

<div class={cn('@container-size relative flex items-center justify-center', classInput)}>
	<div
		class={cn(
			'@container-size relative flex size-[min(100cqw,100cqh)]',
			boardRotated ? 'flex-col' : 'flex-col-reverse',
			{
				'pb-9 pl-9': coordinates === 'outside',
			}
		)}
	>
		{#each RANK_CHARS as rank, rowIndex}
			<div
				class={cn('flex h-1/8 w-full bg-teal-900', { 'flex-row-reverse': boardRotated })}
				bind:clientHeight={tileSizePx}
			>
				{#each FILE_CHARS as fileChar, fileIndex}
					{@const position = ChessSquare.from(fileIndex, rowIndex)}
					{@const piece = board.getPiece(position)}
					{@const pieceColor = piece && PieceId.colorOf(piece)}
					{@const isDraggedOver =
						dragTargetSquare === position && dragSourceSquare !== dragTargetSquare}
					{@const isDraggedFrom = dragSourceSquare === position}
					{@const isValidMoveDest = dragSourceSquare && allowedMoves?.includes(position)}
					{@const isLastMoveSquare =
						lastMove?.fromSquare === position || lastMove?.toSquare === position || false}
					{@const isAutoMoveSource =
						autoMove && position === autoMove.from && piece === autoMove.piece}
					{@const autoMoveOffset = isAutoMoveSource
						? getAutoMoveOffset(autoMove.from, autoMove.to)
						: null}
					{@const pieceStyle = autoMoveOffset
						? `transform: translate(${autoMoveOffset.x}px, ${autoMoveOffset.y}px);`
						: undefined}
					{@const isWhiteSquare = isEven(rowIndex + 1)
						? isOdd(fileIndex + 1)
						: isEven(fileIndex + 1)}

					<div
						class={cn('relative flex h-full w-1/8 items-center justify-center border-teal-500', {
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
						{#if coordinates === 'inside' && ((!boardRotated && fileChar === 'a') || (boardRotated && fileChar === 'h'))}
							<div
								class={cn('absolute top-0 left-1 z-10 text-[2.5cqh] font-semibold', {
									'text-teal-900': isWhiteSquare,
									'text-teal-500': !isWhiteSquare,
								})}
							>
								{rank}
							</div>
						{/if}
						{#if coordinates === 'inside' && ((!boardRotated && rank === '1') || (boardRotated && rank === '8'))}
							<div
								class={cn('absolute right-1 bottom-0 z-10 text-base text-[2.5cqh] font-semibold', {
									'text-teal-900': isWhiteSquare,
									'text-teal-500': !isWhiteSquare,
								})}
							>
								{fileChar}
							</div>
						{/if}
						{#if piece}
							<div
								class={cn('h-full w-full ', {
									'relative z-10': !isAutoMoveSource,
									'opacity-0': isDraggedFrom,
									'relative z-50 transition-transform duration-150 ease-linear': isAutoMoveSource,
								})}
								style={pieceStyle}
								role="button"
								tabindex="0"
								draggable={board.turnColor === pieceColor}
								ondragstart={(e) => handleDragStart(e, position)}
								ondragend={handleDragEnd}
							>
								<Piece id={piece} class="h-full w-full cursor-pointer" />
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/each}

		{#if coordinates === 'outside'}
			<div
				class={cn(
					'absolute top-0 left-0 flex h-[100cqh] w-9 items-center justify-around text-[2.5cqh] font-semibold text-teal-500',
					boardRotated ? 'flex-col' : 'flex-col-reverse'
				)}
			>
				{#each RANK_CHARS as rank}
					<div class="flex h-1/8 items-center justify-end">{rank}</div>
				{/each}
			</div>
			<div
				class={cn(
					'absolute right-0 bottom-0 flex h-9 w-[100cqh] items-center justify-center text-base text-[2.5cqh] font-semibold text-teal-500',
					{ 'flex-row-reverse': boardRotated }
				)}
			>
				{#each FILE_CHARS as col}
					<div class="w-1/8 text-center">{col}</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
