<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { onMount, tick, untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
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
		isDue,
		matchesChip,
		type Chip,
		type PeopleRow,
		type Reply
	} from '$lib/people';
	import { formatDateTime, formatDay } from '$lib/time';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Ban from '@lucide/svelte/icons/ban';
	import Building2 from '@lucide/svelte/icons/building-2';
	import ListChecks from '@lucide/svelte/icons/list-checks';
	import ListOrdered from '@lucide/svelte/icons/list-ordered';
	import CalendarPlus from '@lucide/svelte/icons/calendar-plus';
	import ClipboardList from '@lucide/svelte/icons/clipboard-list';
	import Check from '@lucide/svelte/icons/check';
	import Download from '@lucide/svelte/icons/download';
	import Handshake from '@lucide/svelte/icons/handshake';
	import Link from '@lucide/svelte/icons/link';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Search from '@lucide/svelte/icons/search';
	import Send from '@lucide/svelte/icons/send';
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
	const today = $derived(view?.today ?? { start: 0, end: 0 });

	// An empty list opens straight onto the form that fills it.
	// svelte-ignore state_referenced_locally
	let adding = $state(!!data.view && data.view.rows.length === 0);
	let focusAdd = $state(false);
	let query = $state('');
	// Default chips: none before the event; who came and who didn't once it has ended (§4.2).
	// svelte-ignore state_referenced_locally
	let chips = $state<Chip[]>(data.view?.ended ? ['checked_in', 'no_show'] : []);
	let mine = $state(false);
	let due = $state(false);
	// One list sorted by what is due, or the company groups (§4.2). The phone starts on the
	// list of what is yours and due (D19) once a name is picked; a laptop keeps the groups.
	let flat = $state(false);
	let showSkipped = $state(false);
	let renaming = $state<string | null>(null);
	// The phone gets swipes and long-presses (D19); the hint shows until the first one lands.
	let phone = $state(false);
	let hintSeen = $state(true);
	const HINT_KEY = 'ep_swipe_hint';

	onMount(() => {
		phone = matchMedia('(max-width: 900px)').matches;
		if (data.me && data.view && phone) {
			mine = true;
			due = true;
			flat = true;
		}
		try {
			hintSeen = localStorage.getItem(HINT_KEY) === '1';
		} catch {
			hintSeen = false;
		}
	});

	function retireHint() {
		hintSeen = true;
		try {
			localStorage.setItem(HINT_KEY, '1');
		} catch {
			// Private mode: the hint comes back next time, which is harmless.
		}
	}

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
	const dueRows = $derived(rows.filter((r) => isDue(r, today)));
	const mineRows = $derived(
		rows.filter((r) => r.stage !== 'found' && !r.skipped_at && effectiveOwner(r) === data.me)
	);
	const mineDue = $derived(mineRows.filter((r) => isDue(r, today)).length);

	function toggleChip(chip: Chip) {
		chips = chips.includes(chip) ? chips.filter((c) => c !== chip) : [...chips, chip];
	}

	const q = $derived(query.trim().toLowerCase());
	const filtering = $derived(chips.length > 0 || mine || due || q !== '');

	function shows(r: PeopleRow) {
		const row = settled(r);
		if (row.skipped_at && !showSkipped) return false;
		if (chips.length && !chips.some((c) => matchesChip(row, c, ended))) return false;
		if (mine && effectiveOwner(row) !== data.me) return false;
		if (due && !isDue(row, today)) return false;
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

	// The flat list: soonest due first, then whoever has no date, each by name.
	const listed = $derived(
		rows
			.filter(shows)
			.sort(
				(a, b) =>
					(a.next_action_at ?? Infinity) - (b.next_action_at ?? Infinity) ||
					a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })
			)
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
			'blockError',
			'countryError',
			'removeError'
		] as const)
			if (key in form && typeof form[key] === 'string') return form[key];
		if ('refusedAll' in form && form.refusedAll?.length)
			return `Couldn’t add ${form.refusedAll.join(', ')}: locked or at a blocked company.`;
		return '';
	});
	const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;
	const people = (n: number) => `${n.toLocaleString()} ${n === 1 ? 'person' : 'people'}`;

	// The open registration link for the event (§4.6), for a channel where no row exists yet.
	let copiedLink = $state(false);
	let copiedTimer: ReturnType<typeof setTimeout> | undefined;
	async function copyGenericLink() {
		if (!data.genericLink) return;
		try {
			await navigator.clipboard.writeText(data.genericLink);
			copiedLink = true;
			clearTimeout(copiedTimer);
			copiedTimer = setTimeout(() => (copiedLink = false), 1500);
		} catch {
			prompt('Copy the registration link', data.genericLink);
		}
	}

	/* ───────────── Multi-select and bulk actions (§4.2, D22) ───────────── */

	let selecting = $state(false);
	const selected = new SvelteSet<number>();
	// Which verb is waiting for a "via": Mark invited, or Set stage → Invited.
	let asking = $state<'invited' | 'stage' | null>(null);
	let bulkForm = $state<HTMLFormElement | null>(null);

	const VIAS = [
		['whatsapp', 'WhatsApp'],
		['email', 'Email'],
		['linkedin', 'LinkedIn'],
		['other', 'Other']
	] as const;

	const shownRows = $derived(flat ? listed : groups.flatMap((g) => g.shown));
	const allShownSelected = $derived(
		shownRows.length > 0 && shownRows.every((r) => selected.has(r.id))
	);

	// A row that a chip, a search or a filter hides leaves the selection too: the bar acts
	// only on what can be seen. Tracks the shown rows alone, so selecting never re-runs it.
	$effect(() => {
		const shown = new Set(shownRows.map((r) => r.id));
		untrack(() => {
			for (const id of [...selected]) if (!shown.has(id)) selected.delete(id);
		});
	});

	function setSelected(ids: number[], on: boolean) {
		for (const id of ids)
			if (on) selected.add(id);
			else selected.delete(id);
	}

	function groupSelection(rows: PeopleRow[]) {
		const n = rows.filter((r) => selected.has(r.id)).length;
		return { all: n > 0 && n === rows.length, some: n > 0 && n < rows.length };
	}

	function stopSelecting() {
		selecting = false;
		selected.clear();
		asking = null;
	}

	/** Fills the bulk form's hidden fields and sends it; `ids` overrides the selection. */
	async function runBulk(
		action: string,
		fields: Record<string, string> = {},
		ids: number[] | null = null
	) {
		if (!bulkForm) return;
		if (ids) {
			selected.clear();
			setSelected(ids, true);
			await tick();
		}
		const set = (name: string, value: string) => {
			const input = bulkForm!.elements.namedItem(name);
			if (input instanceof HTMLInputElement) input.value = value;
		};
		set('action', action);
		set('via', fields.via ?? '');
		set('stage', fields.stage ?? '');
		bulkForm.requestSubmit();
	}

	function pickStage(stage: string) {
		if (stage === 'invited') asking = 'stage';
		else if (stage) runBulk('stage', { stage });
	}

	const copyTarget = $derived(form && 'bulk' in form && form.bulk?.to ? form.bulk.to : null);
	const bulkMessage = $derived.by(() => {
		if (!form || !('bulk' in form) || !form.bulk) return '';
		const { action, done, refused, to } = form.bulk;
		const verb: Record<string, string> = {
			shortlist: 'Shortlisted',
			skip: 'Skipped',
			invited: 'Marked invited',
			owner: 'Owner set on',
			stage: 'Stage set on',
			copy: `Copied${to ? ` to ${to.name}` : ''}`
		};
		const parts = [`${verb[action] ?? 'Done for'} ${people(done)}.`];
		if (refused.length)
			parts.push(
				`Not ${refused.length === 1 ? 'this one' : `these ${refused.length}`}: ${refused
					.map((r) => `${r.name} (${r.reason})`)
					.join(', ')}.`
			);
		return parts.join(' ');
	});

	// Long-press on a company header (phone): shortlist everyone waiting there, once confirmed.
	// A finger that drifts more than a few pixels is scrolling, not pressing.
	let pressTimer: ReturnType<typeof setTimeout> | undefined;
	let pressAt: { x: number; y: number } | null = null;
	function pressStart(
		e: PointerEvent,
		group: { name: string; rows: PeopleRow[]; waiting: number }
	) {
		if (!phone || !group.waiting) return;
		// Holding the header's checkbox or Rename button is a tap on it, not a press.
		if ((e.target as HTMLElement).closest('button, a, input, select')) return;
		clearTimeout(pressTimer);
		pressAt = { x: e.clientX, y: e.clientY };
		pressTimer = setTimeout(() => {
			const ids = group.rows.filter((r) => r.stage === 'found' && !r.skipped_at).map((r) => r.id);
			if (
				confirm(
					`Shortlist all ${ids.length} at ${group.name || 'no company'}? They become people on the list.`
				)
			) {
				retireHint();
				runBulk('shortlist', {}, ids);
			}
		}, 600);
	}
	function pressMove(e: PointerEvent) {
		if (pressAt && Math.hypot(e.clientX - pressAt.x, e.clientY - pressAt.y) > 8) pressEnd();
	}
	function pressEnd() {
		clearTimeout(pressTimer);
		pressAt = null;
	}
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
			{#if data.genericLink}
				<button
					class="btn btn-secondary"
					onclick={copyGenericLink}
					title="Copy the open registration link: anyone with it can register, and their row waits for the company owner"
				>
					{#if copiedLink}<Check size={17} /> Copied{:else}<Link size={17} /> Registration link{/if}
				</button>
			{/if}
			{#if live.length}
				<a class="btn btn-secondary" href="/admin/events/{event.id}/people.csv">
					<Download size={17} /> CSV
				</a>
				<!-- The co-hosts' list (D15): names only with the share consent, the rest as counts. -->
				{#if event.co_hosts.trim()}
					<a
						class="btn btn-secondary"
						href="/admin/events/{event.id}/partners.csv?when=before"
						title="For {event.co_hosts}: who said yes, by name only with their consent to share"
					>
						<Handshake size={17} /> Partner list · before
					</a>
					<a
						class="btn btn-secondary"
						href="/admin/events/{event.id}/partners.csv?when=after"
						title="For {event.co_hosts}: who checked in, by name only with their consent to share"
					>
						<Handshake size={17} /> Partner list · after
					</a>
				{/if}
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
					{#if data.me}
						<span class="chip-count">
							{mineRows.length.toLocaleString()}{#if mineDue}
								· {mineDue.toLocaleString()} due{/if}
						</span>
					{/if}
				</button>
				{#each shownChips as chip (chip)}
					<button class="chip" aria-pressed={chips.includes(chip)} onclick={() => toggleChip(chip)}>
						{CHIP_LABEL[chip]}
						<span class="chip-count">{counts[chip].toLocaleString()}</span>
					</button>
				{/each}
				<button
					class="chip"
					aria-pressed={due}
					title="Chases and reminders due today or earlier"
					onclick={() => (due = !due)}
				>
					Due
					<span class="chip-count">{dueRows.length.toLocaleString()}</span>
				</button>
				<label class="chip toggle">
					<input type="checkbox" bind:checked={showSkipped} />
					Show skipped
				</label>
			</div>
			<div class="layout" role="group" aria-label="Layout">
				<button
					class="btn btn-ghost btn-icon btn-sm"
					aria-pressed={selecting}
					title="Select rows for a bulk action"
					onclick={() => (selecting ? stopSelecting() : (selecting = true))}
				>
					<ListChecks size={17} /><span class="sr-only">Select rows</span>
				</button>
				<button
					class="btn btn-ghost btn-icon btn-sm"
					aria-pressed={!flat}
					title="By company"
					onclick={() => (flat = false)}
				>
					<Building2 size={17} /><span class="sr-only">By company</span>
				</button>
				<button
					class="btn btn-ghost btn-icon btn-sm"
					aria-pressed={flat}
					title="One list, soonest due first"
					onclick={() => (flat = true)}
				>
					<ListOrdered size={17} /><span class="sr-only">One list, soonest due first</span>
				</button>
			</div>
		</div>

		{#if problem}<p class="banner banner-warn" role="alert">{problem}</p>{/if}
		{#if form && 'bulkError' in form && form.bulkError}
			<p class="banner banner-warn" role="alert">{form.bulkError}</p>
		{/if}
		{#if bulkMessage}
			<p class="banner" role="status">
				{bulkMessage}
				{#if copyTarget}
					<a href="/admin/events/{copyTarget.id}/people">Open {copyTarget.name}</a>
				{/if}
			</p>
		{/if}
		{#if phone && !hintSeen && counts.review}
			<p class="banner hint" role="note">
				Swipe a row under To review to the right to add them, or left to skip. Hold a company name
				to add everyone waiting there.
				<button class="btn btn-ghost btn-sm" onclick={retireHint}>Got it</button>
			</p>
		{/if}

		{#if flat}
			{#if listed.length}
				<section class="card group">
					<ul class="guests">
						{#each listed as row (row.id)}
							<GuestRow
								{row}
								reply={replyOf(row)}
								{event}
								{today}
								team={data.team}
								showCompany
								errors={editErrors?.editId === row.id ? editErrors.editErrors : undefined}
								values={editErrors?.editId === row.id ? editErrors.editValues : null}
								onreply={(reply) => beginReply(row.id, reply)}
								ontouch={afterTouch}
								selectable={selecting}
								selected={selected.has(row.id)}
								onselect={(on) => setSelected([row.id], on)}
								swipe={phone}
								onswipe={retireHint}
							/>
						{/each}
					</ul>
				</section>
			{/if}
		{:else}
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
								<button
									type="button"
									class="btn btn-ghost btn-sm"
									onclick={() => (renaming = null)}
								>
									Cancel
								</button>
							</form>
						{:else}
							<!-- The long-press is a phone shortcut for "Add all" below and the select-all box,
							     never the only way, so the header stays a plain heading. -->
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								class="group-title"
								class:pressable={phone && group.waiting > 0}
								onpointerdown={(e) => pressStart(e, group)}
								onpointerup={pressEnd}
								onpointercancel={pressEnd}
								onpointerleave={pressEnd}
								onpointermove={pressMove}
								oncontextmenu={(e) => phone && group.waiting > 0 && e.preventDefault()}
							>
								{#if selecting}
									{@const sel = groupSelection(group.shown)}
									<input
										class="pick"
										type="checkbox"
										checked={sel.all}
										indeterminate={sel.some}
										aria-label="Select everyone at {group.name || 'no company'}"
										onchange={(e) =>
											setSelected(
												group.shown.map((r) => r.id),
												e.currentTarget.checked
											)}
									/>
								{/if}
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
							{#if group.id}
								<!-- The company's phone country (D14): how its local numbers are read, and the language
							     its people are written to in. Empty follows the event. -->
								<form
									class="country-form"
									method="POST"
									action="?/companyCountry"
									use:enhance={() =>
										async ({ update }) =>
											update({ reset: false })}
								>
									<input type="hidden" name="company" value={group.id} />
									<label class="country">
										<span class="sr-only">Phone country for {group.name}</span>
										<select
											class="owner-select"
											name="country"
											value={group.phone_country ?? ''}
											title="Phone country: reads local numbers and picks the message language"
											onchange={(e) => e.currentTarget.form?.requestSubmit()}
										>
											<option value="">Event’s country</option>
											<option value="ID">+62 Indonesia</option>
											<option value="MY">+60 Malaysia</option>
										</select>
									</label>
								</form>
							{/if}
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
								{today}
								team={data.team}
								errors={editErrors?.editId === row.id ? editErrors.editErrors : undefined}
								values={editErrors?.editId === row.id ? editErrors.editValues : null}
								onreply={(reply) => beginReply(row.id, reply)}
								ontouch={afterTouch}
								selectable={selecting}
								selected={selected.has(row.id)}
								onselect={(on) => setSelected([row.id], on)}
								swipe={phone}
								onswipe={retireHint}
							/>
						{/each}
					</ul>
					{#if !filtering}<QuickAdd company={group.name} />{/if}
				</section>
			{/each}
		{/if}

		{#if filtering && !(flat ? listed.length : groups.length)}
			<div class="card no-match">
				<p class="muted">
					{q ? `No one matches “${query.trim()}”` : 'No one here'}{chips.length
						? ` under ${chips.map((c) => CHIP_LABEL[c]).join(', ')}`
						: ''}{due ? ' due today' : ''}{mine ? ' of yours' : ''}.
				</p>
				<button
					class="btn btn-secondary btn-sm"
					onclick={() => {
						query = '';
						chips = [];
						mine = false;
						due = false;
					}}>Show everyone</button
				>
			</div>
		{/if}

		<!-- The bulk form is always mounted: the phone's long-press sends through it too. -->
		<form
			class="bulk"
			class:open={selecting}
			method="POST"
			action="?/bulk"
			bind:this={bulkForm}
			use:enhance={({ formData, cancel }) => {
				const action = formData.get('action');
				const to = data.events.find((e) => e.id === formData.get('to'));
				if (
					action === 'copy' &&
					(!to || !confirm(`Copy ${people(selected.size)} to ${to.name}?`))
				) {
					cancel();
					return;
				}
				return async ({ result, update }) => {
					await update({ reset: false });
					if (result.type === 'success') {
						selected.clear();
						asking = null;
					}
				};
			}}
		>
			<input type="hidden" name="action" value="" />
			<input type="hidden" name="via" value="" />
			<input type="hidden" name="stage" value="" />
			{#each [...selected] as id (id)}
				<input type="hidden" name="ids" value={id} />
			{/each}
			{#if selecting}
				<div class="bulk-bar" role="region" aria-label="Bulk actions">
					<div class="bulk-count">
						<strong>{selected.size.toLocaleString()}</strong> selected
						<button
							type="button"
							class="btn btn-ghost btn-sm"
							onclick={() =>
								setSelected(
									shownRows.map((r) => r.id),
									!allShownSelected
								)}
						>
							{allShownSelected ? 'Clear all' : 'Select all shown'}
						</button>
					</div>
					{#if asking}
						<div class="bulk-ask">
							<span class="muted">Invited via</span>
							{#each VIAS as [via, label] (via)}
								<button
									type="button"
									class="btn btn-soft btn-sm"
									onclick={() =>
										runBulk(asking === 'stage' ? 'stage' : 'invited', { via, stage: 'invited' })}
								>
									{label}
								</button>
							{/each}
							<button type="button" class="btn btn-ghost btn-sm" onclick={() => (asking = null)}>
								Cancel
							</button>
						</div>
					{:else}
						<div class="bulk-actions">
							<button
								type="button"
								class="btn btn-soft btn-sm"
								disabled={!selected.size}
								onclick={() => runBulk('shortlist')}
							>
								<UserPlus size={15} /> Shortlist
							</button>
							<button
								type="button"
								class="btn btn-ghost btn-sm"
								disabled={!selected.size}
								onclick={() => runBulk('skip')}
							>
								Skip
							</button>
							<button
								type="button"
								class="btn btn-ghost btn-sm"
								disabled={!selected.size}
								onclick={() => (asking = 'invited')}
							>
								<Send size={15} /> Mark invited…
							</button>
							{#if data.team.length}
								<label class="bulk-select">
									<span class="sr-only">Set owner</span>
									<select
										class="owner-select"
										name="owner"
										disabled={!selected.size}
										onchange={(e) => {
											runBulk('owner');
											e.currentTarget.selectedIndex = 0;
										}}
									>
										<option value="" disabled selected>Set owner…</option>
										<option value="">No owner (company’s)</option>
										{#each data.team as name (name)}<option value={name}>{name}</option>{/each}
									</select>
								</label>
							{/if}
							<label class="bulk-select">
								<span class="sr-only">Set stage</span>
								<select
									class="owner-select"
									disabled={!selected.size}
									onchange={(e) => {
										pickStage(e.currentTarget.value);
										e.currentTarget.selectedIndex = 0;
									}}
								>
									<option value="" disabled selected>Set stage…</option>
									<option value="shortlisted">Shortlisted</option>
									<option value="invited">Invited</option>
								</select>
							</label>
							{#if data.events.length}
								<label class="bulk-select">
									<span class="sr-only">Copy to another event</span>
									<select
										class="owner-select"
										name="to"
										disabled={!selected.size}
										onchange={(e) => {
											// enhance reads the form as it submits, so the pick can go straight after.
											if (e.currentTarget.value) runBulk('copy');
											e.currentTarget.selectedIndex = 0;
										}}
									>
										<option value="" disabled selected>Copy to event…</option>
										{#each data.events as e (e.id)}
											<option value={e.id}>{e.name} · {formatDay(e.starts_at, e.timezone)}</option>
										{/each}
									</select>
								</label>
							{/if}
						</div>
					{/if}
					<button type="button" class="btn btn-ghost btn-sm bulk-done" onclick={stopSelecting}>
						Done
					</button>
				</div>
			{/if}
		</form>
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

	.layout {
		display: flex;
		gap: 2px;
		margin-left: auto;
	}

	.layout .btn[aria-pressed='true'] {
		background: var(--brand-soft);
		color: var(--brand-text);
	}

	.chip[aria-pressed='true'] .chip-count {
		color: inherit;
	}

	.banner {
		margin-bottom: 14px;
	}

	.banner a {
		margin-left: 6px;
		font-weight: 650;
	}

	.banner.hint {
		display: flex;
		align-items: center;
		gap: 8px 14px;
		flex-wrap: wrap;
	}

	.banner.hint .btn {
		margin-left: auto;
	}

	.pick {
		width: 18px;
		height: 18px;
		margin: 0;
		accent-color: var(--brand);
	}

	.group-title.pressable {
		touch-action: pan-y;
		user-select: none;
		-webkit-user-select: none;
	}

	/* The bulk bar (§4.2): fixed at the bottom while rows are being picked. */
	.bulk.open {
		padding-bottom: 88px;
	}

	.bulk-bar {
		position: fixed;
		left: 50%;
		bottom: 16px;
		translate: -50% 0;
		z-index: 20;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px 14px;
		width: min(100% - 32px, 1080px);
		padding: 10px 14px;
		border: 1px solid var(--border-strong);
		border-radius: 16px;
		background: color-mix(in oklab, var(--surface) 92%, transparent);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		box-shadow: var(--shadow-lg, 0 12px 32px rgba(0, 0, 0, 0.18));
	}

	.bulk-count {
		display: flex;
		align-items: center;
		gap: 8px;
		white-space: nowrap;
	}

	.bulk-actions,
	.bulk-ask {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 6px;
	}

	.bulk-done {
		margin-left: auto;
	}

	@media (max-width: 560px) {
		.bulk-bar {
			bottom: 8px;
			width: calc(100% - 16px);
			padding: 10px;
		}
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
