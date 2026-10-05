<script lang="ts">
	import { t, plural, lang } from '$lib/i18n/t.svelte';
	import { formatTime } from '$lib/time';

	interface Props {
		buckets: { start: number; count: number }[];
		bucketMinutes: number;
		timezone: string;
	}

	let { buckets, bucketMinutes, timezone }: Props = $props();

	let width = $state(640);
	let active = $state<number | null>(null);

	const HEIGHT = 230;
	const M = { top: 22, right: 6, bottom: 30, left: 34 };

	function niceStep(raw: number) {
		const pow = 10 ** Math.floor(Math.log10(raw));
		for (const s of [1, 2, 2.5, 5, 10]) if (s * pow >= raw) return s * pow;
		return 10 * pow;
	}

	const plotW = $derived(Math.max(0, width - M.left - M.right));
	const plotH = HEIGHT - M.top - M.bottom;
	const max = $derived(Math.max(0, ...buckets.map((b) => b.count)));
	const step = $derived(Math.max(1, Math.ceil(niceStep(Math.max(max, 1) / 4))));
	const yMax = $derived(Math.max(step, Math.ceil(max / step) * step));
	const ticks = $derived(Array.from({ length: yMax / step + 1 }, (_, i) => i * step));
	const band = $derived(plotW / Math.max(1, buckets.length));
	// Thin marks: never fill the slot, cap at 24px, keep a 2px gap between neighbours.
	const barW = $derived(Math.max(2, Math.min(24, band * 0.62, band - 2)));
	const peakIndex = $derived(buckets.findIndex((b) => b.count === max && max > 0));
	const labelEvery = $derived(
		Math.max(1, Math.ceil(buckets.length / Math.max(1, Math.floor(plotW / 78))))
	);

	const y = (v: number) => M.top + plotH - (v / yMax) * plotH;
	const x = (i: number) => M.left + i * band + (band - barW) / 2;

	function barPath(i: number, count: number) {
		const h = plotH - (y(count) - M.top);
		if (h <= 0) return '';
		const r = Math.min(4, barW / 2, h);
		const x0 = x(i);
		const top = y(count);
		const bottom = M.top + plotH;
		return `M${x0},${bottom}V${top + r}A${r},${r} 0 0 1 ${x0 + r},${top}H${x0 + barW - r}A${r},${r} 0 0 1 ${x0 + barW},${top + r}V${bottom}Z`;
	}

	const range = (b: { start: number }) =>
		`${formatTime(b.start, timezone, false, lang())} – ${formatTime(b.start + bucketMinutes * 60_000, timezone, false, lang())}`;

	function onKey(e: KeyboardEvent) {
		if (!buckets.length) return;
		if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
			e.preventDefault();
			const current = active ?? (e.key === 'ArrowRight' ? -1 : buckets.length);
			active = Math.min(
				buckets.length - 1,
				Math.max(0, current + (e.key === 'ArrowRight' ? 1 : -1))
			);
		} else if (e.key === 'Escape') {
			active = null;
		}
	}

	const tip = $derived(active === null ? null : buckets[active]);
</script>

<div class="chart" bind:clientWidth={width}>
	<!-- Arrow keys walk the bars; the table view below is the screen-reader twin. -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
	<svg
		{width}
		height={HEIGHT}
		viewBox="0 0 {width} {HEIGHT}"
		role="img"
		aria-label={t('Arrivals per {n} minutes. Use the arrow keys to read each bar.', {
			n: bucketMinutes
		})}
		tabindex="0"
		onkeydown={onKey}
		onblur={() => (active = null)}
		onpointerleave={() => (active = null)}
	>
		{#each ticks as tick (tick)}
			<line class="grid" x1={M.left} x2={width - M.right} y1={y(tick)} y2={y(tick)} />
			<text class="tick" x={M.left - 8} y={y(tick)} dy="0.32em" text-anchor="end">{tick}</text>
		{/each}
		<line class="axis" x1={M.left} x2={width - M.right} y1={M.top + plotH} y2={M.top + plotH} />

		{#each buckets as b, i (b.start)}
			<path class="bar" class:dim={active !== null && active !== i} d={barPath(i, b.count)} />
			{#if i % labelEvery === 0}
				<text class="tick" x={M.left + i * band + band / 2} y={HEIGHT - 8} text-anchor="middle">
					{formatTime(b.start, timezone, false, lang())}
				</text>
			{/if}
		{/each}

		{#if peakIndex >= 0}
			<text class="peak" x={x(peakIndex) + barW / 2} y={y(max) - 8} text-anchor="middle">{max}</text
			>
		{/if}

		<!-- Hit targets: the whole column band, not just the painted bar. -->
		{#each buckets as b, i (b.start)}
			<rect
				role="presentation"
				class="hit"
				x={M.left + i * band}
				y={M.top}
				width={band}
				height={plotH}
				onpointerenter={() => (active = i)}
				onpointermove={() => (active = i)}
			/>
		{/each}
	</svg>

	{#if tip && active !== null}
		<div
			class="tooltip"
			style="left: {Math.min(Math.max(x(active) + barW / 2, 70), width - 70)}px; top: {y(
				tip.count
			) - 12}px"
			role="status"
		>
			<strong>{plural(tip.count, '{n} arrival', '{n} arrivals')}</strong>
			<span>{range(tip)}</span>
		</div>
	{/if}
</div>

<details>
	<summary>{t('Show as table')}</summary>
	<table class="table">
		<thead><tr><th>{t('Time')}</th><th>{t('Arrivals')}</th></tr></thead>
		<tbody>
			{#each buckets as b (b.start)}
				<tr><td>{range(b)}</td><td class="num">{b.count}</td></tr>
			{/each}
		</tbody>
	</table>
</details>

<style>
	.chart {
		position: relative;
		width: 100%;
	}

	svg {
		overflow: visible;
		touch-action: pan-y;
	}

	svg:focus-visible {
		outline: 2px solid var(--brand);
		outline-offset: 4px;
		border-radius: 8px;
	}

	.grid {
		stroke: var(--grid);
		stroke-width: 1;
		shape-rendering: crispEdges;
	}

	.axis {
		stroke: var(--axis);
		stroke-width: 1;
		shape-rendering: crispEdges;
	}

	.tick {
		fill: var(--muted);
		font-size: 12px;
		font-variant-numeric: tabular-nums;
	}

	.peak {
		fill: var(--text);
		font-size: 12.5px;
		font-weight: 700;
	}

	.bar {
		fill: var(--series-1);
		transition: opacity 0.15s ease;
	}

	.bar.dim {
		opacity: 0.45;
	}

	.hit {
		fill: transparent;
	}

	.tooltip {
		position: absolute;
		transform: translate(-50%, -100%);
		display: grid;
		gap: 2px;
		padding: 8px 12px;
		border-radius: 10px;
		background: var(--surface);
		border: 1px solid var(--border);
		box-shadow: var(--shadow);
		font-size: 13px;
		white-space: nowrap;
		pointer-events: none;
	}

	.tooltip strong {
		font-size: 15px;
		color: var(--text);
	}

	.tooltip span {
		color: var(--text-2);
	}

	details {
		margin-top: 8px;
		font-size: 14px;
	}

	summary {
		cursor: pointer;
		color: var(--muted);
		font-weight: 600;
		width: max-content;
	}

	details .table {
		margin-top: 8px;
	}
</style>
