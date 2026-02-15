<script lang="ts">
	import type { Opening } from '$lib/chess/openings';
	import Select, { type SelectOption } from './Select.svelte';

	interface Props {
		openings: Opening[];
		onSelected?: (opening: Opening) => void;
	}
	const { openings, onSelected }: Props = $props();

	let options: SelectOption[] = openings.map((opening) => ({
		value: opening.name,
		label: opening.name
	}));

	function handleChange(value: string) {
		const opening = openings.find((o) => o.name === value);
		if (opening) {
			onSelected?.(opening);
		}
	}
</script>

<Select {options} placeholder="Select Opening" onChange={handleChange} required></Select>
