<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { lang, plural, t } from '$lib/i18n/t.svelte';
	import { mailtoHref } from '$lib/mailto';
	import { initials } from '$lib/names';
	import { ORIGIN_LABEL } from '$lib/people';
	import { isNew, NEW_DAYS } from '$lib/recent';
	import { formatDate, timeAgo } from '$lib/time';
	import Download from '@lucide/svelte/icons/download';
	import Lock from '@lucide/svelte/icons/lock';
	import Merge from '@lucide/svelte/icons/merge';
	import Search from '@lucide/svelte/icons/search';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	interface Candidate {
		id: string;
		name: string;
		company: string;
		email: string | null;
	}

	let timer: ReturnType<typeof setTimeout>;
	function search(value: string) {
		clearTimeout(timer);
		timer = setTimeout(
			() =>
				goto(href(value, data.prospects), { keepFocus: true, replaceState: true, noScroll: true }),
			250
		);
	}

	function href(q: string, prospects: boolean) {
		const params = new URLSearchParams();
		if (q) params.set('q', q);
		if (prospects) params.set('prospects', '1');
		const s = params.toString();
		return s ? `?${s}` : '?';
	}

	// "Merge into…" opens under one row at a time; the survivor comes from a pool search.
	let merging = $state<string | null>(null);
	let candidateQuery = $state('');
	let candidates = $state<Candidate[]>([]);

	$effect(() => {
		const q = candidateQuery.trim();
		if (!merging || q.length < 2) {
			candidates = [];
			return;
		}
		const controller = new AbortController();
		const timeout = setTimeout(async () => {
			try {
				const res = await fetch(`/admin/contacts/search.json?q=${encodeURIComponent(q)}`, {
					signal: controller.signal
				});
				if (!res.ok) return;
				const { people } = (await res.json()) as { people: Candidate[] };
				candidates = people.filter((p) => p.id !== merging);
			} catch {
				// Aborted by the next keystroke, or offline: keep what's showing.
			}
		}, 200);
		return () => {
			clearTimeout(timeout);
			controller.abort();
		};
	});

	function openMerge(id: string) {
		merging = merging === id ? null : id;
		candidateQuery = '';
	}

	function focus(node: HTMLInputElement) {
		node.focus();
	}

	// The retention rules (§5.4) in one phrase per person; no date means "until deleted".
	function kept(k: { rule: 'legacy' | 'prospect' | 'kept'; until: number | null }) {
		const date = k.until === null ? '' : formatDate(k.until, 'UTC', lang());
		if (k.rule === 'legacy')
			return k.until === null
				? t('Legacy: until the notice is sent')
				: t('Until {date} unless they reply', { date });
		return k.until === null ? t('Until deleted') : t('Until {date}', { date });
	}

	// Where a lock came from (D13), as the do-not-contact list names it; translated where shown.
	const LOCK_SOURCE = {
		staff: 'added by staff',
		stop_reply: 'replied STOP',
		not_me: 'said “not me”',
		remove_me: 'asked to be removed'
	} as const;
	const mergeError = $derived(form && 'mergeError' in form ? form.mergeError : null);
</script>

<svelte:head>
	<title>{t('Contacts')} · Event Planner</title>
</svelte:head>

