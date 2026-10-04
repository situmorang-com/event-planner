<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { mailtoHref } from '$lib/mailto';
	import { initials } from '$lib/names';
	import { ORIGIN_LABEL } from '$lib/people';
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
		const t = setTimeout(async () => {
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
			clearTimeout(t);
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

	// The retention rules (§5.4) in one phrase per person; null means "until deleted".
	function kept(ts: number | null) {
		return ts === null ? 'Until deleted' : `Until ${formatDate(ts, 'UTC')}`;
	}
	const mergeError = $derived(form && 'mergeError' in form ? form.mergeError : null);
</script>

<svelte:head>
	<title>Contacts · Event Planner</title>
</svelte:head>

<div class="head">
	<div>
		<h1>Contacts</h1>
		<p class="muted">
			{#if data.prospects}
				{data.prospectTotal.toLocaleString()} prospects: found or typed, never replied, attended or registered
			{:else}
				{data.total.toLocaleString()} people who attended, replied or registered, matched by email, mobile,
				LinkedIn and name across every event
			{/if}
		</p>
	</div>
	<div class="head-actions">
		<a class="btn btn-secondary" href="/admin/contacts/export.csv"
			><Download size={17} /> Export CSV</a
		>
		<a class="btn btn-ghost" href="/admin/contacts/prospects.csv" title="Everyone else in the pool"
			><Download size={17} /> Prospects CSV</a
		>
	</div>
</div>

<section class="card">
	<form class="tools" method="GET" onsubmit={(e) => e.preventDefault()}>
		<label class="search">
			<Search size={17} />
			<span class="sr-only">Search contacts</span>
			<input
				class="input"
				type="search"
				name="q"
				value={data.q}
				placeholder="Search name, email, company or mobile"
				oninput={(e) => search(e.currentTarget.value)}
			/>
		</label>
		<a
			class="chip"
			class:active={data.prospects}
			href={href(data.q, !data.prospects)}
			data-sveltekit-replacestate
			title="People found or typed before, who never replied, attended or registered"
		>
			Prospects <span class="chip-count">{data.prospectTotal.toLocaleString()}</span>
		</a>
		{#if data.q}<p class="muted">
				{data.contacts.length} match{data.contacts.length === 1 ? '' : 'es'}
			</p>{/if}
	</form>

	{#if mergeError}<p class="error-text tools-error" role="alert">{mergeError}</p>{/if}

	{#if data.contacts.length === 0}
		<p class="placeholder muted">
			{#if data.q}
				No one matches “{data.q}”.
			{:else if data.prospects}
				No prospects: everyone in the pool has attended, replied or registered.
			{:else}
				Contacts appear here as soon as people check in, reply or register.
			{/if}
		</p>
	{:else}
		<div class="table-wrap">
			<table class="table">
				<thead>
					<tr>
						<th>Name</th>
						<th>Email</th>
						<th>Mobile</th>
						<th>Company</th>
						<th>Origin</th>
						<th>Country</th>
						<th>Events</th>
						<th>Last seen</th>
						<th>Kept</th>
						<th><span class="sr-only">Actions</span></th>
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
										{#if c.locked_at}
											<span class="pill pill-bad tiny" title={c.lock_reason || 'Do not contact'}>
												<Lock size={11} /> Locked
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
										title="Open in WhatsApp">{c.phone}</a
									>
								{:else}<span class="muted">–</span>{/if}
							</td>
							<td>
								{c.company || '–'}
								{#if c.job_title}<div class="muted small">{c.job_title}</div>{/if}
							</td>
							<td>
								{ORIGIN_LABEL[c.origin]}
								{#if c.origin_detail}<div class="muted small">{c.origin_detail}</div>{/if}
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
										aria-label="Country of {c.name}"
										onchange={(e) => e.currentTarget.form?.requestSubmit()}
									>
										<option value="">Unknown</option>
										<option value="ID">Indonesia</option>
										<option value="MY">Malaysia</option>
									</select>
								</form>
							</td>
							<td class="num">{c.events_attended}</td>
							<td class="last-seen">
								{#if c.last_seen_at}
									<div>{c.last_event_name}</div>
									<div class="muted small">{timeAgo(c.last_seen_at, data.now)}</div>
								{:else}<span class="muted">–</span>{/if}
							</td>
							<td class="kept small" class:muted={c.kept_until === null}>{kept(c.kept_until)}</td>
							<td>
								<div class="row-actions">
									<button
										type="button"
										class="btn btn-ghost btn-icon btn-sm"
										title="Merge into another record"
										aria-expanded={merging === c.id}
										onclick={() => openMerge(c.id)}
									>
										<Merge size={16} /><span class="sr-only">Merge {c.name} into…</span>
									</button>
									<form
										method="POST"
										action="?/delete"
										use:enhance={({ cancel }) => {
											if (
												!confirm(
													`Permanently delete ${c.name}, their check-in history and every event row they are on? This is logged.`
												)
											)
												cancel();
										}}
									>
										<input type="hidden" name="id" value={c.id} />
										<button class="btn btn-ghost btn-icon btn-sm" title="Delete contact">
											<Trash2 size={16} /><span class="sr-only">Delete {c.name}</span>
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
												!confirm(`Merge ${c.name} into ${who.name}? ${c.name}’s record is deleted.`)
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
												Merge {c.name} into… <span class="optional">(the other record stays)</span>
											</label>
											<input
												class="input"
												id="merge-{c.id}"
												placeholder="Search by name, email or company"
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
											<p class="hint">No one else matches.</p>
										{/if}
										<div class="merge-actions">
											<button
												type="button"
												class="btn btn-ghost btn-sm"
												onclick={() => (merging = null)}
											>
												Cancel
											</button>
											<button class="btn btn-primary btn-sm" disabled={!candidates.length}>
												<Merge size={15} /> Merge
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
