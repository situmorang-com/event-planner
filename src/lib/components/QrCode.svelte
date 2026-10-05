<script lang="ts">
	import { t } from '$lib/i18n/t.svelte';
	import { qrSvg } from '$lib/qr';

	let {
		value,
		dark = '#0b0b1a',
		label
	}: { value: string; dark?: string; label?: string } = $props();

	// Our own generated markup; the URL is encoded into modules, never inserted as text.
	const svg = $derived(qrSvg(value, { dark, light: 'none' }));
</script>

<div class="qr" role="img" aria-label={label ?? t('QR code')}>{@html svg}</div>

<style>
	.qr {
		width: 100%;
		aspect-ratio: 1;
	}

	.qr :global(svg) {
		width: 100%;
		height: 100%;
	}
</style>
