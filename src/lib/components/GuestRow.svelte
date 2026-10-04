<script lang="ts">
	import { enhance } from '$app/forms';
	import { greetingName, REPLY_LABEL } from '$lib/invitations';
	import { initials } from '$lib/names';
	import {
		effectiveOwner,
		isOverdue,
		KIND_LABEL,
		markers,
		menuKinds,
		nextActionLabel,
		STAGE_LABEL,
		type MessageKind,
		type PeopleRow,
		type Reply,
		type RowMessage,
		type Today
	} from '$lib/people';
	import { formatDay, formatDueDay, formatTime, localDate } from '$lib/time';
	import CalendarClock from '@lucide/svelte/icons/calendar-clock';
	import Ban from '@lucide/svelte/icons/ban';
	import Check from '@lucide/svelte/icons/check';
	import CircleQuestionMark from '@lucide/svelte/icons/circle-question-mark';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import Flag from '@lucide/svelte/icons/flag-off';
	import Link from '@lucide/svelte/icons/link';
	import Mail from '@lucide/svelte/icons/mail';
	import Merge from '@lucide/svelte/icons/merge';
	import MessageCircle from '@lucide/svelte/icons/message-circle';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Undo2 from '@lucide/svelte/icons/undo-2';
	import UserPlus from '@lucide/svelte/icons/user-plus';
	import X from '@lucide/svelte/icons/x';

	interface EditValues {
		name: string;
		company: string;
		jobTitle: string;
		email: string;
		phone: string;
		linkedin: string;
	}

	interface Candidate {
		id: string;
		name: string;
		company: string;
		email: string | null;
	}

	interface Props {
		row: PeopleRow;
		/** What to show, which may run ahead of `row.reply` while a change is saving. */
		reply: Reply;
		event: { id: string; timezone: string };
		/** Today in the event's zone, for "due today" and "overdue" (§4.2). */
		today: Today;
		/** Team names to pick an owner from; empty hides the control. */
		team: string[];
		/** On a flat list (the phone's due view) the company goes on the details line. */
		showCompany?: boolean;
		/** Set after a failed save of this row's details. */
		errors?: Record<string, string | undefined>;
		values?: EditValues | null;
		/** Called as a reply is sent; returns a function to call once it has saved. */
		onreply: (reply: Reply) => () => void;
		/** Called as a message link opens, so the page can fetch the stage it moved to. */
		ontouch: () => void;
	}

	let {
		row,
		reply,
		event,
		today,
		team,
		showCompany = false,
		errors = {},
		values = null,
		onreply,
		ontouch
	}: Props = $props();

	let editing = $state(false);
	let merging = $state(false);
	let settingDue = $state(false);
	let copied = $state(false);
	let menu = $state<HTMLDetailsElement | null>(null);
	let candidates = $state<Candidate[]>([]);
	let candidateQuery = $state('');

	const CHOICES = [
		{ reply: 'yes', icon: Check },
		{ reply: 'maybe', icon: CircleQuestionMark },
		{ reply: 'no', icon: X }
	] as const;

	// What the prepared message does, so the button can say so (§7).
	const PURPOSE: Record<RowMessage['kind'], string> = {
		invitation: 'Invite',
		chase: 'Chase',
		reminder: 'Remind',
		thanks_yes: 'Thank',
		followup_maybe: 'Follow up with',
		thanks_no: 'Thank',
		legacy_notice: 'Notify'
	};

	const found = $derived(row.stage === 'found');
	const details = $derived(
		[showCompany ? row.company : '', row.job_title, row.email, row.phone].filter(Boolean)
	);
	const first = $derived(greetingName(row.name));

	// The message menu (§7): the page carries the suggested kind's text, rendered on the server
	// for the row's language with the opt-out line on it; another kind is fetched when picked.
	let chosen = $state<MessageKind | null>(null);
	let fetched = $state<RowMessage | null>(null);
	const kind = $derived(chosen ?? row.suggested_kind);
	const message = $derived(
		kind === row.suggested_kind ? row.message : fetched?.kind === kind ? fetched : null
	);
	const purpose = $derived(PURPOSE[kind]);
	const loading = $derived(chosen !== null && message === null && !!row.message);

	$effect(() => {
		if (chosen === null || chosen === row.suggested_kind) return;
		const want = chosen;
		const controller = new AbortController();
		(async () => {
			try {
				const url = `/admin/events/${event.id}/people/message.json?id=${row.id}&kind=${want}`;
				const res = await fetch(url, { signal: controller.signal });
				if (!res.ok) return;
				const { message } = (await res.json()) as { message: RowMessage | null };
				if (message) fetched = message;
			} catch {
				// Aborted by another pick, or offline: the buttons wait.
			}
		})();
		return () => controller.abort();
	});

	// What the rules say is next (D20), and whether that is the organizer's own date.
	const dueLabel = $derived(nextActionLabel(row, today, (ts) => formatDueDay(ts, event.timezone)));
	const overdue = $derived(isOverdue(row, today));
	const dueToday = $derived(
		row.next_action_at !== null && !overdue && row.next_action_at <= today.end
	);
	const canHaveDue = $derived(
		!found && row.stage !== 'checked_in' && !row.skipped_at && !row.locked_at
	);
	const owner = $derived(effectiveOwner(row));
	const marks = $derived(markers(row, (ts) => formatDay(ts, event.timezone)));
	const viaLinkedin = $derived(row.invited_via === 'linkedin');
	const fields = $derived<EditValues>(
		values ?? {
			name: row.name,
			company: row.company,
			jobTitle: row.job_title,
			email: row.email ?? '',
			phone: row.phone ?? '',
			linkedin: row.linkedin ?? ''
		}
	);

	function focus(node: HTMLInputElement) {
		node.focus();
		node.select();
	}

	function closeOnEscape(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			editing = false;
			merging = false;
			settingDue = false;
		}
	}

	function closeMenu() {
		if (menu) menu.open = false;
	}

	// Saved on leaving the field (Enter leaves it too), and only when it actually changed.
	function saveNote(e: FocusEvent & { currentTarget: HTMLInputElement }) {
		const input = e.currentTarget;
		if (input.value.replace(/\s+/g, ' ').trim() !== row.note) input.form?.requestSubmit();
	}

	function noteKeys(e: KeyboardEvent & { currentTarget: HTMLInputElement }) {
		if (e.key === 'Enter') {
			e.preventDefault();
			e.currentTarget.blur();
		} else if (e.key === 'Escape') {
			e.currentTarget.value = row.note;
			e.currentTarget.blur();
		}
	}

	// The personal registration link (§7) goes on the clipboard, to paste into any channel.
	let copiedTimer: ReturnType<typeof setTimeout> | undefined;
	async function copyLink() {
		if (!row.registration_link) return;
		try {
			await navigator.clipboard.writeText(row.registration_link);
			copied = true;
			clearTimeout(copiedTimer);
			copiedTimer = setTimeout(() => (copied = false), 1500);
		} catch {
			// Clipboard refused (http on a LAN laptop): the prompt still lets them copy by hand.
			prompt('Copy the registration link', row.registration_link);
		}
	}

	// The link opens in WhatsApp or mail as usual; the beacon records the touch in parallel
	// so the stage moves without anything waiting on the server (§7, D9). It carries the kind
	// picked in the menu; the next suggestion starts fresh once the page data returns.
	function recordTouch(via: 'whatsapp' | 'email') {
		const data = new FormData();
		data.set('id', String(row.id));
		data.set('via', via);
		data.set('kind', kind);
		navigator.sendBeacon(`${location.pathname}?/touch`, data);
		chosen = null;
		ontouch();
	}

	// Survivor search for "Merge into…": the pool, minus this person.
	$effect(() => {
		const q = candidateQuery.trim();
		if (!merging || q.length < 2) {
			candidates = [];
			return;
		}
		const controller = new AbortController();
		const timer = setTimeout(async () => {
			try {
				const url = `/admin/events/${event.id}/people/people.json?q=${encodeURIComponent(q)}`;
				const res = await fetch(url, { signal: controller.signal });
				if (!res.ok) return;
				const { people } = (await res.json()) as { people: Candidate[] };
				candidates = people.filter((p) => p.id !== row.person_id);
			} catch {
				// Aborted by the next keystroke, or offline: keep what's showing.
			}
		}, 200);
		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	});
