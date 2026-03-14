<script lang="ts">
	import { cn } from '$lib/utils';

	export type SelectOption = {
		value: string;
		label: string;
		disabled?: boolean;
	};

	interface Props {
		id?: string;
		name?: string;
		label?: string;
		placeholder?: string;
		options: SelectOption[];
		value?: string;
		disabled?: boolean;
		required?: boolean;
		class?: string;
		labelClass?: string;
		selectClass?: string;
		helpClass?: string;
		helpText?: string;
		error?: string;
		onChange?: (value: string, event: Event) => void;
		onBlur?: (event: FocusEvent) => void;
	}

	let {
		id,
		name,
		label,
		placeholder = 'Select an option',
		options,
		value = $bindable(''),
		disabled = false,
		required = false,
		class: className,
		labelClass,
		selectClass,
		helpClass,
		helpText,
		error,
		onChange,
		onBlur
	}: Props = $props();

	function handleChange(event: Event) {
		onChange?.(value, event);
	}
</script>

<div class={cn('flex w-full flex-col gap-1.5', className)}>
	{#if label}
		<label for={id} class={cn('text-sm font-medium text-gray-800', labelClass)}>
			{label}
		</label>
	{/if}

	<div class="relative">
		<select
			{id}
			{name}
			bind:value
			{disabled}
			{required}
			aria-invalid={Boolean(error)}
			aria-describedby={id && (error ? `${id}-error` : helpText ? `${id}-help` : undefined)}
			class={cn(
				'h-10 w-full appearance-none rounded border bg-teal-900 px-3 pr-9 text-sm transition-colors outline-none',
				'focus:bg-teal-800',
				error ? 'border-red-500 focus:border-red-500' : 'border-teal-500 focus:border-teal-600',
				disabled && 'cursor-not-allowed border-teal-700 bg-teal-950 text-emerald-50/60',
				selectClass
			)}
			onchange={handleChange}
			onblur={onBlur}
		>
			{#if placeholder}
				<option class="disabled:text-emerald-50/50" value="" disabled={required}>
					{placeholder}
				</option>
			{/if}

			{#each options as option (option.value)}
				<option class="disabled:text-emerald-50/50" value={option.value} disabled={option.disabled}>
					{option.label}
				</option>
			{/each}
		</select>

		<span
			aria-hidden="true"
			class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[11px]"
		>
			▼
		</span>
	</div>

	{#if error}
		<p id={id ? `${id}-error` : undefined} class={cn('text-xs text-red-600', helpClass)}>{error}</p>
	{:else if helpText}
		<p id={id ? `${id}-help` : undefined} class={cn('text-xs text-gray-500', helpClass)}>
			{helpText}
		</p>
	{/if}
</div>
