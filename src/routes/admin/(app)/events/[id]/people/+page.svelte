<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import AddGuests from '$lib/components/AddGuests.svelte';
	import EventTabs from '$lib/components/EventTabs.svelte';
	import GuestRow from '$lib/components/GuestRow.svelte';
	import QuickAdd from '$lib/components/QuickAdd.svelte';
	import { connectLive } from '$lib/live';
	import {
		CHIP_LABEL,
		CHIPS,
		chipCounts,
		effectiveOwner,
		matchesChip,
		type Chip,
		type PeopleRow,
		type Reply
	} from '$lib/people';
	import { formatDateTime } from '$lib/time';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Ban from '@lucide/svelte/icons/ban';
	import CalendarPlus from '@lucide/svelte/icons/calendar-plus';
	import ClipboardList from '@lucide/svelte/icons/clipboard-list';
	import Download from '@lucide/svelte/icons/download';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Search from '@lucide/svelte/icons/search';
	import UserPlus from '@lucide/svelte/icons/user-plus';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const event = $derived(data.event);
	// A string, so the live connection below survives every reload of the page data.
	const eventId = $derived(data.event.id);
	const view = $derived(data.view);
	const rows = $derived(view?.rows ?? []);
	const live = $derived(rows.filter((r) => r.stage !== 'found'));
	const ended = $derived(view?.ended ?? false);

	// An empty list opens straight onto the form that fills it.
	// svelte-ignore state_referenced_locally
	let adding = $state(!!data.view && data.view.rows.length === 0);
	let focusAdd = $state(false);
	let query = $state('');
	// Default chips: none before the event; who came and who didn't once it has ended (§4.2).
	// svelte-ignore state_referenced_locally
	let chips = $state<Chip[]>(data.view?.ended ? ['checked_in', 'no_show'] : []);
	let mine = $state(false);
	let showSkipped = $state(false);
	let renaming = $state<string | null>(null);

	// On the day the list is live: each arrival ticks its row off without a reload.
	$effect(() => {
		let pending: ReturnType<typeof setTimeout> | undefined;
		const refresh = () => {
			clearTimeout(pending);
			pending = setTimeout(() => invalidateAll(), 400);
		};
		const disconnect = connectLive(eventId, { checkin: refresh, refresh });
		return () => {
			clearTimeout(pending);
			disconnect();
		};
	});

	// A tapped reply shows at once; the saved one takes over when the page data catches up.
	let optimistic = $state<Record<number, Reply>>({});
	const latest: Record<number, number> = {};
	let sequence = 0;

	function beginReply(id: number, reply: Reply) {
		optimistic[id] = reply;
		const mine = (latest[id] = ++sequence);
		return () => {
			// A quicker second tap wins: only the last reply sent clears the placeholder.
			if (latest[id] === mine) delete optimistic[id];
		};
	}

	const replyOf = (r: PeopleRow) => optimistic[r.id] ?? r.reply;

	/** The row as it will look once the tapped reply has saved, so chips move with the tap. */
	function settled(r: PeopleRow): PeopleRow {
		const reply = replyOf(r);
		if (reply === r.reply) return r;
		const stage =
			reply === 'pending'
				? r.stage === 'replied' || r.stage === 'confirmed'
					? 'invited'
					: r.stage
				: r.stage === 'shortlisted' || r.stage === 'invited'
					? 'replied'
					: r.stage;
		return { ...r, reply, stage, confirmed_at: reply === 'no' ? null : r.confirmed_at };
	}

	// A message sent from a row changes its stage a moment later; fetch it once the link opened.
	let touchTimer: ReturnType<typeof setTimeout> | undefined;
	function afterTouch() {
		clearTimeout(touchTimer);
		touchTimer = setTimeout(() => invalidateAll(), 700);
	}

	const counts = $derived(chipCounts(rows.map(settled), ended));
	const shownChips = $derived(CHIPS.filter((c) => c !== 'skipped' || showSkipped));

	function toggleChip(chip: Chip) {
		chips = chips.includes(chip) ? chips.filter((c) => c !== chip) : [...chips, chip];
	}

	const q = $derived(query.trim().toLowerCase());
	const filtering = $derived(chips.length > 0 || mine || q !== '');

	function shows(r: PeopleRow) {
		const row = settled(r);
		if (row.skipped_at && !showSkipped) return false;
		if (chips.length && !chips.some((c) => matchesChip(row, c, ended))) return false;
		if (mine && effectiveOwner(row) !== data.me) return false;
		return (
			!q ||
			[row.name, row.company, row.job_title, row.email, row.phone, row.note].some((v) =>
				v?.toLowerCase().includes(q)
			)
		);
	}

	const groups = $derived(
		(view?.groups ?? [])
			.map((group) => ({
				...group,
				shown: group.rows.filter(shows),
				waiting: group.rows.filter((r) => r.stage === 'found' && !r.skipped_at).length
			}))
			.filter((group) => group.shown.length)
	);

	const progress = $derived(view?.progress ?? { yes: 0, confirmed: 0, target: null });
	const percent = $derived(
		progress.target ? Math.min(100, Math.round((progress.yes / progress.target) * 100)) : 0
	);

	/** "5 people · 3 attending · 2 to review" */
	function groupSummary(group: { rows: PeopleRow[]; waiting: number }) {
		const people = group.rows.filter((r) => r.stage !== 'found');
		const yes = people.filter((r) => replyOf(r) === 'yes').length;
		const parts = [
			`${people.length.toLocaleString()} ${people.length === 1 ? 'person' : 'people'}`
		];
		if (yes) parts.push(`${yes.toLocaleString()} attending`);
		if (group.waiting) parts.push(`${group.waiting.toLocaleString()} to review`);
		return parts.join(' · ');
	}

	function openAdd() {
		// Already open: the button still takes you to it.
		if (adding) document.getElementById('add-company')?.focus();
		adding = true;
		focusAdd = true;
	}

	function focusSelect(node: HTMLInputElement) {
		node.focus();
		node.select();
	}

	const editErrors = $derived(form && 'editId' in form ? form : null);
	const problem = $derived.by(() => {
		if (!form) return '';
		for (const key of [
			'shortlistError',
			'mergeError',
			'lockError',
			'renameError',
			'blockError'
		] as const)
			if (key in form && typeof form[key] === 'string') return form[key];
		if ('refusedAll' in form && form.refusedAll?.length)
			return `Couldn’t add ${form.refusedAll.join(', ')}: locked or at a blocked company.`;
		return '';
	});
	const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;
