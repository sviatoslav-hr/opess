import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';

import Slider from '$lib/components/Slider.svelte';

function getInput(body: string) {
	const input = body.match(/<input\b[^>]*>/)?.[0];
	expect(input).toBeDefined();
	return input!;
}

describe('Slider', () => {
	it('renders a native range with the default bounds, step and numeric output', () => {
		const { body } = render(Slider, { props: { label: 'Volume' } });
		const input = getInput(body);

		expect(input).toContain('type="range"');
		expect(input).toContain('min="0"');
		expect(input).toContain('max="100"');
		expect(input).toContain('step="1"');
		expect(input).toContain('value="0"');
		expect(input).not.toMatch(/\bdisabled(?:[\s=>])/);
		expect(input).not.toContain('name=');
		expect(input).not.toContain('aria-valuetext=');
		expect(body).toMatch(/<output\b[^>]*>0<\/output>/);
	});

	it('associates the visible label and output with an explicit ID and forwards the name', () => {
		const { body } = render(Slider, {
			props: { id: 'volume', name: 'volume-level', label: 'Volume' },
		});
		const input = getInput(body);

		expect(input).toContain('id="volume"');
		expect(input).toContain('name="volume-level"');
		expect(body).toMatch(/<label\b[^>]*for="volume"[^>]*>Volume<\/label>/);
		expect(body).toMatch(/<output\b[^>]*for="volume"[^>]*>0<\/output>/);
	});

	it('generates an ID when omitted and links both the label and output to it', () => {
		const { body } = render(Slider, { props: { label: 'Speed' } });
		const id = getInput(body).match(/\bid="([^"]+)"/)?.[1];

		expect(id).toBeTruthy();
		expect(body).toContain(`<label for="${id}"`);
		expect(body).toContain(`<output for="${id}"`);
		expect(body).toMatch(/<label\b[^>]*>Speed<\/label>/);
	});

	it.each([0.5, 'any'] as const)('forwards custom bounds, value and step %s', (step) => {
		const { body } = render(Slider, {
			props: { label: 'Offset', min: -10, max: 10, step, value: -2.5 },
		});
		const input = getInput(body);

		expect(input).toContain('min="-10"');
		expect(input).toContain('max="10"');
		expect(input).toContain(`step="${step}"`);
		expect(input).toContain('value="-2.5"');
		expect(body).toMatch(/<output\b[^>]*>-2\.5<\/output>/);
	});

	it('uses valueText for the visible readout and accessible value without changing the value', () => {
		const { body } = render(Slider, {
			props: { label: 'Delay', value: 20, valueText: '20 seconds' },
		});
		const input = getInput(body);

		expect(input).toContain('value="20"');
		expect(input).toContain('aria-valuetext="20 seconds"');
		expect(body).toMatch(/<output\b[^>]*>20 seconds<\/output>/);
	});

	it('keeps an explicitly empty valueText instead of falling back to the numeric value', () => {
		const { body } = render(Slider, {
			props: { label: 'Delay', value: 20, valueText: '' },
		});

		expect(getInput(body)).toContain('aria-valuetext=""');
		expect(body).toMatch(/<output\b[^>]*><\/output>/);
	});

	it('renders native disabled state, disabled styling and caller classes', () => {
		const { body } = render(Slider, {
			props: { label: 'Volume', disabled: true, class: 'w-64 mt-4' },
		});
		const wrapperClass = body.match(/<div class="([^"]*)"/)?.[1].split(/\s+/);

		expect(getInput(body)).toMatch(/\bdisabled(?:[\s=>])/);
		expect(getInput(body)).toContain('disabled:cursor-not-allowed');
		expect(wrapperClass).toEqual(expect.arrayContaining(['opacity-50', 'w-64', 'mt-4']));
		expect(wrapperClass).not.toContain('w-full');
	});

	it('does not fire onInput during server rendering', () => {
		const onInput = vi.fn();

		render(Slider, { props: { label: 'Volume', onInput } });

		expect(onInput).not.toHaveBeenCalled();
	});
});
