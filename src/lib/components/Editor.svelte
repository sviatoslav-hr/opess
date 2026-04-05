<script lang="ts">
	import { PlayerColor } from '$lib/chess/board';
	import { moveEquals, type Move } from '$lib/chess/moves';
	import type { Opening, OpeningLine } from '$lib/chess/openings';
	import { KeyboardInput } from '$lib/input';
	import { Camera, Renderer2d } from '$lib/renderer';
	import { cn } from '$lib/utils';

	let canvas: HTMLCanvasElement | null = null;
	type Rect = { x: number; y: number; width: number; height: number };
	type Vector = { x: number; y: number };
	// TODO: Merge box with node?
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
	};
	type OpeningTree = {
		opening: Opening;
		firstMoves: OpeningMoveNode[];
		movesByDepth: Array<Set<OpeningMoveNode>>;
		position: Vector;
		boxes: OpeningBox[];
	};
	type OpeningMoveNode = {
		move: Move;
		halfMovesCount: number;
		nextMoves: OpeningMoveNode[];
		prevMoves: OpeningMoveNode[];
	};

	interface Props {
		opening: Opening;
	}
	let { opening }: Props = $props();
	let grabbing = $state(false);
	let debug = false;
	const PADDING: Vector = { x: 2, y: 12 };
	const MOVE_SIZE = { width: 80, height: 40 };
	const COLOR_WHITE = '#f0f0f0'; //'#00bba7';
	const COLOR_BLACK = '#0f0f0f'; //'#022f2e';

	const camera = new Camera();
	const input = new KeyboardInput();
	const mainFont = { size: 16, family: 'Arial' };
	const debugFont = { size: 14, family: 'Courier New' };
	let renderer: Renderer2d | null = null;
	let cameraSet = $state(false);
	let tree = $derived.by(() => buildTree(opening));

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
		grabbing = input.isDown('Space');
		if (grabbing && input.isDown('MouseLeft')) {
			const mouseDelta = input.getMouseDelta();
			camera.worldOffset.x += mouseDelta.x;
			camera.worldOffset.y += mouseDelta.y;
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
		const r = renderer;
		if (!r) return;

		r.setFont(mainFont);
		r.fillScreen('#123838');
		r.beginCameraMode(camera);
		drawOpeningTree(r, tree);
		r.endCameraMode();

		if (debug) {
			drawDebug(r);
		}

		input.nextTick();
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

	function buildMoveBoxes(tree: OpeningTree, nodes: OpeningMoveNode[]): OpeningBox[] {
		const playerBgColor = tree.opening.color === PlayerColor.WHITE ? COLOR_WHITE : COLOR_BLACK;
		const playerTextColor = tree.opening.color === PlayerColor.WHITE ? COLOR_BLACK : COLOR_WHITE;
		const enemyBgColor = tree.opening.color === PlayerColor.WHITE ? COLOR_BLACK : COLOR_WHITE;
		const enemyTextColor = tree.opening.color === PlayerColor.WHITE ? COLOR_WHITE : COLOR_BLACK;
		const boxes: OpeningBox[] = [];
		for (const node of nodes) {
			const bgColor = node.move.turn === tree.opening.color ? playerBgColor : enemyBgColor;
			const fgColor = node.move.turn === tree.opening.color ? playerTextColor : enemyTextColor;
			const box: OpeningBox = {
				rect: { x: 0, y: 0, width: MOVE_SIZE.width, height: MOVE_SIZE.height },
				bounds: { x: 0, y: 0, width: MOVE_SIZE.width, height: MOVE_SIZE.height },
				anchor: { x: 0, y: 0 },
				text: node.move.algebraic,
				textPosition: { x: 0, y: 0 },
				subtreeWidth: 0,
				bgColor,
				fgColor
			};
			if (node.nextMoves.length) {
				const childBoxes = buildMoveBoxes(tree, node.nextMoves);
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
					y: box.rect.y + box.rect.height
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

	function drawOpeningTree(r: Renderer2d, tree: OpeningTree) {
		{
			const bgColor = tree.opening.color === PlayerColor.WHITE ? COLOR_WHITE : COLOR_BLACK;
			const textColor = tree.opening.color === PlayerColor.WHITE ? COLOR_BLACK : COLOR_WHITE;
			const textMetrics = r.measureText(tree.opening.name);
			const textPad = 10;
			const width = textMetrics.width + textPad * 2;
			const height = r.font.size + PADDING.y * 2;
			const treeRect: Rect = {
				x: tree.position.x - width / 2,
				y: tree.position.y - height,
				width: width,
				height: height
			};
			r.drawRect(treeRect, bgColor);
			r.drawText(
				tree.opening.name,
				{
					x: treeRect.x + textPad,
					y: treeRect.y + PADDING.y + textMetrics.actualBoundingBoxAscent
				},
				textColor
			);
		}
		drawBoxes(r, tree.boxes);
	}

	function drawBoxes(r: Renderer2d, boxes: OpeningBox[]) {
		for (const box of boxes) {
			r.drawRect(box.rect, box.bgColor);
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

	function buildTree(opening: Opening): OpeningTree {
		const tree: OpeningTree = {
			opening,
			firstMoves: [],
			movesByDepth: [],
			boxes: [],
			position: { x: 0, y: 0 }
		};
		const moveNodeMap = new WeakMap<Move, OpeningMoveNode>();
		for (const line of opening.lines) {
			let name = line.name;
			const codeIndex = name.indexOf('[');
			if (codeIndex !== -1) {
				name = name.substring(0, codeIndex).trim();
			}

			for (const [moveIndex, move] of line.moves.entries()) {
				const existingMoveNode = findMoveNode(move, moveIndex);
				let moveNode: OpeningMoveNode = {
					move,
					halfMovesCount: moveIndex,
					nextMoves: [],
					prevMoves: []
				};
				if (existingMoveNode) {
					moveNode = existingMoveNode;
					moveNodeMap.set(move, moveNode);
					if (moveIndex === 0) {
					} else {
						const prevMove = line.moves[moveIndex - 1];
						const prevMoveNode = moveNodeMap.get(prevMove);
						if (prevMoveNode) {
							moveNode.prevMoves.push(prevMoveNode);
						} else {
							console.error(
								`Previous move node not found or already linked for move=${move.algebraic} in line=${line.name} [index=${moveIndex}]`
							);
						}
					}
					continue;
				} else {
					moveNodeMap.set(move, moveNode);
					if (moveIndex === 0) {
						tree.firstMoves.push(moveNode);
						if (tree.movesByDepth[0] == null) {
							tree.movesByDepth[0] = new Set();
						}
						tree.movesByDepth[0].add(moveNode);
						continue;
					}
				}

				const prevMove = line.moves[moveIndex - 1];
				if (!prevMove) {
					throw new Error(
						`Previous move not found for move=${move.algebraic} in line=${line.name} [index=${moveIndex}]`
					);
				}
				const prevMoveNode = moveNodeMap.get(prevMove);
				if (!prevMoveNode) {
					throw new Error(
						`Previous move node not found for move=${move.algebraic} in line=${line.name} [index=${moveIndex}]`
					);
				}
				prevMoveNode.nextMoves.push(moveNode);
				if (tree.movesByDepth[moveIndex] == null) {
					tree.movesByDepth[moveIndex] = new Set();
				}
				tree.movesByDepth[moveIndex].add(moveNode);
			}
		}
		function findMoveNode(move: Move, depth: number): OpeningMoveNode | null {
			for (const moveNode of tree.movesByDepth[depth] ?? []) {
				if (moveEquals(moveNode.move, move)) return moveNode;
			}
			return null;
		}

		rebuildTreeBoxes(tree);
		return tree;
	}

	function rebuildTreeBoxes(tree: OpeningTree) {
		tree.boxes = buildMoveBoxes(tree, tree.firstMoves);
		measureBoxes(tree.boxes);
		placeBoxes(tree.boxes, tree.position);
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
/>

<div
	class={cn('fixed top-0 left-0 h-screen w-screen bg-[#121818]', {
		'cursor-grabbing': grabbing
	})}
>
	<canvas bind:this={canvas}></canvas>
</div>
