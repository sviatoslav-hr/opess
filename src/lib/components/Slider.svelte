<script lang="ts">
	import { cn } from '$lib/utils';

	interface Props {
		id?: string;
		name?: string;
		label: string;
		value?: number;
		min?: number;
		max?: number;
		step?: number | 'any';
		disabled?: boolean;
		class?: string;
		valueText?: string;
		onInput?: (value: number, event: Event) => void;
	}

	const generatedId = $props.id();

	let {
		id = generatedId,
		name,
		label,
		value = $bindable(0),
		min = 0,
		max = 100,
		step = 1,
		disabled = false,
		class: className,
		valueText,
		onInput,
	}: Props = $props();
</script>

<div class={cn('flex w-full flex-col gap-1.5', disabled && 'opacity-50', className)}>
	<div class="flex items-center justify-between gap-3">
		<label for={id} class="text-sm font-medium">{label}</label>
		<output for={id} class="text-sm tabular-nums">{valueText ?? value}</output>
	</div>

	<input
		type="range"
		{id}
		{name}
		{min}
		{max}
		{step}
		{disabled}
		bind:value
		aria-valuetext={valueText}
		class="h-10 w-full cursor-pointer rounded accent-teal-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500 disabled:cursor-not-allowed"
		oninput={(event) => onInput?.(event.currentTarget.valueAsNumber, event)}
	/>
</div>