</script>

<li class="row" class:editing={editing || merging} class:found class:skipped={!!row.skipped_at}>
	{#if editing}
		<form
			class="edit"
			method="POST"
			action="?/update"
			use:enhance={() =>
				async ({ result, update }) => {
					await update({ reset: false });
					if (result.type === 'success') editing = false;
				}}
		>
			<input type="hidden" name="id" value={row.id} />
			<div class="edit-grid">
				<div class="field">
					<label class="label" for="name-{row.id}">Name</label>
					<input
						class="input"
						id="name-{row.id}"
						name="name"
						onkeydown={closeOnEscape}
						value={fields.name}
						required
						use:focus
						aria-invalid={errors.name ? 'true' : undefined}
					/>
					{#if errors.name}<p class="error-text">{errors.name}</p>{/if}
				</div>
				<div class="field">
					<label class="label" for="title-{row.id}">Job title</label>
					<input
						class="input"
						id="title-{row.id}"
						name="jobTitle"
						onkeydown={closeOnEscape}
						value={fields.jobTitle}
					/>
				</div>
				<div class="field">
					<label class="label" for="company-{row.id}">Company</label>
					<input
						class="input"
						id="company-{row.id}"
						name="company"
						onkeydown={closeOnEscape}
						list="company-options"
						autocomplete="off"
						value={fields.company}
					/>
				</div>
				<div class="field">
					<label class="label" for="email-{row.id}">Email</label>
					<input
						class="input"
						id="email-{row.id}"
						name="email"
						onkeydown={closeOnEscape}
						type="email"
						value={fields.email}
						aria-invalid={errors.email ? 'true' : undefined}
					/>
					{#if errors.email}<p class="error-text">{errors.email}</p>{/if}
				</div>
				<div class="field">
					<label class="label" for="phone-{row.id}">Mobile</label>
					<input
						class="input"
						id="phone-{row.id}"
						name="phone"
						onkeydown={closeOnEscape}
						type="tel"
						value={fields.phone}
					/>
				</div>
				<div class="field">
					<label class="label" for="linkedin-{row.id}">LinkedIn</label>
					<input
						class="input"
						id="linkedin-{row.id}"
						name="linkedin"
						onkeydown={closeOnEscape}
						placeholder="linkedin.com/in/…"
						value={fields.linkedin}
						aria-invalid={errors.linkedin ? 'true' : undefined}
					/>
					{#if errors.linkedin}<p class="error-text">{errors.linkedin}</p>{/if}
				</div>
			</div>
			<div class="edit-actions">
				<span class="spacer"></span>
				<button type="button" class="btn btn-ghost btn-sm" onclick={() => (editing = false)}>
					Cancel
				</button>
				<button class="btn btn-primary btn-sm">Save</button>
			</div>
		</form>
	{:else if merging}
		<form
			class="edit"
			method="POST"
			action="?/merge"
			use:enhance={({ formData, cancel }) => {
				const who = candidates.find((c) => c.id === formData.get('survivor'));
				if (
					!who ||
					!confirm(`Merge ${row.name} into ${who.name}? ${row.name}’s record is deleted.`)
				)
					cancel();
				return async ({ result, update }) => {
					await update({ reset: false });
					if (result.type === 'success') merging = false;
				};
			}}
		>
			<input type="hidden" name="id" value={row.id} />
			<div class="field">
				<label class="label" for="merge-{row.id}">
					Merge {row.name} into… <span class="optional">(the other record stays)</span>
				</label>
				<input
					class="input"
					id="merge-{row.id}"
					placeholder="Search by name, email or company"
					autocomplete="off"
					bind:value={candidateQuery}
					onkeydown={closeOnEscape}
					use:focus
				/>
			</div>
			{#if candidates.length}
				<div class="candidates">
					{#each candidates as c (c.id)}
						<label class="candidate">
							<input type="radio" name="survivor" value={c.id} required />
							<span class="candidate-name">{c.name}</span>
							<span class="candidate-meta">{[c.company, c.email].filter(Boolean).join(' · ')}</span>
						</label>
					{/each}
				</div>
			{:else if candidateQuery.trim().length >= 2}
				<p class="hint">No one else matches.</p>
			{/if}
			<div class="edit-actions">
				<span class="spacer"></span>
				<button type="button" class="btn btn-ghost btn-sm" onclick={() => (merging = false)}>
					Cancel
				</button>
				<button class="btn btn-primary btn-sm" disabled={!candidates.length}>
					<Merge size={15} /> Merge
				</button>
			</div>
		</form>
	{:else}
		<div class="person">
			<span class="avatar" aria-hidden="true">{initials(row.name)}</span>
			<div class="who">
				<div class="name-line">
					<span class="person-name">{row.name}</span>
					{#if row.stage === 'checked_in'}
						<span class="pill pill-good tiny">
							<Check size={12} strokeWidth={3} /> Checked in{#if row.checked_in_at}
								{formatTime(row.checked_in_at, event.timezone)}{/if}
						</span>
					{:else if row.skipped_at}
						<span class="pill tiny">Skipped</span>
					{:else if row.stage === 'confirmed'}
						<span class="pill pill-good tiny">Confirmed</span>
					{:else if row.stage === 'invited'}
						<span class="pill pill-brand tiny">Invited</span>
					{:else if !found}
						<span class="pill tiny">{STAGE_LABEL[row.stage]}</span>
					{/if}
					{#each marks as m (m.key)}
						{#if m.key === 'chased'}
							<form
								method="POST"
								action="?/untouch"
								use:enhance={({ cancel }) => {
									if (!confirm(`Undo the last message recorded for ${row.name}?`)) cancel();
								}}
							>
								<input type="hidden" name="id" value={row.id} />
								<button class="pill tiny marker muted-tone" title="Undo the latest touch">
									{m.label}
									<Undo2 size={11} />
								</button>
							</form>
						{:else}
							<span class="pill tiny marker {m.tone}-tone">{m.label}</span>
						{/if}
					{/each}
				</div>
				{#if details.length || row.linkedin || (found && row.source_url)}
					<p class="details">
						{details.join(' · ')}{#if row.linkedin}{details.length ? ' · ' : ''}<a
								href={row.linkedin}
								target="_blank"
								rel="noreferrer"
								title="Open {first}’s LinkedIn profile">LinkedIn</a
							>{/if}{#if found && row.source_url}{details.length || row.linkedin ? ' · ' : ''}<a
								href={row.source_url}
								target="_blank"
								rel="noreferrer"
								>Source: {new URL(row.source_url).hostname.replace(/^www\./, '')}
								<ExternalLink size={11} /></a
							>{/if}
					</p>
				{/if}
				{#if found && row.reason}<p class="reason">{row.reason}</p>{/if}
				{#if settingDue}
					<!-- The organizer's own date (§4.2): kept until cleared, whatever the rules say. -->
					<form
						class="due-form"
						method="POST"
						action="?/due"
						use:enhance={() =>
							async ({ result, update }) => {
								await update({ reset: false });
								if (result.type === 'success') settingDue = false;
							}}
					>
						<input type="hidden" name="id" value={row.id} />
						<label class="sr-only" for="due-{row.id}">Due date for {row.name}</label>
						<input
							class="input due-input"
							id="due-{row.id}"
							type="date"
							name="date"
							value={row.next_action_at === null
								? ''
								: localDate(row.next_action_at, event.timezone)}
							onkeydown={closeOnEscape}
							use:focus
						/>
						<button class="btn btn-primary btn-sm">Save</button>
						{#if row.next_action_overridden}
							<button
								class="btn btn-ghost btn-sm"
								name="clear"
								value="1"
								title="Back to the date the chase rules compute"
							>
								Use the rules
							</button>
						{/if}
						<button type="button" class="btn btn-ghost btn-sm" onclick={() => (settingDue = false)}>
							Cancel
						</button>
					</form>
				{:else if dueLabel && canHaveDue}
					<button
						type="button"
						class="due"
						class:overdue
						class:today={dueToday}
						class:own={row.next_action_overridden}
						title={row.next_action_overridden
							? 'Your own date; click to change or clear it'
							: 'From the chase rules; click to set your own date'}
						onclick={() => (settingDue = true)}
					>
						<CalendarClock size={13} />
						{dueLabel}{#if row.next_action_overridden}
							· set by hand{/if}
					</button>
				{/if}
			</div>
		</div>

		{#if found}
			<div class="decide">
				{#if row.skipped_at}
					<form method="POST" action="?/unskip" use:enhance>
						<input type="hidden" name="id" value={row.id} />
						<button class="btn btn-ghost btn-sm"><Undo2 size={15} /> Unskip</button>
					</form>
				{:else}
					<form method="POST" action="?/shortlist" use:enhance>
						<input type="hidden" name="id" value={row.id} />
						<button class="btn btn-soft btn-sm" disabled={!!row.blocked_at || row.suppressed}>
							<UserPlus size={15} /> Add
						</button>
					</form>
					<form method="POST" action="?/skip" use:enhance>
						<input type="hidden" name="id" value={row.id} />
						<button class="btn btn-ghost btn-sm">Skip</button>
					</form>
				{/if}
			</div>
		{:else}
			<form
				class="note-form"
				method="POST"
				action="?/note"
				use:enhance={() =>
					async ({ update }) =>
						update({ reset: false })}
			>
				<input type="hidden" name="id" value={row.id} />
				<input
					class="note"
					name="note"
					value={row.note}
					placeholder="Add a note"
					aria-label="Note about {row.name}"
					maxlength="300"
					autocomplete="off"
					onkeydown={noteKeys}
					onblur={saveNote}
				/>
			</form>

			<form
				class="reply-form"
				method="POST"
				action="?/reply"
				use:enhance={({ formData }) => {
					const settle = onreply(formData.get('reply') as Reply);
					return async ({ update }) => {
						await update({ reset: false });
						settle();
					};
				}}
			>
				<input type="hidden" name="id" value={row.id} />
				<div class="reply" role="group" aria-label="Reply from {row.name}">
					{#each CHOICES as choice (choice.reply)}
						{@const on = reply === choice.reply}
						<button
							class="choice {choice.reply}"
							name="reply"
							value={on ? 'pending' : choice.reply}
							aria-pressed={on}
							title={on ? 'Click again to clear the reply' : undefined}
						>
							<choice.icon size={16} />
							<span>{REPLY_LABEL[choice.reply]}</span>
						</button>
					{/each}
				</div>
			</form>
		{/if}

		<div class="actions">
			{#if !found && team.length}
				<form
					class="owner-form"
					method="POST"
					action="?/owner"
					use:enhance={() =>
						async ({ update }) =>
							update({ reset: false })}
				>
					<input type="hidden" name="id" value={row.id} />
					<label class="owner" title={owner ? `Owner: ${owner}` : 'No owner yet'}>
						<span class="owner-avatar" class:unset={!owner} aria-hidden="true">
							{owner ? initials(owner) : '?'}
						</span>
						<span class="sr-only">Owner of {row.name}</span>
						<select
							class="owner-select"
							name="owner"
							value={row.owner ?? ''}
							onchange={(e) => e.currentTarget.form?.requestSubmit()}
						>
							<option value="">
								{row.company_owner ? `${row.company_owner} (company)` : 'No owner'}
							</option>
							{#each team as name (name)}<option value={name}>{name}</option>{/each}
						</select>
					</label>
				</form>
			{/if}
			{#if !found && !row.skipped_at && row.message}
				<!-- Which message the buttons open (§7); the rules' suggestion is picked already. -->
				<label class="kind" title="Which message to send">
					<span class="sr-only">Message for {row.name}</span>
					<select
						class="kind-select"
						value={kind}
						onchange={(e) => (chosen = e.currentTarget.value as MessageKind)}
					>
						{#each menuKinds(row) as k (k)}
							<option value={k}>{KIND_LABEL[k]}{k === row.suggested_kind ? ' ·' : ''}</option>
						{/each}
					</select>
				</label>
			{/if}
			{#if loading}
				<span class="hint-text">…</span>
			{/if}
			{#if message?.whatsapp}
				<a
					class="btn btn-ghost btn-icon btn-sm"
					href={message.whatsapp}
					target="_blank"
					rel="noreferrer"
					title="{purpose} {first} on WhatsApp"
					onclick={() => recordTouch('whatsapp')}
				>
					<MessageCircle size={17} />
					<span class="sr-only">{purpose} {first} on WhatsApp</span>
				</a>
			{/if}
			{#if message?.email}
				<a
					class="btn btn-ghost btn-icon btn-sm"
					href={message.email}
					target="_blank"
					rel="noreferrer"
					title="{purpose} {first} by email"
					onclick={() => recordTouch('email')}
				>
					<Mail size={17} />
					<span class="sr-only">{purpose} {first} by email</span>
				</a>
			{/if}
			{#if message?.hint && !message.whatsapp && !message.email}
				<span class="hint-text" title={message.hint}>No message link</span>
			{/if}
			{#if row.registration_link && !row.skipped_at && !row.locked_at}
				<button
					type="button"
					class="btn btn-ghost btn-icon btn-sm copy-link"
					class:copied
					title={copied ? 'Copied' : `Copy ${first}’s registration link`}
					onclick={copyLink}
				>
					{#if copied}<Check size={17} />{:else}<Link size={17} />{/if}
					<span class="sr-only">{copied ? 'Copied' : `Copy ${first}’s registration link`}</span>
				</button>
			{/if}
			{#if !found && row.stage !== 'checked_in' && (row.stage === 'shortlisted' || viaLinkedin)}
				<form method="POST" action="?/invited" use:enhance>
					<input type="hidden" name="id" value={row.id} />
					<input type="hidden" name="on" value={viaLinkedin ? '0' : '1'} />
					<button
						class="btn btn-ghost btn-sm linkedin"
						aria-pressed={viaLinkedin}
						title={viaLinkedin
							? 'Recorded as invited on LinkedIn; click to undo'
							: 'Record that you invited them on LinkedIn'}
					>
						<span class="in" aria-hidden="true">in</span>
						<span class="linkedin-label"
							>{viaLinkedin ? 'Via LinkedIn' : 'Invited via LinkedIn'}</span
						>
					</button>
				</form>
			{/if}
			<details class="menu" bind:this={menu}>
				<summary class="btn btn-ghost btn-icon btn-sm" title="More">
					<Ellipsis size={17} /><span class="sr-only">More for {row.name}</span>
				</summary>
				<div class="menu-list">
					<button
						type="button"
						class="menu-item"
						onclick={() => {
							closeMenu();
							editing = true;
						}}
					>
						<Pencil size={15} /> Edit
					</button>
					{#if canHaveDue}
						<button
							type="button"
							class="menu-item"
							onclick={() => {
								closeMenu();
								settingDue = true;
							}}
						>
							<CalendarClock size={15} /> Due date…
						</button>
					{/if}
					{#if row.person_id}
						<button
							type="button"
							class="menu-item"
							onclick={() => {
								closeMenu();
								merging = true;
							}}
						>
							<Merge size={15} /> Merge into…
						</button>
					{/if}
					{#if row.needs_review}
						<form method="POST" action="?/reviewed" use:enhance={() => closeMenu()}>
							<input type="hidden" name="id" value={row.id} />
							<button class="menu-item"><Check size={15} /> Reviewed</button>
						</form>
					{/if}
					{#if row.person_id && row.d365_flagged}
						<form
							method="POST"
							action="?/unflag"
							use:enhance={({ cancel }) => {
								if (!confirm(`Clear the Dynamics 365 flags on ${row.name}? This is logged.`))
									cancel();
								closeMenu();
							}}
						>
							<input type="hidden" name="id" value={row.id} />
							<button class="menu-item"><Flag size={15} /> Clear D365 flags</button>
						</form>
					{/if}
					{#if !row.locked_at}
						<form
							method="POST"
							action="?/lock"
							use:enhance={({ formData, cancel }) => {
								const reason = prompt(
									`Don’t contact ${row.name} again. Why? (kept with the entry)`,
									''
								);
								if (reason === null) {
									cancel();
									return;
								}
								formData.set('reason', reason);
								closeMenu();
							}}
						>
							<input type="hidden" name="id" value={row.id} />
							<button class="menu-item"><Ban size={15} /> Don’t contact again…</button>
						</form>
					{/if}
					{#if row.checkin_id}
						<!-- A check-in is attendance: undoing it belongs to the Check-ins tab, which also keeps this row. -->
						<p class="menu-note">Checked in: remove the check-in on the Check-ins tab.</p>
					{:else}
						<form
							method="POST"
							action="?/remove"
							use:enhance={({ cancel }) => {
								if (!confirm(`Remove ${row.name} from this event?`)) cancel();
								closeMenu();
							}}
						>
							<input type="hidden" name="id" value={row.id} />
							<button class="menu-item danger"><Trash2 size={15} /> Remove</button>
						</form>
					{/if}
				</div>
			</details>
		</div>
	{/if}
</li>

<style>
	.row {
		display: grid;
		grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) auto auto;
		grid-template-areas: 'person note reply actions';
		align-items: center;
		gap: 8px 14px;
		padding: 10px 16px 10px 20px;
		border-top: 1px solid var(--border);
		transition: background-color 0.15s ease;
	}

	.row.found {
		grid-template-columns: minmax(0, 1fr) auto auto;
		grid-template-areas: 'person decide actions';
	}

	.row.skipped {
		opacity: 0.6;
	}

	.row:hover:not(.editing) {
		background: color-mix(in oklab, var(--surface-2) 55%, transparent);
	}

	.row.editing {
		grid-template-columns: minmax(0, 1fr);
		grid-template-areas: 'edit';
		background: var(--surface-2);
		padding: 16px 20px;
	}

	.person {
		grid-area: person;
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
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

	.found .avatar {
		background: var(--surface-3);
		color: var(--text-2);
	}

	.who {
		min-width: 0;
	}

	.name-line {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 2px 8px;
	}

	.person-name {
		font-weight: 650;
	}

	.tiny {
		gap: 4px;
		padding: 2px 8px;
		font-size: 12px;
	}

	.marker {
		font-weight: 600;
	}

	.marker.warn-tone {
		background: var(--warn-soft);
		color: var(--warn);
	}

	.marker.bad-tone {
		background: var(--bad-soft);
		color: var(--bad);
	}

	.marker.brand-tone {
		background: var(--brand-soft);
		color: var(--brand-text);
	}

	button.marker {
		border: 0;
		cursor: pointer;
	}

	.details,
	.reason {
		font-size: 13.5px;
		color: var(--muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.reason {
		color: var(--text-2);
		white-space: normal;
	}

	.details a {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		color: inherit;
		font-weight: 600;
	}

	.details a:hover {
		color: var(--brand-text);
	}

	.due {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		margin-top: 3px;
		padding: 0;
		border: 0;
		background: transparent;
		font: inherit;
		font-size: 13px;
		font-weight: 600;
		color: var(--text-2);
		cursor: pointer;
	}

	.due:hover {
		color: var(--brand-text);
	}

	.due.today {
		color: var(--brand-text);
	}

	.due.overdue {
		color: var(--bad);
	}

	.due.own {
		text-decoration: underline dotted;
		text-underline-offset: 3px;
	}

	.due-form {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		margin-top: 6px;
	}

	.due-input {
		height: 34px;
		width: auto;
		font-size: 14px;
	}

	.kind {
		display: inline-flex;
		align-items: center;
		height: 32px;
	}

	.kind-select {
		height: 32px;
		max-width: 150px;
		padding: 0 6px;
		border-radius: 999px;
		border: 1px solid var(--border-strong);
		background: var(--surface);
		font-size: 13px;
		font-weight: 600;
		color: var(--text-2);
		text-overflow: ellipsis;
	}

	.decide {
		grid-area: decide;
		display: flex;
		gap: 4px;
	}

	.note-form {
		grid-area: note;
		min-width: 0;
	}

	.note {
		width: 100%;
		height: 36px;
		padding: 0 10px;
		border-radius: 10px;
		border: 1px solid transparent;
		background: transparent;
		color: var(--text-2);
		/* 16px or iOS Safari zooms the page on focus. */
		font-size: 16px;
		text-overflow: ellipsis;
		transition:
			background-color 0.15s ease,
			border-color 0.15s ease,
			box-shadow 0.15s ease;
	}

	.note::placeholder {
		color: color-mix(in oklab, var(--muted) 70%, transparent);
	}

	.note:hover {
		background: var(--surface-2);
	}

	.note:focus {
		outline: none;
		background: var(--surface);
		border-color: var(--brand);
		box-shadow: var(--ring);
		color: var(--text);
	}

	.reply-form {
		grid-area: reply;
	}

	.reply {
		display: flex;
		gap: 3px;
		padding: 3px;
		border-radius: 12px;
		background: var(--surface-2);
	}

	.choice {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		height: 34px;
		padding: 0 11px;
		border: 0;
		border-radius: 9px;
		background: transparent;
		color: var(--text-2);
		font-size: 13.5px;
		font-weight: 650;
		white-space: nowrap;
		cursor: pointer;
		transition:
			background-color 0.15s ease,
			color 0.15s ease,
			box-shadow 0.15s ease;
	}

	.choice:hover {
		background: var(--surface);
		color: var(--text);
	}

	.choice[aria-pressed='true'].yes {
		background: var(--good-soft);
		color: var(--good);
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--good) 35%, transparent);
	}

	.choice[aria-pressed='true'].maybe {
		background: var(--warn-soft);
		color: var(--warn);
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--warn) 35%, transparent);
	}

	.choice[aria-pressed='true'].no {
		background: var(--bad-soft);
		color: var(--bad);
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--bad) 35%, transparent);
	}

	.actions {
		grid-area: actions;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 2px;
	}

	.owner {
		position: relative;
		display: inline-grid;
		place-items: center;
		width: 36px;
		height: 36px;
		cursor: pointer;
	}

	.owner-avatar {
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		background: var(--surface-3);
		color: var(--text-2);
		font-size: 11px;
		font-weight: 750;
	}

	.owner-avatar.unset {
		background: transparent;
		border: 1.5px dashed var(--border-strong);
		color: var(--muted);
	}

	/* The select sits on top of the avatar, invisible, so a tap opens the native picker. */
	.owner-select {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}

	.copy-link.copied {
		color: var(--good);
	}

	.hint-text {
		padding: 0 6px;
		font-size: 12.5px;
		color: var(--muted);
		white-space: nowrap;
		cursor: help;
	}

	.linkedin {
		--h: 32px;
		gap: 6px;
		padding: 0 8px;
		font-size: 13px;
	}

	.linkedin[aria-pressed='true'] {
		background: var(--brand-soft);
		color: var(--brand-text);
	}

	.in {
		display: grid;
		place-items: center;
		height: 18px;
		padding: 0 3px;
		border-radius: 4px;
		border: 1.5px solid currentColor;
		font-size: 11px;
		font-weight: 800;
		line-height: 1;
	}

	.menu {
		position: relative;
	}

	.menu summary {
		list-style: none;
	}

	.menu summary::-webkit-details-marker {
		display: none;
	}

	.menu[open] summary {
		background: var(--surface-2);
	}

	.menu-list {
		position: absolute;
		right: 0;
		top: calc(100% + 4px);
		z-index: 10;
		display: grid;
		min-width: 200px;
		padding: 6px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background: var(--surface);
		box-shadow: var(--shadow-lg);
	}

	.menu-note {
		padding: 8px 12px;
		font-size: 13px;
		color: var(--muted);
		max-width: 240px;
	}

	.menu-item {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		height: 38px;
		padding: 0 10px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--text);
		font-size: 14px;
		font-weight: 600;
		text-align: left;
		white-space: nowrap;
		cursor: pointer;
	}

	.menu-item:hover {
		background: var(--surface-2);
	}

	.menu-item.danger {
		color: var(--bad);
	}

	.edit {
		grid-area: edit;
		display: grid;
		gap: 14px;
	}

	.edit-grid {
		display: grid;
		gap: 12px;
		grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
	}

	.edit .input {
		height: 44px;
	}

	.edit-actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.spacer {
		flex: 1;
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

	@media (max-width: 900px) {
		.row {
			grid-template-columns: minmax(0, 1fr) auto;
			grid-template-areas:
				'person actions'
				'reply reply'
				'note note';
			padding: 14px 16px;
		}

		.row.found {
			grid-template-columns: minmax(0, 1fr) auto;
			grid-template-areas:
				'person actions'
				'decide decide';
		}

		.choice {
			flex: 1;
		}

		.note {
			background: var(--surface-2);
		}

		.linkedin-label {
			display: none;
		}

		.kind-select {
			max-width: 120px;
		}
	}

	@media (max-width: 380px) {
		.choice {
			padding: 0 6px;
			gap: 4px;
			font-size: 13px;
		}
	}
</style>
