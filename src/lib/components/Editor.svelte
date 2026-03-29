<script lang="ts">
	import type { Opening } from '$lib/chess/openings';
	import { KeyboardInput } from '$lib/input';
	import { Camera, Renderer2d } from '$lib/renderer';
	import { cn } from '$lib/utils';

	let canvas: HTMLCanvasElement | null = null;
	type Rect = { x: number; y: number; width: number; height: number };
	type Vector = { x: number; y: number };

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
		if (input.isDown('MouseMiddle')) {
			grabbing = true;
			const mouseDelta = input.getMouseDelta();
			camera.worldOffset.x += mouseDelta.x;
			camera.worldOffset.y += mouseDelta.y;
		} else {
			grabbing = false;
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
		r.fillScreen('#121818');
		r.beginCameraMode(camera);
		drawOpening(r);
		r.endCameraMode();

		if (debug) {
			drawDebug(r);
		}

		input.nextTick();
		window.requestAnimationFrame(tick);
	}

	function drawOpening(r: Renderer2d) {
		const rect: Rect = { x: 50, y: 50, width: 200, height: 100 };
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

	function drawDebug(r: Renderer2d) {
		const text = `Mouse: (${input.getMouseX()}, ${input.getMouseY()})`;
		r.setFont(debugFont);
		r.drawText(text, { x: 10, y: 20 }, '#00ff00');
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