<div class="head">
	<div>
		<h1>{t('Contacts')}</h1>
		<p class="muted">
			{#if data.prospects}
				{t('{n} prospects: found or typed, never replied, attended or registered', {
					n: data.prospectTotal.toLocaleString()
				})}
			{:else}
				{t(
					'{n} people who attended, replied or registered, matched by email, mobile, LinkedIn and name across every event',
					{ n: data.total.toLocaleString() }
				)}
			{/if}
		</p>
	</div>
	<div class="head-actions">
		<a class="btn btn-secondary" href="/admin/contacts/export.csv"
			><Download size={17} /> {t('Export CSV')}</a
		>
		<a
			class="btn btn-ghost"
			href="/admin/contacts/prospects.csv"
			title={t('Everyone else in the pool')}><Download size={17} /> {t('Prospects CSV')}</a
		>
	</div>
</div>

{#if data.recent.people || data.recent.companies}
	<!-- What came in this week (src/lib/recent.ts), with a way to see exactly who. -->
	<section class="card recent">
		<div>
			<p class="recent-title">
				<span class="new-pill">{t('New')}</span>
				{t('Added in the last {days} days', { days: NEW_DAYS })}
			</p>
			<p class="recent-figures">
				<strong>{plural(data.recent.people, '{n} person', '{n} people')}</strong>
				{#if data.recent.byOrigin.length}
					<span class="muted"
						>({data.recent.byOrigin
							.map((o) => `${o.n.toLocaleString()} ${t(ORIGIN_LABEL[o.origin])}`)
							.join(' · ')})</span
					>
				{/if}
				· <strong>{plural(data.recent.companies, '{n} company', '{n} companies')}</strong>
			</p>
			{#if data.recent.prospects}
				<p class="muted small">
					{plural(
						data.recent.prospects,
						'{n} of them is still a prospect (no reply yet), so the default list leaves them out.',
						'{n} of them are still prospects (no reply yet), so the default list leaves them out.'
					)}
				</p>
			{/if}
		</div>
		{#if data.recent.people}
			<a
				class="btn btn-secondary btn-sm"
				href={data.fresh ? '/admin/contacts' : '/admin/contacts?new=1'}
				data-sveltekit-replacestate>{data.fresh ? t('Show everyone') : t('Show the new ones')}</a
			>
		{/if}
	</section>
{/if}

<section class="card">
	<form class="tools" method="GET" onsubmit={(e) => e.preventDefault()}>
		<label class="search">
			<Search size={17} />
			<span class="sr-only">{t('Search contacts')}</span>
			<input
				class="input"
				type="search"
				name="q"
				value={data.q}
				placeholder={t('Search name, email, company or mobile')}
				oninput={(e) => search(e.currentTarget.value)}
			/>
		</label>
		<a
			class="chip"
			class:active={data.prospects}
			href={href(data.q, !data.prospects)}
			data-sveltekit-replacestate
			title={t('People found or typed before, who never replied, attended or registered')}
		>
			{t('Prospects')} <span class="chip-count">{data.prospectTotal.toLocaleString()}</span>
		</a>
		{#if data.recent.people}
			<a
				class="chip"
				class:active={data.fresh}
				href={data.fresh ? '/admin/contacts' : '/admin/contacts?new=1'}
				data-sveltekit-replacestate
				title={t('Added in the last {days} days', { days: NEW_DAYS })}
			>
				{t('New')} <span class="chip-count">{data.recent.people.toLocaleString()}</span>
			</a>
		{/if}
		{#if data.q}<p class="muted">
				{plural(data.contacts.length, '{n} match', '{n} matches')}
			</p>{/if}
	</form>

	{#if mergeError}<p class="error-text tools-error" role="alert">{t(String(mergeError))}</p>{/if}

	{#if data.contacts.length === 0}
		<p class="placeholder muted">
			{#if data.q}
				{t('No one matches “{q}”.', { q: data.q })}
			{:else if data.prospects}
				{t('No prospects: everyone in the pool has attended, replied or registered.')}
			{:else}
				{t('Contacts appear here as soon as people check in, reply or register.')}
			{/if}
		</p>
	{:else}
		<div class="table-wrap">
			<table class="table">
				<thead>
					<tr>
						<th>{t('Name')}</th>
						<th>{t('Email')}</th>
						<th>{t('Mobile')}</th>
						<th>{t('Company')}</th>
						<th>{t('Origin')}</th>
						<th>{t('Country')}</th>
						<th>{t('Events')}</th>
						<th>{t('Last seen')}</th>
						<th>{t('Kept')}</th>
						<th><span class="sr-only">{t('Actions')}</span></th>
					</tr>
				</thead>
				<tbody>
					{#each data.contacts as c (c.id)}
						<tr class:locked={!!c.locked_at}>
							<td>
								<div class="person">
									<span class="avatar" aria-hidden="true">{initials(c.name)}</span>
									<span class="person-text">
										<span class="person-name">{c.name}</span>
										{#if isNew(c.created_at, data.now)}
											<span
												class="new-pill"
												title={t('Added {date}', {
													date: formatDate(c.created_at, 'Asia/Jakarta', lang())
												})}>{t('New')}</span
											>
										{/if}
										{#if c.locked_at}
											<span class="pill pill-bad tiny" title={c.lock_reason || t('Do not contact')}>
												<Lock size={11} />
												{t('Locked')}{#if c.lock_source}
													· {t(LOCK_SOURCE[c.lock_source])}{/if}
											</span>
										{/if}
									</span>
								</div>
							</td>
							<td
								>{#if c.email}<a href={mailtoHref(c.email)}>{c.email}</a>{:else}<span class="muted"
										>–</span
									>{/if}</td
							>
							<td class="num">
								{#if c.phone}
									<a
										href="https://wa.me/{c.phone.replace(/\D/g, '')}"
										target="_blank"
										rel="noreferrer"
										title={t('Open in WhatsApp')}>{c.phone}</a
									>
								{:else}<span class="muted">–</span>{/if}
							</td>
							<td>
								{c.company || '–'}
								{#if c.job_title}<div class="muted small">{c.job_title}</div>{/if}
							</td>
							<td>
								{t(ORIGIN_LABEL[c.origin])}
								{#if c.origin_detail}<div class="muted small">{c.origin_detail}</div>{/if}
								{#if c.consent_future_at}
									<div class="muted small" title={t('Ticked the future-events box')}>
										{t('Future events: yes, {date}', {
											date: formatDate(c.consent_future_at, 'UTC', lang())
										})}
									</div>
								{/if}
							</td>
							<td>
								<form
									method="POST"
									action="?/country"
									use:enhance={() =>
										async ({ update }) =>
											update({ reset: false })}
								>
									<input type="hidden" name="id" value={c.id} />
									<select
										class="country-select"
										name="country"
										value={c.country ?? ''}
										aria-label={t('Country of {name}', { name: c.name })}
										onchange={(e) => e.currentTarget.form?.requestSubmit()}
									>
										<option value="">{t('Unknown')}</option>
										<option value="ID">Indonesia</option>
										<option value="MY">Malaysia</option>
									</select>
								</form>
							</td>
							<td class="num">{c.events_attended}</td>
							<td class="last-seen">
								{#if c.last_seen_at}
									<div>{c.last_event_name}</div>
									<div class="muted small">{timeAgo(c.last_seen_at, data.now, lang())}</div>
								{:else}<span class="muted">–</span>{/if}
							</td>
							<td class="kept small" class:muted={c.kept.until === null}>{kept(c.kept)}</td>
							<td>
								<div class="row-actions">
									<button
										type="button"
										class="btn btn-ghost btn-icon btn-sm"
										title={t('Merge into another record')}
										aria-expanded={merging === c.id}
										onclick={() => openMerge(c.id)}
									>
										<Merge size={16} /><span class="sr-only"
											>{t('Merge {name} into…', { name: c.name })}</span
										>
									</button>
									<form
										method="POST"
										action="?/delete"
										use:enhance={({ cancel }) => {
											if (
												!confirm(
													t(
														'Permanently delete {name}, their check-in history and every event row they are on? This is logged.',
														{ name: c.name }
													)
												)
											)
												cancel();
										}}
									>
										<input type="hidden" name="id" value={c.id} />
										<button class="btn btn-ghost btn-icon btn-sm" title={t('Delete contact')}>
											<Trash2 size={16} /><span class="sr-only"
												>{t('Delete {name}', { name: c.name })}</span
											>
										</button>
									</form>
								</div>
							</td>
						</tr>
						{#if merging === c.id}
							<tr class="merge-row">
								<td colspan="10">
									<form
										class="merge"
										method="POST"
										action="?/merge"
										use:enhance={({ formData, cancel }) => {
											const who = candidates.find((x) => x.id === formData.get('survivor'));
											if (
												!who ||
												!confirm(
													t('Merge {name} into {survivor}? {name}’s record is deleted.', {
														name: c.name,
														survivor: who.name
													})
												)
											)
												cancel();
											return async ({ result, update }) => {
												await update({ reset: false });
												if (result.type === 'success') merging = null;
											};
										}}
									>
										<input type="hidden" name="id" value={c.id} />
										<div class="field">
											<label class="label" for="merge-{c.id}">
												{t('Merge {name} into…', { name: c.name })}
												<span class="optional">{t('(the other record stays)')}</span>
											</label>
											<input
												class="input"
												id="merge-{c.id}"
												placeholder={t('Search by name, email or company')}
												autocomplete="off"
												bind:value={candidateQuery}
												onkeydown={(e) => e.key === 'Escape' && (merging = null)}
												use:focus
											/>
										</div>
										{#if candidates.length}
											<div class="candidates">
												{#each candidates as x (x.id)}
													<label class="candidate">
														<input type="radio" name="survivor" value={x.id} required />
														<span class="candidate-name">{x.name}</span>
														<span class="candidate-meta"
															>{[x.company, x.email].filter(Boolean).join(' · ')}</span
														>
													</label>
												{/each}
											</div>
										{:else if candidateQuery.trim().length >= 2}
											<p class="hint">{t('No one else matches.')}</p>
										{/if}
										<div class="merge-actions">
											<button
												type="button"
												class="btn btn-ghost btn-sm"
												onclick={() => (merging = null)}
											>
												{t('Cancel')}
											</button>
											<button class="btn btn-primary btn-sm" disabled={!candidates.length}>
												<Merge size={15} />
												{t('Merge')}
											</button>
										</div>
									</form>
								</td>
							</tr>
						{/if}
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

<style>
	.recent {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 10px 16px;
		margin-bottom: 14px;
		padding: 14px 18px;
	}

	.recent-title {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0;
		font-weight: 700;
	}

	.recent-figures {
		margin: 4px 0 0;
	}

	.head {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 16px;
		flex-wrap: wrap;
		margin-bottom: 24px;
	}

	.head-actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}

	h1 {
		font-size: 32px;
		margin-bottom: 4px;
	}

	section {
		padding: 16px 0 8px;
		overflow: hidden;
	}

	.tools {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 0 16px 14px;
		flex-wrap: wrap;
	}

	.tools-error {
		padding: 0 16px 12px;
	}

	.search {
		position: relative;
		display: flex;
		align-items: center;
		color: var(--muted);
		flex: 1;
		max-width: 420px;
	}

	.search :global(svg) {
		position: absolute;
		left: 12px;
		pointer-events: none;
	}

	.search .input {
		height: 44px;
		padding-left: 38px;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		height: 36px;
		padding: 0 14px;
		border-radius: 999px;
		border: 1px solid var(--border-strong);
		background: var(--surface);
		color: var(--text-2);
		font-size: 13.5px;
		font-weight: 650;
		text-decoration: none;
		white-space: nowrap;
	}

	.chip.active {
		background: var(--brand-soft);
		border-color: color-mix(in oklab, var(--brand) 55%, transparent);
		color: var(--brand-text);
	}

	.chip-count {
		font-size: 12.5px;
		font-weight: 700;
		color: var(--muted);
	}

	.chip.active .chip-count {
		color: inherit;
	}

	.placeholder {
		padding: 36px 16px;
		text-align: center;
	}

	.table :global(th:first-child),
	.table :global(td:first-child) {
		padding-left: 20px;
	}

	.person {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 170px;
	}

	.person-text {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 8px;
	}

	.person-name {
		font-weight: 650;
	}

	.locked .person-name {
		color: var(--muted);
	}

	.pill.tiny {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		height: 20px;
		padding: 0 7px;
		font-size: 11px;
	}

	.pill-bad {
		background: color-mix(in oklab, var(--bad) 14%, transparent);
		color: var(--bad);
	}

	.avatar {
		flex: none;
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		border-radius: 50%;
		background: var(--brand-soft);
		color: var(--brand-text);
		font-size: 12.5px;
		font-weight: 750;
	}

	.small {
		font-size: 13px;
	}

	.country-select {
		font: inherit;
		font-size: 13px;
		color: inherit;
		background: transparent;
		border: 1px solid transparent;
		border-radius: var(--radius-sm, 6px);
		padding: 2px 4px;
	}

	.country-select:hover,
	.country-select:focus-visible {
		border-color: var(--border);
	}

	.last-seen {
		min-width: 190px;
	}

	.kept {
		white-space: nowrap;
	}

	.row-actions {
		display: flex;
		align-items: center;
		gap: 2px;
	}

	.merge-row td {
		padding: 0 20px 14px;
		background: var(--surface-2);
	}

	.merge {
		display: grid;
		gap: 10px;
		max-width: 560px;
		padding-top: 12px;
	}

	.merge-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}

	.candidates {
		display: grid;
		gap: 6px;
		max-height: 240px;
		overflow-y: auto;
	}

	.candidate {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 2px 10px;
		align-items: center;
		padding: 8px 12px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border-strong);
		background: var(--surface);
		cursor: pointer;
	}

	.candidate:has(input:checked) {
		border-color: var(--brand);
		background: var(--brand-soft);
	}

	.candidate input {
		grid-row: span 2;
		margin: 0;
		accent-color: var(--brand);
	}

	.candidate-name {
		font-weight: 650;
	}

	.candidate-meta {
		font-size: 13px;
		color: var(--muted);
	}

	td a {
		color: inherit;
		text-decoration: none;
	}

	td a:hover {
		color: var(--brand-text);
		text-decoration: underline;
	}
</style>
