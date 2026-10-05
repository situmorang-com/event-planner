<script lang="ts">
	import { t } from '$lib/i18n/t.svelte';

	interface Props {
		devices: { ios: number; android: number; other: number };
	}

	let { devices }: Props = $props();

	// Fixed slot order: the colour follows the platform, never its rank.
	const SERIES = [
		{ key: 'ios', label: 'iPhone', color: 'var(--cat-1)' },
		{ key: 'android', label: 'Android', color: 'var(--cat-2)' },
		{ key: 'other', label: 'Other & staff', color: 'var(--cat-3)' }
	] as const;

	const total = $derived(devices.ios + devices.android + devices.other);
	const rows = $derived(
		SERIES.map((s) => ({
			...s,
			label: s.key === 'other' ? t('Other & staff') : s.label,
			count: devices[s.key],
			share: total ? devices[s.key] / total : 0
		}))
	);
	const visible = $derived(rows.filter((r) => r.count > 0));
	const pct = (n: number) => `${Math.round(n * 100)}%`;
</script>

{#if total > 0}
	<div class="bar" role="img" aria-label={rows.map((r) => `${r.label} ${r.count}`).join(', ')}>
		{#each visible as r (r.key)}
			<span
				class="seg"
				style="flex-grow: {r.count}; background: {r.color}"
				title="{r.label}: {r.count} ({pct(r.share)})"
			></span>
		{/each}
	</div>
{/if}

<ul class="legend">
	{#each rows as r (r.key)}
		<li>
			<span class="swatch" style="background: {r.color}"></span>
			<span class="name">{r.label}</span>
			<strong class="num">{r.count}</strong>
			<span class="muted num">{pct(r.share)}</span>
		</li>
	{/each}
</ul>

<style>
	.bar {
		display: flex;
		gap: 2px;
		height: 14px;
		margin-bottom: 14px;
	}

	.seg {
		flex-basis: 0;
		min-width: 6px;
		height: 100%;
	}

	/* Rounded data-ends on the outside of the stack only. */
	.seg:first-child {
		border-radius: 4px 0 0 4px;
	}

	.seg:last-child {
		border-radius: 0 4px 4px 0;
	}

	.seg:only-child {
		border-radius: 4px;
	}

	.legend {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 8px;
		font-size: 14.5px;
	}

	.legend li {
		display: grid;
		grid-template-columns: 12px 1fr auto 44px;
		align-items: center;
		gap: 10px;
	}

	.swatch {
		width: 12px;
		height: 12px;
		border-radius: 3px;
	}

	.name {
		color: var(--text-2);
	}

	.legend strong {
		text-align: right;
	}

	.legend .muted {
		text-align: right;
		font-size: 13.5px;
	}
</style>
