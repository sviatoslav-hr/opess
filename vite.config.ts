/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

declare global {
	// @HACK: Don't want to depend on @types/node just to make this work.
	const process: { env: Record<string, string | undefined> };
}

const env = process.env.NODE_ENV ?? 'unknown';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	define: {
		PUBLIC_NODE_ENV: JSON.stringify(env),
	},
	test: {
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}'],
				},
			},
		],
	},
});
