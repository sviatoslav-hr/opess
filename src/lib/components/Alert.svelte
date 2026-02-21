<script lang="ts">
	import { cn } from '$lib/utils';
	import { cva } from 'class-variance-authority';
	import type { Snippet } from 'svelte';

	export type AlertVariant = 'info' | 'success' | 'error';
	export interface AlertInfo {
		type: AlertVariant;
		text: string;
	}
	const alertVariants = cva('rounded-md border px-3 py-2 text-sm', {
		variants: {
			variant: {
				info: 'border-blue-700 bg-blue-950/40 text-blue-100',
				success: 'border-emerald-700 bg-emerald-950/40 text-emerald-100',
				error: 'border-red-700 bg-red-950/40 text-red-100'
			}
		},
		defaultVariants: {
			variant: 'info'
		}
	});

	interface Props {
		class?: string;
		variant?: AlertVariant;
		children: Snippet;
	}
	let { class: classInput, variant = 'info', children }: Props = $props();
	let className = $derived(cn(alertVariants({ variant, className: classInput })));
</script>

<div class={className}>
	{@render children()}
</div>
