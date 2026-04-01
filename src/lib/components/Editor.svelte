<script lang="ts">
	import { PlayerColor } from '$lib/chess/board';
	import type { Move } from '$lib/chess/moves';
	import type { Opening, OpeningLine } from '$lib/chess/openings';
	import { KeyboardInput } from '$lib/input';
	import { Camera, Renderer2d } from '$lib/renderer';
	import { cn } from '$lib/utils';

	let canvas: HTMLCanvasElement | null = null;
	type Rect = { x: number; y: number; width: number; height: number };
	type Vector = { x: number; y: number };
	type OpeningTree = {
		opening: Opening;
		lines: OpeningLineNode[];
		movesByDepth: Array<Set<OpeningMoveNode>>;
	};
	type OpeningLineNode = {
		line: OpeningLine;
		name: string;
		moves: OpeningMoveNode[];
	};
	type OpeningMoveNode = {
		move: Move;
		halfMovesCount: number;
		nextMoves: OpeningMoveNode[];
	};

	interface Props {
		opening: Opening;
	}
	let { opening }: Props = $props();
	let grabbing = $state(false);
	let debug = false;

	const camera = new Camera();
	const input = new KeyboardInput();
	const mainFont = { size: 16, family: 'Arial' };
	const debugFont = { size: 14, family: 'Courier New' };
	let renderer: Renderer2d | null = null;
	let view = $state<'original' | 'tree'>('tree');
	let cameraSet = $state(false);
	let tree = $derived.by(() => buildTree(opening));
	let playerBgColor = $derived(tree.opening.color === PlayerColor.WHITE ? '#fff' : '#000');
	let playerTextColor = $derived(tree.opening.color === PlayerColor.WHITE ? '#000' : '#fff');
	let enemyBgColor = $derived(tree.opening.color === PlayerColor.WHITE ? '#000' : '#fff');
	let enemyTextColor = $derived(tree.opening.color === PlayerColor.WHITE ? '#fff' : '#000');

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
			cameraSet = true;
		}
		grabbing = input.isDown('MouseMiddle') || (input.isDown('Space') && input.isDown('MouseLeft'));
		if (grabbing) {
			const mouseDelta = input.getMouseDelta();
			camera.worldOffset.x += mouseDelta.x;
			camera.worldOffset.y += mouseDelta.y;
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
		if (input.isPressed('KeyV')) {
			view = view === 'original' ? 'tree' : 'original';
		}
		const r = renderer;
		if (!r) return;

		r.setFont(mainFont);
		r.fillScreen('#123838');
		r.beginCameraMode(camera);
		if (view === 'original') {
			drawOpeningOriginal(r);
		} else if (view === 'tree') {
			drawOpeningTree(r);
		}
		r.endCameraMode();

		if (debug) {
			drawDebug(r);
		}

		input.nextTick();
		window.requestAnimationFrame(tick);
	}

	function drawOpeningOriginal(r: Renderer2d) {
		const rect: Rect = { x: 0, y: 0, width: 200, height: 100 };
		r.drawRect(rect, '#fff');
		const text = opening.name;
		const metrics = r.measureText(text);
		const textPosition: Vector = {
			x: rect.x + rect.width / 2 - metrics.width / 2,
			y: rect.y + metrics.actualBoundingBoxAscent + 10
		};
		const pad = 10;
		r.drawText(text, textPosition, '#000');
		const linesCount = opening.lines.length;
		if (linesCount === 0) return;
		const lineSize = 50;
		const totalLineWidth = linesCount * lineSize + (linesCount - 1) * pad;
		for (const [lineIndex, line] of opening.lines.entries()) {
			const lineX = rect.x + rect.width / 2 - totalLineWidth / 2 + lineIndex * (lineSize + pad);
			const lineY = rect.y + rect.height + pad;
			r.drawRect({ x: lineX, y: lineY, width: lineSize, height: lineSize }, '#fff');
			const text = 'L' + (lineIndex + 1).toString();
			r.drawText(text, { x: lineX + 5, y: lineY + 20 }, '#000');
			const moveSize = lineSize;
			for (const [moveIndex, move] of line.moves.entries()) {
				const moveX = lineX;
				const moveY = lineY + (moveIndex + 1) * (moveSize + pad);
				r.drawRect({ x: moveX, y: moveY, width: moveSize, height: moveSize }, '#fff');
				r.drawText(move.algebraic, { x: moveX + 5, y: moveY + 20 }, '#000');
			}
		}
	}

	function drawOpeningTree(r: Renderer2d) {
		const rect: Rect = { x: 0, y: 0, width: 200, height: 100 };
		r.drawRect(rect, playerBgColor);
		const text = tree.opening.name;
		const metrics = r.measureText(text);
		const textPosition: Vector = {
			x: rect.x + rect.width / 2 - metrics.width / 2,
			y: rect.y + metrics.actualBoundingBoxAscent + 10
		};
		const pad = 10;
		r.drawText(text, textPosition, playerTextColor);
		const linesCount = tree.lines.length;
		if (linesCount === 0) return;
		const lineSize = 50;
		const totalLineWidth = linesCount * lineSize + (linesCount - 1) * pad;
		for (const [lineIndex, line] of tree.lines.entries()) {
			const lineX = rect.x + rect.width / 2 - totalLineWidth / 2 + lineIndex * (lineSize + pad);
			const lineY = rect.y + rect.height + pad;
			r.drawRect({ x: lineX, y: lineY, width: lineSize, height: lineSize }, playerBgColor);
			const text = 'L' + (lineIndex + 1).toString();
			r.drawText(text, { x: lineX + 5, y: lineY + 20 }, playerTextColor);
			drawMoveNodesGroup(r, line.moves, { x: lineX + lineSize / 2, y: lineY + lineSize + pad });
		}
	}

	function drawMoveNodesGroup(r: Renderer2d, moveNodes: OpeningMoveNode[], position: Vector) {
		const size = 50;
		const pad = 20;
		const totalWidth = moveNodes.length * size + (moveNodes.length - 1) * pad;
		const leftX = position.x - totalWidth / 2;
		for (const [moveIndex, moveNode] of moveNodes.entries()) {
			const moveBgColor = moveNode.move.turn === tree.opening.color ? playerBgColor : enemyBgColor;
			const moveTextColor =
				moveNode.move.turn === tree.opening.color ? playerTextColor : enemyTextColor;
			const moveX = leftX + moveIndex * (size + pad);
			r.drawRect({ x: moveX, y: position.y, width: size, height: size }, moveBgColor);
			// TODO: Position move text in the center.
			r.drawText(moveNode.move.algebraic, { x: moveX + 5, y: position.y + 20 }, moveTextColor);
			if (moveNode.nextMoves.length > 0) {
				// FIXME: Different subtress of moves overlap.
				drawMoveNodesGroup(r, moveNode.nextMoves, {
					x: moveX + size / 2,
					y: position.y + size + pad
				});
			}
		}
	}

	function drawDebug(r: Renderer2d) {
		const text = `Mouse: (${input.getMouseX()}, ${input.getMouseY()})`;
		r.setFont(debugFont);
		r.drawText(text, { x: 10, y: 20 }, '#00ff00');
		r.drawText(`View=${view}`, { x: 10, y: 40 }, '#00ff00');
		const worldMouseX = camera.toWorldX(input.getMouseX());
		const worldMouseY = camera.toWorldY(input.getMouseY());
		r.drawText(
			`World: (${worldMouseX.toFixed(2)}, ${worldMouseY.toFixed(2)})`,
			{ x: 10, y: 60 },
			'#00ff00'
		);
	}

	function buildTree(opening: Opening): OpeningTree {
		const tree: OpeningTree = { opening, lines: [], movesByDepth: [] };
		const moveNodeMap = new WeakMap<Move, OpeningMoveNode>();
		for (const line of opening.lines) {
			let name = line.name;
			const codeIndex = name.indexOf('[');
			if (codeIndex !== -1) {
				name = name.substring(0, codeIndex).trim();
			}

			let lineNode: OpeningLineNode = { line, name, moves: [] };
			const lineByName = tree.lines.find((l) => l.name === name);
			if (lineByName) {
				lineNode = lineByName;
			} else {
				tree.lines.push(lineNode);
			}

			for (const [moveIndex, move] of line.moves.entries()) {
				const existingMoveNode = findMoveNode(move, moveIndex);
				let moveNode: OpeningMoveNode = { move, halfMovesCount: moveIndex, nextMoves: [] };
				if (existingMoveNode) {
					moveNode = existingMoveNode;
					moveNodeMap.set(move, moveNode);
					continue;
				} else {
					moveNodeMap.set(move, moveNode);
					if (moveIndex === 0) {
						lineNode.moves.push(moveNode);
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
				if (moveNode.move.algebraic === move.algebraic) {
					// FIXME: If algebraic and depth are the same, that doesn't mean moves are equal - board can diff.
					return moveNode;
				}
			}
			return null;
		}
		return tree;
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
