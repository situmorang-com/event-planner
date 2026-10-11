<script lang="ts">
	import { lang, plural, t } from '$lib/i18n/t.svelte';
	import {
		effectiveOwner,
		LINKEDIN_STATUS_LABEL,
		nextActionText,
		STAGE_LABEL,
		type PeopleRow
	} from '$lib/people';
	import { REPLY_LABEL } from '$lib/invitations';
	import { formatDay, formatDueDay } from '$lib/time';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Printer from '@lucide/svelte/icons/printer';
	import Search from '@lucide/svelte/icons/search';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const event = $derived(data.event);

	// One status per person, in the words the People tab uses: where they are on the track,
	// with the answer named once there is one.
	type Status =
		| 'review'
		| 'skipped'
		| 'shortlisted'
		| 'invited'
		| 'yes'
		| 'maybe'
		| 'no'
		| 'confirmed'
		| 'checked_in';
	const ORDER: Status[] = [
		'review',
		'shortlisted',
		'invited',
		'yes',
		'maybe',
		'no',
		'confirmed',
		'checked_in',
		'skipped'
	];
	function statusOf(r: PeopleRow): Status {
		if (r.skipped_at) return 'skipped';
		if (r.stage === 'found') return 'review';
		if (r.stage === 'replied') return r.reply === 'pending' ? 'invited' : (r.reply as Status);
		return r.stage as Status;
	}
	const STATUS_LABEL: Record<Status, string> = {
		review: 'To review',
		skipped: 'Skipped',
		shortlisted: STAGE_LABEL.shortlisted,
		invited: STAGE_LABEL.invited,
		yes: REPLY_LABEL.yes,
		maybe: REPLY_LABEL.maybe,
		no: REPLY_LABEL.no,
		confirmed: STAGE_LABEL.confirmed,
		checked_in: STAGE_LABEL.checked_in
	};

	const rows = $derived(data.rows.map((r) => ({ ...r, status: statusOf(r) })));
	const counts = $derived(
		Object.fromEntries(ORDER.map((s) => [s, rows.filter((r) => r.status === s).length])) as Record<
			Status,
			number
		>
	);

	let shown = $state<Status[]>([]);
	let query = $state('');
	type Sort = 'company' | 'name' | 'status' | 'contacted' | 'next';
	let sort = $state<Sort>('company');
	let descending = $state(false);

	function toggle(s: Status) {
		shown = shown.includes(s) ? shown.filter((x) => x !== s) : [...shown, s];
	}
	function sortBy(key: Sort) {
		if (sort === key) descending = !descending;
		else {
			sort = key;
			descending = key === 'contacted';
		}
	}

	const q = $derived(query.trim().toLowerCase());
	const list = $derived.by(() => {
		const keep = rows.filter(
			(r) =>
				(shown.length ? shown.includes(r.status) : r.status !== 'skipped') &&
				(!q || [r.name, r.company, r.job_title, r.note].some((v) => v?.toLowerCase().includes(q)))
		);
		const by = (r: (typeof keep)[number]): string | number => {
			switch (sort) {
				case 'company':
					return `${r.company.toLowerCase()}\u0000${r.name.toLowerCase()}`;
				case 'name':
					return r.name.toLowerCase();
				case 'status':
					return ORDER.indexOf(r.status);
				case 'contacted':
					return r.last_contacted_at ?? 0;
				case 'next':
					return r.next_action_at ?? Number.MAX_SAFE_INTEGER;
			}
		};
		return keep.sort((a, b) => {
			const x = by(a);
			const y = by(b);
			const c = x < y ? -1 : x > y ? 1 : 0;
			return descending ? -c : c;
		});
	});

	const day = (ts: number) => formatDay(ts, event.timezone, lang());
	const due = (r: PeopleRow) => {
		if (!data.today) return '';
		const next = nextActionText(r, data.today, (ts) => formatDueDay(ts, event.timezone, lang()));
		return next ? t(next.text, next.vars) : '';
	};
	const VIA: Record<string, string> = {
		whatsapp: 'WhatsApp',
		email: 'Email',
		linkedin: 'LinkedIn',
		other: 'Other'
	};
</script>

<svelte:head>
	<title>{t('People list')} · {event.name} · Event Planner</title>
</svelte:head>

<header class="head">
	<a class="back" href="/admin/events/{event.id}/people"><ArrowLeft size={16} /> {t('People')}</a>
	<div class="title-row">
		<div>
			<h1>{t('People list')}</h1>
			<p class="muted">
				{event.name} · {plural(list.length, '{n} person shown', '{n} people shown')}
			</p>
		</div>
		<button class="btn btn-secondary btn-sm print" onclick={() => window.print()}>
			<Printer size={16} />
			{t('Print')}
		</button>
	</div>
</header>

