import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({
			pages: 'dist',
			assets: 'dist',
		}),
	},
	paths: {
		// NOTE: This is necessary for GitHub Pages deployment since it serves the app from a subdirectory.
		base: process.env.NODE_ENV === 'production' ? '/open-chess' : '',
	},
};

export default config;
