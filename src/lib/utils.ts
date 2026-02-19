import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

type DebouncedFunction<T extends (...args: any[]) => any> = {
	(...args: Parameters<T>): void;
	cancel: () => void;
};

export function debounce<T extends (...args: any[]) => any>(
	fn: T,
	delay: number
): DebouncedFunction<T> {
	let timeoutId: ReturnType<typeof setTimeout> | undefined;

	function debouncedFn(...args: Parameters<T>) {
		if (timeoutId) {
			clearTimeout(timeoutId);
		}

		timeoutId = setTimeout(() => {
			fn(...args);
			timeoutId = undefined;
		}, delay);
	}

	debouncedFn.cancel = () => {
		if (timeoutId) {
			clearTimeout(timeoutId);
			timeoutId = undefined;
		}
	};

	return debouncedFn;
}

export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}