<div class="tools">
	<label class="search">
		<Search size={16} />
		<span class="sr-only">{t('Search the list')}</span>
		<input
			class="input"
			type="search"
			placeholder={t('Search names, companies, notes')}
			bind:value={query}
		/>
	</label>
	<div class="chips" role="group" aria-label={t('Show')}>
		{#each ORDER as s (s)}
			{#if counts[s]}
				<button class="chip" aria-pressed={shown.includes(s)} onclick={() => toggle(s)}>
					{t(STATUS_LABEL[s])} <span class="chip-count">{counts[s].toLocaleString()}</span>
				</button>
			{/if}
		{/each}
	</div>
</div>

{#if !data.rows.length}
	<p class="card empty muted">{t('No one on this event yet.')}</p>
{:else}
	<div class="card table-wrap">
		<table>
			<thead>
				<tr>
					<th
						><button class="sort" onclick={() => sortBy('name')} aria-pressed={sort === 'name'}
							>{t('Name')}</button
						></th
					>
					<th
						><button
							class="sort"
							onclick={() => sortBy('company')}
							aria-pressed={sort === 'company'}>{t('Company')}</button
						></th
					>
					<th
						><button class="sort" onclick={() => sortBy('status')} aria-pressed={sort === 'status'}
							>{t('Status')}</button
						></th
					>
					<th>LinkedIn</th>
					<th
						><button
							class="sort"
							onclick={() => sortBy('contacted')}
							aria-pressed={sort === 'contacted'}>{t('Last contact')}</button
						></th
					>
					<th
						><button class="sort" onclick={() => sortBy('next')} aria-pressed={sort === 'next'}
							>{t('Next')}</button
						></th
					>
					<th>{t('Owner')}</th>
					<th>{t('Note')}</th>
				</tr>
			</thead>
			<tbody>
				{#each list as r (r.id)}
					<tr class:quiet={r.status === 'skipped' || r.status === 'no'}>
						<td>
							<span class="name">{r.name}</span>
							{#if r.job_title}<span class="sub">{r.job_title}</span>{/if}
						</td>
						<td>{r.company || '—'}</td>
						<td><span class="status {r.status}">{t(STATUS_LABEL[r.status])}</span></td>
						<td>
							{#if r.linkedin && r.stage !== 'found'}
								<span class="li {r.linkedin_status}"
									>{t(LINKEDIN_STATUS_LABEL[r.linkedin_status])}</span
								>
							{:else if r.linkedin}
								<a href={r.linkedin} target="_blank" rel="noreferrer">{t('Profile')}</a>
							{:else}
								<span class="muted">—</span>
							{/if}
						</td>
						<td>
							{#if r.last_contacted_at}
								{day(r.last_contacted_at)}{#if r.invited_via}
									<span class="sub">{t(VIA[r.invited_via] ?? r.invited_via)}</span>{/if}
							{:else}
								<span class="muted">—</span>
							{/if}
						</td>
						<td>{due(r) || '—'}</td>
						<td>{effectiveOwner(r) ?? '—'}</td>
						<td class="note">{r.note}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<style>
	.head {
		margin-bottom: 14px;
	}

	.back {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin-bottom: 8px;
		font-size: 14px;
		font-weight: 650;
		color: var(--text-2);
		text-decoration: none;
	}

	.title-row {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 12px;
	}

	h1 {
		margin: 0;
	}

	.tools {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px 14px;
		margin-bottom: 12px;
	}

	.search {
		position: relative;
		display: flex;
		align-items: center;
		min-width: 240px;
		flex: 0 1 320px;
	}

	.search :global(svg) {
		position: absolute;
		left: 12px;
		color: var(--muted);
	}

	.search .input {
		padding-left: 36px;
		height: 38px;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	/* The People tab's status chips. */
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		height: 36px;
		padding: 0 12px;
		border-radius: 999px;
		border: 1px solid var(--border-strong);
		background: var(--surface);
		color: var(--text-2);
		font-size: 14px;
		font-weight: 650;
		white-space: nowrap;
		cursor: pointer;
		transition:
			border-color 0.15s ease,
			background-color 0.15s ease,
			color 0.15s ease;
	}

	.chip:hover:not(:disabled) {
		border-color: color-mix(in oklab, var(--brand) 50%, var(--border-strong));
		color: var(--text);
	}

	.chip:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.chip[aria-pressed='true'] {
		background: var(--brand-soft);
		border-color: color-mix(in oklab, var(--brand) 55%, transparent);
		color: var(--brand-text);
	}

	.chip-count {
		font-size: 13px;
		font-weight: 700;
		color: var(--muted);
		font-variant-numeric: tabular-nums;
	}

	.chip[aria-pressed='true'] .chip-count {
		color: inherit;
	}

	.table-wrap {
		padding: 0;
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 13.5px;
	}

	th,
	td {
		padding: 8px 12px;
		border-bottom: 1px solid var(--border);
		text-align: left;
		vertical-align: top;
	}

	th {
		position: sticky;
		top: 0;
		background: var(--surface);
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.02em;
		text-transform: uppercase;
		color: var(--muted);
		white-space: nowrap;
	}

	.sort {
		padding: 0;
		border: 0;
		background: none;
		font: inherit;
		color: inherit;
		text-transform: inherit;
		letter-spacing: inherit;
		cursor: pointer;
	}

	.sort[aria-pressed='true'] {
		color: var(--brand-text);
	}

	tbody tr:hover {
		background: var(--surface-2);
	}

	tr.quiet {
		opacity: 0.6;
	}

	.name {
		font-weight: 650;
	}

	.sub {
		display: block;
		font-size: 12px;
		color: var(--muted);
	}

	.note {
		max-width: 28ch;
		color: var(--text-2);
	}

	.status,
	.li {
		display: inline-block;
		padding: 2px 8px;
		border-radius: 999px;
		background: var(--surface-2);
		font-size: 12px;
		font-weight: 650;
		white-space: nowrap;
	}

	.status.invited {
		background: var(--brand-soft);
		color: var(--brand-text);
	}

	.status.yes,
	.status.confirmed,
	.status.checked_in,
	.li.connected {
		background: var(--good-soft);
		color: var(--good);
	}

	.status.maybe,
	.status.review,
	.li.requested {
		background: var(--warn-soft);
		color: var(--warn);
	}

	.status.no {
		background: var(--bad-soft);
		color: var(--bad);
	}

	.empty {
		padding: 24px;
	}

	@media print {
		.back,
		.print,
		.tools {
			display: none;
		}

		th {
			position: static;
		}
	}
</style>
