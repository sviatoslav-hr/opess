<script lang="ts">
	import { cn } from '$lib/utils';
	import type { Snippet } from 'svelte';

	interface Props {
		type?: 'button' | 'submit' | 'reset';
		class?: string;
		disabled?: boolean;
		onClick?: (event: MouseEvent) => void;
		children: Snippet;
	}

	let { type = 'button', class: classInput, disabled = false, onClick, children }: Props = $props();
</script>

<button
	{type}
	{disabled}
	class={cn(
		'rounded border border-teal-500 bg-teal-900 px-3 py-2',
		disabled ? 'cursor-not-allowed opacity-50' : 'hover:cursor-pointer hover:bg-teal-800',
		classInput
	)}
	onclick={onClick}
>
	{@render children()}
</button>
