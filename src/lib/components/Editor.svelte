<script lang="ts">
	let canvas: HTMLCanvasElement;
	$effect(() => {
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		const HEIGHT = canvas.height;
		const WIDTH = canvas.width;

		ctx.fillStyle = '#181818';
		ctx.fillRect(0, 0, WIDTH, HEIGHT);
	});
</script>

<div>
	<canvas bind:this={canvas} width="800" height="600"></canvas>
</div>