</script>

<svelte:head>
	<title>People · {event.name} · Event Planner</title>
</svelte:head>

<a class="back btn btn-ghost btn-sm" href="/admin"><ArrowLeft size={16} /> Events</a>

<header class="head">
	<div class="title">
		<div class="status">
			{#if event.is_open}
				<span class="pill pill-good"><span class="dot dot-live"></span> Check-in open</span>
			{:else}
				<span class="pill">Check-in closed</span>
			{/if}
		</div>
		<h1>{event.name}</h1>
		<p class="muted">
			{#if event.starts_at}{formatDateTime(event.starts_at, event.timezone)}{/if}
			{#if event.starts_at && event.venue}&nbsp;·&nbsp;{/if}
			{event.venue}
		</p>
	</div>
	{#if view}
		<div class="head-actions">
			{#if live.length}
				<a class="btn btn-secondary" href="/admin/events/{event.id}/people.csv">
					<Download size={17} /> CSV
				</a>
			{/if}
			<button class="btn btn-primary" onclick={openAdd} aria-expanded={adding}>
				<UserPlus size={18} /> Add people
			</button>
		</div>
	{/if}
</header>

<EventTabs
	eventId={event.id}
	current="people"
	checkins={data.tabs.checkins}
	people={data.tabs.people}
	review={data.tabs.review}
/>

{#if !view}
	<section class="card empty rise">
		<div class="empty-icon"><CalendarPlus size={30} /></div>
		<h2>Set the event date first</h2>
		<p class="muted">
			The list counts down to the event: invitations, chases and what research may keep all depend
			on when it is.
		</p>
		<a class="btn btn-primary btn-lg" href="/admin/events/{event.id}#settings">Event settings</a>
	</section>
{:else}
	<datalist id="company-options">
		{#each data.companies as company (company.name)}
			<option value={company.name}>
				{company.contacts ? plural(company.contacts, 'contact') : ''}
			</option>
		{/each}
	</datalist>

	{#if adding}
		<AddGuests
			eventId={event.id}
			first={rows.length === 0}
			autofocus={focusAdd}
			onclose={() => (adding = false)}
		/>
	{/if}

	{#if rows.length === 0}
		{#if !adding}
			<section class="card empty rise">
				<div class="empty-icon"><ClipboardList size={30} /></div>
				<h2>Plan who you’re inviting</h2>
				<p class="muted">
					List people company by company, record each reply as it comes in, and see who turns up on
					the day.
				</p>
				<button class="btn btn-primary btn-lg" onclick={openAdd}>
					<UserPlus size={20} /> Add people
				</button>
			</section>
		{/if}
	{:else}
		<section class="card summary">
			<div class="figures">
				<div class="figure">
					<p class="figure-label">Yes</p>
					<p class="hero-line">
						<span class="hero-value">{progress.yes.toLocaleString()}</span>
						{#if progress.target}
							<span class="target">/ {progress.target.toLocaleString()} target</span>
						{:else}
							<a class="target" href="/admin/events/{event.id}#settings">Set a target</a>
						{/if}
					</p>
					<p class="figure-sub muted">
						{live.length.toLocaleString()} on the list{#if counts.review}&nbsp;· {counts.review.toLocaleString()}
							to review{/if}
					</p>
				</div>
				<div class="figure">
					<p class="figure-label">Confirmed</p>
					<p class="figure-value">{progress.confirmed.toLocaleString()}</p>
					<p class="figure-sub muted">
						{#if counts.checked_in}{counts.checked_in.toLocaleString()} checked in{:else}registered
							or reconfirmed{/if}
					</p>
				</div>
			</div>
			{#if progress.target}
				<div
					class="bar"
					role="progressbar"
					aria-label="Yes replies against the target"
					aria-valuemin="0"
					aria-valuemax={progress.target}
					aria-valuenow={progress.yes}
				>
					<span class="fill" style="width: {percent}%"></span>
				</div>
			{/if}
		</section>

		<div class="toolbar">
			<label class="search">
				<Search size={17} />
				<span class="sr-only">Search the list</span>
				<input
					class="input"
					type="search"
					placeholder="Search names, companies, notes"
					bind:value={query}
				/>
			</label>
			<div class="chips" role="group" aria-label="Show">
				<button
					class="chip mine"
					aria-pressed={mine}
					disabled={!data.me}
					title={data.me ? `Rows owned by ${data.me}` : 'Pick your name first'}
					onclick={() => (mine = !mine)}
				>
					Mine
				</button>
				{#each shownChips as chip (chip)}
					<button class="chip" aria-pressed={chips.includes(chip)} onclick={() => toggleChip(chip)}>
						{CHIP_LABEL[chip]}
						<span class="chip-count">{counts[chip].toLocaleString()}</span>
					</button>
				{/each}
				<label class="chip toggle">
					<input type="checkbox" bind:checked={showSkipped} />
					Show skipped
				</label>
			</div>
		</div>

		{#if problem}<p class="banner banner-warn" role="alert">{problem}</p>{/if}

		{#each groups as group (group.key)}
			<section class="card group" class:blocked={group.blocked}>
				<header class="group-head">
					{#if renaming === group.key && group.id}
						<form
							class="rename"
							method="POST"
							action="?/rename"
							use:enhance={() =>
								async ({ result, update }) => {
									await update({ reset: false });
									if (result.type === 'success') renaming = null;
								}}
						>
							<input type="hidden" name="company" value={group.id} />
							<input
								class="input"
								name="to"
								value={group.name}
								required
								aria-label="Company name"
								use:focusSelect
								onkeydown={(e) => e.key === 'Escape' && (renaming = null)}
							/>
							<button class="btn btn-primary btn-sm">Save</button>
							<button type="button" class="btn btn-ghost btn-sm" onclick={() => (renaming = null)}>
								Cancel
							</button>
						</form>
					{:else}
						<div class="group-title">
							<h2>{group.name || 'No company'}</h2>
							{#if group.id}
								<button
									class="btn btn-ghost btn-icon btn-sm rename-btn"
									onclick={() => (renaming = group.key)}
									title="Rename company"
								>
									<Pencil size={14} /><span class="sr-only">Rename {group.name}</span>
								</button>
							{/if}
							{#if group.blocked}
								<span class="pill pill-warn" title={group.blocked_reason || 'Blocked company'}
									>Blocked</span
								>
							{/if}
						</div>
						<p class="group-meta muted">{groupSummary(group)}</p>
					{/if}
					<div class="group-tools">
						{#if group.id && data.team.length}
							<form
								class="owner-form"
								method="POST"
								action="?/companyOwner"
								use:enhance={() =>
									async ({ update }) =>
										update({ reset: false })}
							>
								<input type="hidden" name="company" value={group.id} />
								<label class="owner">
									<span class="sr-only">Owner of {group.name}</span>
									<select
										class="owner-select"
										name="owner"
										value={group.owner ?? ''}
										onchange={(e) => e.currentTarget.form?.requestSubmit()}
									>
										<option value="">No owner</option>
										{#each data.team as name (name)}<option value={name}>{name}</option>{/each}
									</select>
								</label>
							</form>
						{/if}
						{#if group.id}
							{#if group.blocked}
								<form
									method="POST"
									action="?/unblock"
									use:enhance={({ cancel }) => {
										if (!confirm(`Unblock ${group.name}? People there can be added again.`))
											cancel();
									}}
								>
									<input type="hidden" name="company" value={group.id} />
									<button class="btn btn-ghost btn-sm">Unblock</button>
								</form>
							{:else}
								<form
									method="POST"
									action="?/block"
									use:enhance={({ formData, cancel }) => {
										const reason = prompt(
											`Block ${group.name}: nobody there can be added, researched or messaged. Why?`,
											''
										);
										if (reason === null) {
											cancel();
											return;
										}
										formData.set('reason', reason);
									}}
								>
									<input type="hidden" name="company" value={group.id} />
									<button class="btn btn-ghost btn-sm" title="Block company">
										<Ban size={14} /> Block…
									</button>
								</form>
							{/if}
						{/if}
						{#if group.waiting > 1}
							<form method="POST" action="?/addAll" use:enhance>
								<input type="hidden" name="companyKey" value={group.key} />
								<button class="btn btn-soft btn-sm"
									><UserPlus size={15} /> Add all {group.waiting}</button
								>
							</form>
							<form method="POST" action="?/skipAll" use:enhance>
								<input type="hidden" name="companyKey" value={group.key} />
								<button class="btn btn-ghost btn-sm">Skip all</button>
							</form>
						{/if}
					</div>
				</header>
				<ul class="guests">
					{#each group.shown as row (row.id)}
						<GuestRow
							{row}
							reply={replyOf(row)}
							{event}
							team={data.team}
							errors={editErrors?.editId === row.id ? editErrors.editErrors : undefined}
							values={editErrors?.editId === row.id ? editErrors.editValues : null}
							onreply={(reply) => beginReply(row.id, reply)}
							ontouch={afterTouch}
						/>
					{/each}
				</ul>
				{#if !filtering}<QuickAdd company={group.name} />{/if}
			</section>
		{/each}

		{#if filtering && !groups.length}
			<div class="card no-match">
				<p class="muted">
					{q ? `No one matches “${query.trim()}”` : 'No one here'}{chips.length
						? ` under ${chips.map((c) => CHIP_LABEL[c]).join(', ')}`
						: ''}{mine ? ' of yours' : ''}.
				</p>
				<button
					class="btn btn-secondary btn-sm"
					onclick={() => {
						query = '';
						chips = [];
						mine = false;
					}}>Show everyone</button
				>
			</div>
		{/if}
	{/if}
{/if}

<style>
	.back {
		margin: -8px 0 12px -10px;
	}

	.head {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		flex-wrap: wrap;
		gap: 16px;
		margin-bottom: 20px;
	}

	.title {
		display: grid;
		gap: 8px;
	}

	.status {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}

	h1 {
		font-size: clamp(28px, 4vw, 38px);
		font-weight: 800;
		letter-spacing: -0.035em;
	}

	.head-actions {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
	}

	.summary {
		display: grid;
		gap: 18px;
		padding: 20px;
		margin-bottom: 4px;
		background:
			radial-gradient(
				120% 140% at 100% 0%,
				color-mix(in oklab, var(--aurora-1) 12%, transparent),
				transparent 60%
			),
			var(--surface);
	}

	.figures {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 16px 40px;
	}

	.figure {
		display: grid;
		gap: 6px;
		align-content: start;
	}

	.figure-label {
		font-size: 14px;
		font-weight: 650;
		color: var(--text-2);
	}

	.hero-line {
		display: flex;
		align-items: baseline;
		gap: 10px;
	}

	.hero-value {
		font-size: 60px;
		font-weight: 700;
		letter-spacing: -0.045em;
		line-height: 1;
	}

	.target {
		font-size: 18px;
		font-weight: 650;
		color: var(--text-2);
	}

	a.target {
		font-size: 14px;
	}

	.figure-value {
		font-size: 34px;
		font-weight: 700;
		letter-spacing: -0.03em;
		line-height: 1;
	}

	.figure-sub {
		font-size: 14px;
	}

	.bar {
		height: 12px;
		border-radius: 6px;
		background: var(--surface-3);
		overflow: hidden;
	}

	.fill {
		display: block;
		height: 100%;
		border-radius: 6px;
		background: var(--grad);
		transition: width 0.35s cubic-bezier(0.2, 0.8, 0.2, 1);
	}

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px 14px;
		padding: 14px 0;
		margin-bottom: 4px;
	}

	.search {
		position: relative;
		display: flex;
		align-items: center;
		color: var(--muted);
		flex: 1 1 260px;
		max-width: 340px;
	}

	.search :global(svg) {
		position: absolute;
		left: 12px;
		pointer-events: none;
	}

	.search .input {
		height: 40px;
		padding-left: 38px;
	}

	.chips {
		display: flex;
		gap: 6px;
		overflow-x: auto;
		scrollbar-width: none;
		max-width: 100%;
	}

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

	.chip[aria-pressed='true'],
	.chip.toggle:has(input:checked) {
		background: var(--brand-soft);
		border-color: color-mix(in oklab, var(--brand) 55%, transparent);
		color: var(--brand-text);
	}

	.chip.mine {
		border-style: dashed;
	}

	.chip.toggle input {
		width: 14px;
		height: 14px;
		margin: 0;
		accent-color: var(--brand);
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

	.banner {
		margin-bottom: 14px;
	}

	.group {
		overflow: hidden;
		margin-bottom: 14px;
	}

	.group.blocked {
		border-color: color-mix(in oklab, var(--warn) 40%, var(--border));
	}

	.group-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 4px 16px;
		min-height: 58px;
		padding: 10px 16px 10px 20px;
	}

	.group-title {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
	}

	.group-title h2 {
		font-size: 17px;
	}

	.group-meta {
		font-size: 13.5px;
	}

	.group-tools {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-left: auto;
	}

	.owner-select {
		height: 32px;
		padding: 0 8px;
		border-radius: 999px;
		border: 1px solid var(--border-strong);
		background: var(--surface);
		font-size: 13.5px;
		font-weight: 600;
		color: var(--text-2);
	}

	.rename-btn {
		--h: 32px;
		opacity: 0;
		transition: opacity 0.15s ease;
	}

	.group-head:hover .rename-btn,
	.rename-btn:focus-visible {
		opacity: 1;
	}

	@media (hover: none) {
		.rename-btn {
			opacity: 1;
		}
	}

	.rename {
		display: flex;
		align-items: center;
		gap: 8px;
		flex: 1;
		max-width: 520px;
	}

	.rename .input {
		height: 38px;
	}

	.guests {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.no-match {
		display: grid;
		justify-items: center;
		gap: 12px;
		padding: 36px 16px;
		text-align: center;
	}

	.empty {
		display: grid;
		justify-items: center;
		text-align: center;
		gap: 12px;
		padding: 56px 24px;
		max-width: 620px;
		margin: 24px auto 0;
	}

	.empty h2 {
		font-size: 24px;
	}

	.empty p {
		max-width: 440px;
		margin-bottom: 8px;
	}

	.empty-icon {
		display: grid;
		place-items: center;
		width: 72px;
		height: 72px;
		border-radius: 22px;
		background: var(--grad);
		color: #fff;
		box-shadow: var(--glow);
		margin-bottom: 6px;
	}

	@media (min-width: 900px) {
		/* The search and chips stay in reach down a long list. */
		.toolbar {
			position: sticky;
			top: 64px;
			z-index: 5;
			background: color-mix(in oklab, var(--bg) 88%, transparent);
			backdrop-filter: blur(12px);
			-webkit-backdrop-filter: blur(12px);
		}
	}

	@media (max-width: 560px) {
		.hero-value {
			font-size: 52px;
		}

		.search {
			max-width: none;
		}

		.group-tools {
			margin-left: 0;
			flex-basis: 100%;
		}
	}
</style>
