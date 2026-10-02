<script lang="ts">
	import { calculateMoveFromAlgebraic } from '$lib/chess/algebraic';
	import { PieceColor } from '$lib/chess/basic';
	import { ChessMove, chessMoveInfoEquals } from '$lib/chess/engine';
	import { createBoardFromOpeningNode, type Opening } from '$lib/chess/openings';
	import { getPGNNextMoveVariations, type PGNMoveNode } from '$lib/chess/pgn';
	import { PieceId } from '$lib/chess/piece';
	import { KeyboardInput } from '$lib/input';
	import { Camera, Renderer2d } from '$lib/renderer';
	import { cn } from '$lib/utils';

	let canvas: HTMLCanvasElement | null = null;
	type Rect = { x: number; y: number; width: number; height: number };
	type Vector = { x: number; y: number };
	type OpeningBox = {
		rect: Rect;
		bgColor: string;
		bounds: Rect;
		anchor: Vector;
		text: string;
		fgColor: string;
		textPosition: Vector;
		children?: OpeningBox[];
		subtreeWidth: number;
		highlighted: boolean;
		node: PGNMoveNode;
		expanded: boolean;
	};
	type Cursor = 'grabbing' | 'pointer';

	interface Props {
		opening: Opening;
		onError?: (message: string) => void;
	}
	let { opening, onError }: Props = $props();

	let cursor = $state<Cursor | null>(null);
	let debug = false;
	let interactingBox: OpeningBox | null = null;
	const PADDING: Vector = { x: 2, y: 12 };
	const PADDING_TEXT: Vector = { x: 10, y: 10 };
	const MOVE_SIZE = { width: 80, height: 40 };
	const COLOR_WHITE = '#f0f0f0'; //'#00bba7';
	const COLOR_BLACK = '#0f0f0f'; //'#022f2e';
	const COLOR_HIGHLIGHT = '#ff5050';

	const camera = new Camera();
	const input = new KeyboardInput();
	const mainFont = { size: 16, family: 'Arial' };
	const debugFont = { size: 14, family: 'Courier New' };
	let renderer: Renderer2d | null = null;
	let cameraSet = $state(false);
	const rootPosition: Vector = { x: 0, y: 0 };
	let allOpeningBoxes: OpeningBox[] = $derived(rebuildTreeBoxes());
	// TODO: Attaching to node references if not ideal, because we lose data on hot reload.
	let collapsedNodes = $state(new WeakMap<PGNMoveNode, boolean>());

	$effect(() => {
		handleResize();
		if (!canvas) {
			console.error('Canvas not found');
			return;
		}
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		renderer = new Renderer2d(ctx);
		window.requestAnimationFrame(tick);
	});

	function tick() {
		if (!cameraSet) {
			camera.worldOffset.x = -(window.innerWidth * window.devicePixelRatio) / 2 + 100;
			camera.worldOffset.y = -50;
			camera.scale = 1;
			cameraSet = true;
		}
		// NOTE: We want to turn cursor into grabbing as soon as user pressed the spacebar.
		let cursorUpdated: Cursor | null = null;
		if (input.isDown('Space')) {
			cursorUpdated = 'grabbing';
			if (input.isDown('MouseLeft')) {
				const mouseDelta = input.getMouseDelta();
				camera.worldOffset.x += mouseDelta.x / camera.scale;
				camera.worldOffset.y += mouseDelta.y / camera.scale;
			}
		}
		if (input.isPressed('Digit0')) {
			cameraSet = false;
		}
		if (input.isPressed('Backslash')) {
			debug = !debug;
		}
		if (input.isPressed('Minus')) {
			camera.scale *= 0.9;
		}
		if (input.isPressed('Equal')) {
			camera.scale *= 1.1;
		}
		if (input.isPressed('KeyP')) {
			// TODO: Rewrite into "Export opening", should be added to opening layer
			// exportTree(tree);
		}

		if (!cursorUpdated) {
			interactingBox = findInteractingBox(renderer!, allOpeningBoxes);
			if (interactingBox) {
				cursorUpdated = 'pointer';
				if (input.isPressed('MouseLeft')) {
					const msg = 'Enter move in algebraic notation (e.g. e4, Nf3, Bb5, etc.)';
					const moveAlgebraic = prompt(msg);
					if (moveAlgebraic) {
						insertMove(interactingBox.node, moveAlgebraic);
					}
				} else if (input.isPressed('MouseRight')) {
					collapsedNodes.set(interactingBox.node, !collapsedNodes.get(interactingBox.node));
					allOpeningBoxes = rebuildTreeBoxes();
				}
			}
		}

		const r = renderer;
		if (!r) return;

		r.setFont(mainFont);
		r.fillScreen('#123838');
		r.beginCameraMode(camera);
		drawOpeningTree(r);
		if (interactingBox) {
			drawHint(r, interactingBox);
		}
		r.endCameraMode();

		if (debug) {
			drawDebug(r);
		}

		input.nextTick();
		cursor = cursorUpdated;
		window.requestAnimationFrame(tick);
	}

	function drawDebug(r: Renderer2d) {
		const text = `Mouse: (${input.getMouseX()}, ${input.getMouseY()})`;
		r.setFont(debugFont);
		let y = 20;
		const x = 10;
		const pad = 20;
		r.drawText(text, { x, y: (y += pad) }, '#00ff00');
		r.drawText(`Zoom=${camera.scale}`, { x, y: (y += pad) }, '#00ff00');
		const worldMouseX = camera.toWorldX(input.getMouseX());
		const worldMouseY = camera.toWorldY(input.getMouseY());
		r.drawText(
			`World: (${worldMouseX.toFixed(2)}, ${worldMouseY.toFixed(2)})`,
			{ x, y: (y += pad) },
			'#00ff00'
		);
	}

	function buildMoveBoxes(...nodes: PGNMoveNode[]): OpeningBox[] {
		const playerBgColor = opening.color === PieceColor.WHITE ? COLOR_WHITE : COLOR_BLACK;
		const playerTextColor = opening.color === PieceColor.WHITE ? COLOR_BLACK : COLOR_WHITE;
		const enemyBgColor = opening.color === PieceColor.WHITE ? COLOR_BLACK : COLOR_WHITE;
		const enemyTextColor = opening.color === PieceColor.WHITE ? COLOR_WHITE : COLOR_BLACK;
		const boxes: OpeningBox[] = [];
		for (const node of nodes) {
			const moveColor = PieceId.colorOf(node.move.movedPiece);
			const bgColor = moveColor === opening.color ? playerBgColor : enemyBgColor;
			const fgColor = moveColor === opening.color ? playerTextColor : enemyTextColor;
			const box: OpeningBox = {
				rect: { x: 0, y: 0, width: MOVE_SIZE.width, height: MOVE_SIZE.height },
				bounds: { x: 0, y: 0, width: MOVE_SIZE.width, height: MOVE_SIZE.height },
				anchor: { x: 0, y: 0 },
				text: `${node.fullMoveNumber}. ${node.algebraic}`,
				textPosition: { x: 0, y: 0 },
				subtreeWidth: 0,
				bgColor,
				fgColor,
				node: node,
				highlighted: false,
				expanded: true,
			};
			let isCollapsed = collapsedNodes.get(node);
			if (node.next.length && !isCollapsed) {
				const childBoxes = buildMoveBoxes(...node.next);
				box.children = childBoxes;
			}
			boxes.push(box);
		}
		return boxes;
	}

	function measureBoxes(boxes: OpeningBox[]): number {
		if (boxes.length === 0) return 0;
		let totalWidth = 0;
		for (const box of boxes) {
			if (box.children) {
				const subtreeWidth = measureBoxes(box.children);
				box.subtreeWidth = Math.max(subtreeWidth, box.rect.width) + PADDING.x;
			} else {
				box.subtreeWidth = box.rect.width + PADDING.x;
			}
			totalWidth += box.subtreeWidth;
		}
		// NOTE: Nodes have padding in between and also outside
		totalWidth += PADDING.x;
		return totalWidth;
	}

	function placeBoxes(boxes: OpeningBox[], anchor: Vector) {
		let totalWidth = 0;
		for (const box of boxes) {
			totalWidth += box.subtreeWidth;
		}
		let currentX = anchor.x - totalWidth / 2;
		for (const box of boxes) {
			const xOffset = box.subtreeWidth / 2 - box.rect.width / 2;
			box.rect.x = currentX + xOffset;
			box.rect.y = anchor.y + PADDING.y;
			box.anchor = anchor;
			if (box.children?.length) {
				const childAnchor: Vector = {
					x: box.rect.x + box.rect.width / 2,
					y: box.rect.y + box.rect.height,
				};
				placeBoxes(box.children, childAnchor);
				box.bounds.x = box.rect.x + box.rect.width / 2 - box.subtreeWidth / 2; // - PADDING;
				box.bounds.y = box.rect.y - PADDING.y;
				box.bounds.width = box.subtreeWidth + PADDING.x * 2;
				box.bounds.height = box.rect.height + PADDING.y * 2;
			}
			currentX += box.subtreeWidth;
		}
	}

	function drawOpeningTree(r: Renderer2d) {
		{
			const bgColor = opening.color === PieceColor.WHITE ? COLOR_WHITE : COLOR_BLACK;
			const textColor = opening.color === PieceColor.WHITE ? COLOR_BLACK : COLOR_WHITE;
			const textMetrics = r.measureText(opening.name);
			const width = textMetrics.width + PADDING_TEXT.x * 2;
			const height = r.font.size + PADDING_TEXT.x * 2;
			const treeRect: Rect = {
				x: rootPosition.x - width / 2,
				y: rootPosition.y - height,
				width: width,
				height: height,
			};
			r.drawRect(treeRect, bgColor);
			r.drawText(
				opening.name,
				{
					x: treeRect.x + PADDING_TEXT.x,
					y: treeRect.y + PADDING.y + textMetrics.actualBoundingBoxAscent,
				},
				textColor
			);
		}
		drawBoxes(r, allOpeningBoxes);
	}

	function drawBoxes(r: Renderer2d, boxes: OpeningBox[]) {
		for (const box of boxes) {
			let bgColor = box.bgColor;
			if (box === interactingBox) {
				bgColor = COLOR_HIGHLIGHT;
			}
			r.drawRect(box.rect, bgColor);
			const metrics = r.measureText(box.text);
			const textX = box.rect.x + box.rect.width / 2 - metrics.width / 2;
			const textY = box.rect.y + box.rect.height / 2 + metrics.actualBoundingBoxAscent / 2;
			r.drawText(box.text, { x: textX, y: textY }, box.fgColor);
			r.drawLine(box.anchor, { x: box.rect.x + box.rect.width / 2, y: box.rect.y }, COLOR_WHITE);
			if (box.children) {
				drawBoxes(r, box.children);
			}
		}
	}

	function drawHint(r: Renderer2d, box: OpeningBox) {
		const hintText = box.node.moveComment;
		if (!hintText) return;
		const metrics = r.measureText(hintText);
		const hintRect: Rect = {
			x: box.rect.x + box.rect.width + PADDING_TEXT.x,
			y: box.rect.y,
			width: metrics.width + PADDING_TEXT.x * 2,
			height: metrics.actualBoundingBoxAscent + PADDING_TEXT.y * 2,
		};
		r.drawRect(hintRect, COLOR_BLACK);
		r.drawText(
			hintText,
			{
				x: hintRect.x + PADDING_TEXT.x,
				y: hintRect.y + hintRect.height / 2 + metrics.actualBoundingBoxAscent / 2,
			},
			COLOR_WHITE
		);
	}

	function findInteractingBox(r: Renderer2d, boxes: OpeningBox[]): OpeningBox | null {
		const mouse = camera.toWorld2(input.getMousePosition());
		for (const box of boxes) {
			if (vectorCollidesRect(mouse, box.rect)) {
				return box;
			}
			if (box.children) {
				const childBox = findInteractingBox(r, box.children);
				if (childBox) return childBox;
			}
		}
		return null;
	}

	function rebuildTreeBoxes() {
		const boxes = buildMoveBoxes(...opening.rootNodes);
		measureBoxes(boxes);
		placeBoxes(boxes, rootPosition);
		return boxes;
	}

	function vectorCollidesRect(v: Vector, rect: Rect): boolean {
		return (
			v.x >= rect.x && v.x <= rect.x + rect.width && v.y >= rect.y && v.y <= rect.y + rect.height
		);
	}

	function insertMove(parentNode: PGNMoveNode, moveAlgebraic: string): PGNMoveNode | null {
		const [board, boardError] = createBoardFromOpeningNode(opening, parentNode);
		if (boardError) {
			onError?.(`Failed to create board from opening node: ${boardError.message}`);
			return null;
		}
		const [move, moveError] = calculateMoveFromAlgebraic(board, moveAlgebraic);
		if (moveError) {
			onError?.(
				`Failed to calculate move from algebraic ${moveAlgebraic}: ${JSON.stringify(moveError)}`
			);
			return null;
		}
		const moveInfo = ChessMove.unpack(move);
		if (
			getPGNNextMoveVariations(parentNode).some((nextMove) =>
				chessMoveInfoEquals(nextMove, moveInfo)
			)
		) {
			onError?.(`Move ${moveAlgebraic} already exists as a continuation.`);
			return null;
		}
		const fullMoveNumber = board.fullMoveNumber;
		if (!board.applyMove(move)) {
			onError?.(`Failed to apply move ${moveAlgebraic}.`);
			return null;
		}
		const moveNode: PGNMoveNode = {
			move: moveInfo,
			algebraic: moveAlgebraic,
			fullMoveNumber,
			next: [],
			prev: parentNode,
		};
		parentNode.next.push(moveNode);
		allOpeningBoxes = rebuildTreeBoxes();
		return moveNode;
	}

	function handleResize() {
		if (!canvas) return;
		canvas.width = window.innerWidth;
		canvas.height = window.innerHeight;
	}
</script>

<svelte:window
	onresize={handleResize}
	onkeydown={input.handleKeyDown}
	onkeyup={input.handleKeyUp}
	onmousedown={input.handleMouseDown}
	onmouseup={input.handleMouseUp}
	onmousemove={input.handleMouseMove}
	onwheel={input.handleWheel}
	oncontextmenu={(e) => e.preventDefault()}
/>

<div
	class={cn('fixed top-0 left-0 h-screen w-screen bg-[#121818] ', {
		'cursor-grabbing': cursor === 'grabbing',
		'cursor-pointer': cursor === 'pointer',
	})}
>
	<canvas bind:this={canvas}></canvas>
</div>
