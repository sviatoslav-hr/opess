// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	const PUBLIC_NODE_ENV: string;
	type Either<T, U> = [T, null?] | [null?, U];
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
