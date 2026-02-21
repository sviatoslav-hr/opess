import type { AlertInfo } from './Alert.svelte';

export function errorAlert(text: string): AlertInfo {
	return { type: 'error', text };
}
export function successAlert(text: string): AlertInfo {
	return { type: 'success', text };
}
export function infoAlert(text: string): AlertInfo {
	return { type: 'info', text };
}
