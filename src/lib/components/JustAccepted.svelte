<script lang="ts">
	import { copyNow } from '$lib/copy';
	import { t, plural, lang } from '$lib/i18n/t.svelte';
	import { linkedinMessageUrl } from '$lib/invitations';
	import type { PeopleRow } from '$lib/people';
	import { formatDate } from '$lib/time';
	import Send from '@lucide/svelte/icons/send';
	import Check from '@lucide/svelte/icons/check';
	import UserCheck from '@lucide/svelte/icons/user-check';

	// Accepted on LinkedIn and not messaged since (D28): one tap copies the draft and opens a
	// message to them, the same as the row's LinkedIn button, and records it on the event.
	interface Item {
		event: { id: string; name: string; timezone: string };
		row: PeopleRow;
	}
	let { items }: { items: Item[] } = $props();

	let sent = $state<Record<number, { copied: boolean }>>({});
	const waiting = $derived(items.filter((i) => !sent[i.row.id]).length);

	function message(item: Item) {
		const { row, event } = item;
		if (!row.message?.text || !row.linkedin) return;
		const copied = copyNow(row.message.text);
		window.open(linkedinMessageUrl(row.linkedin) ?? row.linkedin, '_blank', 'noopener');
		const data = new FormData();
		data.set('id', String(row.id));
		data.set('via', 'linkedin');
		data.set('kind', row.message.kind);
		navigator.sendBeacon(`/admin/events/${event.id}/people?/touch`, data);
		sent[row.id] = { copied };
	}
</script>

{#if items.length}
	<section class="accepted card rise" aria-labelledby="accepted-title">
		<header>
			<span class="icon"><UserCheck size={18} /></span>
			<div>
				<h2 id="accepted-title">{t('Just accepted on LinkedIn')}</h2>
				<p class="muted">
					{waiting
						? plural(
								waiting,
								'{n} person to message while it’s fresh',
								'{n} people to message while it’s fresh'
							)
						: t('All messaged. Nice.')}
				</p>
			</div>
		</header>
		<ul>
			{#each items as item (item.event.id + ':' + item.row.id)}
				{@const row = item.row}
				<li class:done={sent[row.id]}>
					<div class="who">
						<strong>{row.name}</strong>
						<span class="muted">{[row.job_title, row.company].filter(Boolean).join(' · ')}</span>
						<span class="meta">
							<a href="/admin/events/{item.event.id}/people">{item.event.name}</a>
							{#if row.linkedin_status_at}
								· {t('Accepted {date}', {
									date: formatDate(row.linkedin_status_at, item.event.timezone, lang())
								})}
							{/if}
						</span>
					</div>
					{#if sent[row.id]}
						<span class="pill pill-good"
							><Check size={14} />
							{sent[row.id].copied ? t('Draft copied: paste and Send') : t('Opened')}</span
						>
					{:else if row.message?.text && row.linkedin}
						<button
							type="button"
							class="btn btn-primary btn-sm"
							onclick={() => message(item)}
							title={t('Copies the draft and opens a LinkedIn message to {name}', {
								name: row.name
							})}
						>
							<Send size={14} />
							{t('Message on LinkedIn')}
						</button>
					{:else}
						<a class="btn btn-soft btn-sm" href="/admin/events/{item.event.id}/people"
							>{row.message?.hint ?? t('Open in People')}</a
						>
					{/if}
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	.accepted {
		padding: 18px 20px;
		margin-bottom: 20px;
		border-color: color-mix(in oklab, var(--good) 35%, var(--border));
	}

	header {
		display: flex;
		gap: 12px;
		align-items: center;
		margin-bottom: 12px;
	}

	.icon {
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		border-radius: 50%;
		background: var(--good-soft);
		color: var(--good);
		flex: none;
	}

	h2 {
		font-size: 18px;
	}

	header p {
		margin: 0;
		font-size: 14px;
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
	}

	li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 10px 0;
		border-top: 1px solid var(--border);
	}

	li.done .who {
		opacity: 0.6;
	}

	.who {
		display: grid;
		gap: 2px;
		min-width: 0;
		font-size: 14px;
	}

	.meta {
		font-size: 13px;
		color: var(--text-2);
	}

	.meta a {
		color: var(--brand-text);
	}

	li > :last-child {
		flex: none;
	}
</style>
