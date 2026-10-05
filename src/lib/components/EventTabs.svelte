<script lang="ts">
	import { t } from '$lib/i18n/t.svelte';

	interface Props {
		eventId: string;
		current: 'checkins' | 'people' | 'planning';
		checkins: number;
		/** Live rows: on the list past Found and not skipped (§4.1). */
		people: number;
		/** Found rows waiting for a decision; shown as a dot, not a number. */
		review: number;
	}

	let { eventId, current, checkins, people, review }: Props = $props();

	const tabs = $derived([
		{ key: 'checkins', label: t('Check-ins'), href: `/admin/events/${eventId}`, count: checkins },
		{
			key: 'people',
			label: t('People'),
			href: `/admin/events/${eventId}/people`,
			count: people,
			dot: review > 0 ? t('{n} to review', { n: review.toLocaleString() }) : null
		},
		{ key: 'planning', label: t('Planning'), href: `/admin/events/${eventId}/planning` }
	]);
</script>

<nav aria-label={t('Event sections')}>
	{#each tabs as tab (tab.key)}
		<a href={tab.href} aria-current={tab.key === current ? 'page' : undefined}>
			{tab.label}
			{#if tab.count !== undefined}
				<span class="count">{tab.count.toLocaleString()}</span>
			{/if}
			{#if tab.dot}<span class="dot" title={tab.dot}><span class="sr-only">{tab.dot}</span></span
				>{/if}
		</a>
	{/each}
</nav>

<style>
	nav {
		display: flex;
		gap: 4px;
		margin-bottom: 20px;
		border-bottom: 1px solid var(--border);
		overflow-x: auto;
		scrollbar-width: none;
	}

	a {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 10px 12px 12px;
		font-size: 15px;
		font-weight: 650;
		color: var(--text-2);
		text-decoration: none;
		white-space: nowrap;
		transition: color 0.15s ease;
	}

	a:hover {
		color: var(--text);
	}

	a[aria-current='page'] {
		color: var(--text);
	}

	a[aria-current='page']::after {
		content: '';
		position: absolute;
		left: 10px;
		right: 10px;
		bottom: -1px;
		height: 2px;
		border-radius: 2px;
		background: var(--brand);
	}

	.count {
		min-width: 24px;
		padding: 1px 8px;
		border-radius: 999px;
		background: var(--surface-2);
		color: var(--muted);
		font-size: 12.5px;
		font-weight: 700;
		text-align: center;
	}

	a[aria-current='page'] .count {
		background: var(--brand-soft);
		color: var(--brand-text);
	}

	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--warn);
	}
</style>
