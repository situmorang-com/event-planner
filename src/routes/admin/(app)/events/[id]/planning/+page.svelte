<script lang="ts">
	import { enhance } from '$app/forms';
	import EventTabs from '$lib/components/EventTabs.svelte';
	import {
		briefIsReady,
		DEPARTMENTS,
		researchCommand,
		researchedAllMessage,
		RESEARCH_TOKEN_VAR,
		SENIORITY
	} from '$lib/planning';
	import { formatDate, formatDateTime } from '$lib/time';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import CalendarClock from '@lucide/svelte/icons/calendar-clock';
	import CalendarPlus from '@lucide/svelte/icons/calendar-plus';
	import Check from '@lucide/svelte/icons/check';
	import Columns3 from '@lucide/svelte/icons/columns-3';
	import Copy from '@lucide/svelte/icons/copy';
	import FileUp from '@lucide/svelte/icons/file-up';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import Plus from '@lucide/svelte/icons/plus';
	import MessageSquareText from '@lucide/svelte/icons/message-square-text';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import Timer from '@lucide/svelte/icons/timer';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import UserCheck from '@lucide/svelte/icons/user-check';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const event = $derived(data.event);
	const brief = $derived(data.brief);
	const otherDepartments = $derived(
		brief.departments.filter((d) => !DEPARTMENTS.includes(d)).join(', ')
	);
	const ready = $derived(briefIsReady(brief) && data.targets.length > 0);

	let briefSaved = $state(false);
	let invitationSaved = $state(false);
	let chaseSaved = $state(false);
	// svelte-ignore state_referenced_locally
	let useDefaults = $state(!data.chase.own);
	let copied = $state<string | null>(null);

	// The agent gets web tools only and never the token: curl fetches its brief and posts its answer.
	const command = $derived(researchCommand(data.base, event.id));

	// Step 3's line on the next run (§6.2): how many companies, in how many batches, and how many
	// ticked ones sit it out because they were answered in the last 24 hours.
	const forecast = $derived.by(() => {
		const out = data.ticked - data.pending;
		const batches =
			data.batches > 1
				? `, in ${data.batches} batches of up to ${data.cap}, posting each batch back before the next`
				: '';
		const left =
			out > 0
				? `; ${out === 1 ? 'the other ticked company was' : `the other ${out} ticked companies were`} researched in the last 24 hours and ${out === 1 ? 'is' : 'are'} left out`
				: '';
		return `The next run researches ${data.pending} ${data.pending === 1 ? 'company' : 'companies'}${batches}${left}.`;
	});

	/** "researched 2 Oct", "requested 2 Oct" or nothing, for a target's research tick. */
	function researchNote(t: { researchedAt: number | null; requestedAt: number | null }) {
		if (t.researchedAt) return `researched ${formatDate(t.researchedAt, event.timezone)}`;
		if (t.requestedAt) return `requested ${formatDate(t.requestedAt, event.timezone)}`;
		return '';
	}

	// The D365 accounts paste (§6.1): the text stays in the box across a column check, and the
	// mapping the organizer corrects travels back as JSON with the next submit.
	let accountsText = $state('');
	let accountColumns = $state<Record<string, number> | null>(null);
	let accountHeader = $state(true);
	let accountsFile = $state<HTMLInputElement | null>(null);
	const accountsPreview = $derived(form && 'accountsPreview' in form ? form.accountsPreview : null);
	const accountsResult = $derived(form && 'accounts' in form ? (form.accounts ?? null) : null);
	const copyResult = $derived(form && 'copied' in form ? (form.copied ?? null) : null);
	$effect(() => {
		if (accountsPreview) {
			accountColumns = { ...accountsPreview.columns };
			accountHeader = accountsPreview.header;
		} else if (accountsResult) {
			// Added: the box empties and the next paste is read on its own headers.
			accountsText = '';
			accountColumns = null;
		}
	});

	function accountColumnAt(index: number) {
		return Object.entries(accountColumns ?? {}).find(([, i]) => i === index)?.[0] ?? '';
	}

	/** The select for one header cell changed: that column feeds `key`, or nothing. */
	function remapAccount(index: number, key: string) {
		const next: Record<string, number> = {};
		for (const [k, i] of Object.entries(accountColumns ?? {})) if (i !== index) next[k] = i;
		if (key) next[key] = index;
		accountColumns = next;
	}

	/** A CSV export goes through the same parser as a paste. */
	async function pickAccountsFile(e: Event & { currentTarget: HTMLInputElement }) {
		const file = e.currentTarget.files?.[0];
		if (!file) return;
		if (file.size > 2_000_000) {
			alert('That file is too big. Export fewer rows, or paste the ones you need.');
			return;
		}
		accountsText = await file.text();
		accountColumns = null;
		e.currentTarget.value = '';
	}

	function copiedMessage(c: {
		brief: 'copied' | 'kept' | 'empty';
		added: number;
		duplicates: number;
		from: string;
	}) {
		const companies = `${c.added} ${c.added === 1 ? 'company' : 'companies'}`;
		const parts = [
			c.brief === 'copied' ? `Copied the brief and ${companies}` : `Copied ${companies}`,
			c.duplicates ? `${c.duplicates} already listed` : '',
			c.brief === 'kept' ? 'your answers kept' : ''
		].filter(Boolean);
		return `${parts.join(' · ')} from ${c.from}.`;
	}

	async function copy(text: string, what: string) {
		await navigator.clipboard.writeText(text);
		copied = what;
		setTimeout(() => (copied = null), 1600);
	}

	function saveOnBlur(e: FocusEvent & { currentTarget: HTMLInputElement }, saved: string) {
		if (e.currentTarget.value.replace(/\s+/g, ' ').trim() !== saved)
			e.currentTarget.form?.requestSubmit();
	}
</script>

<svelte:head>
	<title>Planning · {event.name} · Event Planner</title>
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
</header>

<EventTabs
	eventId={event.id}
	current="planning"
	checkins={data.tabs.checkins}
	people={data.tabs.people}
	review={data.tabs.review}
/>

{#if event.starts_at === null}
	<section class="card empty rise">
		<div class="empty-icon"><CalendarPlus size={30} /></div>
		<h2>Set the event date first</h2>
		<p class="muted">
			Research keeps what it finds until the event starts, so it needs to know when that is.
		</p>
		<a class="btn btn-primary btn-lg" href="/admin/events/{event.id}#settings">Event settings</a>
	</section>
{:else}
	<!-- 1. Who to invite -->
	<section class="card step">
		<div class="step-head">
			<span class="step-number">1</span>
			<div>
				<h2>Who should come?</h2>
				<p class="muted">
					Claude researches against these answers, so the more specific the better.
				</p>
			</div>
		</div>
		<form
			class="brief"
			method="POST"
			action="?/brief"
			use:enhance={() => {
				briefSaved = false;
				return async ({ result, update }) => {
					await update({ reset: false });
					briefSaved = result.type === 'success';
				};
			}}
			oninput={() => (briefSaved = false)}
		>
			<div class="field">
				<label class="label" for="goal">What is the event for?</label>
				<textarea
					class="input textarea"
					id="goal"
					name="goal"
					rows="2"
					placeholder="A breakfast briefing on Dynamics 365 Finance for manufacturers planning to replace their ERP in the next two years."
					>{brief.goal}</textarea
				>
			</div>
			<div class="field">
				<label class="label" for="roles">Which roles or job titles?</label>
				<input
					class="input"
					id="roles"
					name="roles"
					value={brief.roles}
					placeholder="CIO, CFO, Head of IT, ERP project lead"
				/>
			</div>
			<fieldset>
				<legend class="label">How senior?</legend>
				<div class="chips">
					{#each SENIORITY as level (level)}
						<label class="chip">
							<input
								type="checkbox"
								name="seniority"
								value={level}
								checked={brief.seniority.includes(level)}
							/>
							{level}
						</label>
					{/each}
				</div>
			</fieldset>
			<fieldset>
				<legend class="label">Which departments?</legend>
				<div class="chips">
					{#each DEPARTMENTS as dept (dept)}
						<label class="chip">
							<input
								type="checkbox"
								name="departments"
								value={dept}
								checked={brief.departments.includes(dept)}
							/>
							{dept}
						</label>
					{/each}
					<input
						class="input other"
						name="otherDepartments"
						value={otherDepartments}
						placeholder="Others, comma-separated"
						aria-label="Other departments"
					/>
				</div>
			</fieldset>
			<div class="row">
				<div class="field per-company">
					<label class="label" for="perCompany">At most how many per company?</label>
					<input
						class="input"
						id="perCompany"
						name="perCompany"
						type="number"
						min="1"
						max="10"
						value={brief.perCompany}
					/>
				</div>
				<div class="field">
					<label class="label" for="avoid">Who should be left out?</label>
					<input
						class="input"
						id="avoid"
						name="avoid"
						value={brief.avoid}
						placeholder="Competitors, interns, people our sales team already meets"
					/>
					<p class="hint">
						Roles and companies, not names: the brief Claude gets counts the people already known
						per company and never carries a name, so a line naming someone is left out of it.
					</p>
				</div>
			</div>
			<div class="actions">
				{#if briefSaved}<span class="saved"><Check size={16} /> Saved</span>{/if}
				<button class="btn btn-primary">Save answers</button>
			</div>
		</form>
	</section>

	<!-- 2. Target companies -->
	<section class="card step">
		<div class="step-head">
			<span class="step-number">2</span>
			<div>
				<h2>Target companies</h2>
				<p class="muted">
					The companies to find people at. Add a focus to change the brief for one company (roles
					and departments, not names). The tick says whether the next run researches it: by default,
					until {brief.perCompany} contactable
					{brief.perCompany === 1 ? 'person is' : 'people are'} known there. A company researched in the
					last 24 hours is left out of the next run; the command takes the rest {data.cap} at a time.
				</p>
			</div>
		</div>

		{#if data.targets.length}
			<ul class="targets">
				{#each data.targets as t (t.id)}
					<li class="target" class:unticked={!t.ticked}>
						<form
							method="POST"
							action="?/research"
							class="tick-form"
							use:enhance={() =>
								async ({ update }) =>
									update({ reset: false })}
						>
							<input type="hidden" name="id" value={t.id} />
							<!-- The hidden value is what the next click sends: the opposite of the tick. -->
							<input type="hidden" name="research" value={t.ticked ? '0' : '1'} />
							<label class="tick" title={t.blocked ? 'Blocked company' : 'Research this company'}>
								<input
									type="checkbox"
									checked={t.ticked}
									disabled={t.blocked}
									onchange={(e) => e.currentTarget.form?.requestSubmit()}
								/>
								<span class="sr-only">Research {t.name}</span>
							</label>
						</form>
						<div class="target-name">
							<strong>{t.name}</strong>
							{#if t.website}
								<a
									class="muted small"
									href={t.website.startsWith('http') ? t.website : `https://${t.website}`}
									target="_blank"
									rel="noreferrer">{t.website.replace(/^https?:\/\//, '')}</a
								>
							{/if}
							<span class="muted small">
								{t.live} on the list{t.waiting ? ` · ${t.waiting} to review` : ''}
								{#if t.phoneCountry}
									· <span title="Phone country, set on the People tab"
										>{t.phoneCountry === 'MY' ? '+60 Malaysia' : '+62 Indonesia'}</span
									>
								{/if}
								{#if t.blocked}
									· <span class="bad">blocked</span>
								{:else if t.research === null}
									· {t.ticked ? 'research by default' : `${t.known} known, not researched`}
								{/if}
								{#if researchNote(t)}· {researchNote(t)}{/if}
							</span>
							{#if t.research !== null}
								<form
									method="POST"
									action="?/research"
									use:enhance={() =>
										async ({ update }) =>
											update({ reset: false })}
								>
									<input type="hidden" name="id" value={t.id} />
									<button class="btn btn-ghost btn-sm reset" title="Back to the computed default">
										default
									</button>
								</form>
							{/if}
						</div>
						<form
							method="POST"
							action="?/focus"
							class="focus-form"
							use:enhance={() =>
								async ({ update }) =>
									update({ reset: false })}
						>
							<input type="hidden" name="id" value={t.id} />
							<input
								class="focus"
								name="focus"
								value={t.focus}
								placeholder="Focus for this company: roles and departments, not names"
								aria-label="Focus for {t.name}"
								onblur={(e) => saveOnBlur(e, t.focus)}
								onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), e.currentTarget.blur())}
							/>
						</form>
						<form
							method="POST"
							action="?/removeTarget"
							use:enhance={({ cancel }) => {
								if (!confirm(`Remove ${t.name} from the targets? Its guests stay on the list.`))
									cancel();
							}}
						>
							<input type="hidden" name="id" value={t.id} />
							<button class="btn btn-ghost btn-icon btn-sm" title="Remove {t.name}">
								<Trash2 size={15} /><span class="sr-only">Remove {t.name}</span>
							</button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}

		<form
			class="add-targets"
			method="POST"
			action="?/targets"
			use:enhance={() =>
				async ({ update }) =>
					update()}
		>
			<textarea
				class="input textarea"
				name="companies"
				rows="3"
				aria-label="Companies to add"
				placeholder={'One company per line, with its website if you know it:\nBatavia Foods, bataviafoods.co.id\nSelat Energy'}
			></textarea>
			<div class="actions">
				{#if form && 'targetError' in form}<p class="error-text">{form.targetError}</p>{/if}
				{#if form && 'targetsAdded' in form}
					<p class="muted small">
						Added {form.targetsAdded}{form.targetDuplicates?.length
							? `; ${form.targetDuplicates.join(', ')} already listed`
							: ''}.
					</p>
				{/if}
				<button class="btn btn-secondary"><Plus size={16} /> Add companies</button>
			</div>
		</form>

		<!-- Reuse (§4.3, D11): another event's brief and companies, or a D365 accounts export. -->
		<div class="reuse">
			{#if data.sources.length}
				<form
					class="copy-from"
					method="POST"
					action="?/copyFrom"
					use:enhance={({ formData, cancel }) => {
						const from = data.sources.find((s) => s.id === formData.get('from'));
						if (!from) {
							cancel();
							return;
						}
						// Answers already given are only replaced on purpose; the companies come either way.
						if (from.brief && !data.briefEmpty)
							formData.set(
								'overwrite',
								confirm(
									`Replace this event’s answers to “Who should come?” with ${from.name}’s? Cancel keeps your answers; the companies are copied either way.`
								)
									? '1'
									: '0'
							);
						return async ({ update }) => update({ reset: false });
					}}
				>
					<label class="label" for="copy-from">Copy brief + targets from…</label>
					<div class="copy-row">
						<select class="input" id="copy-from" name="from" required>
							<option value="">Another event</option>
							{#each data.sources as s (s.id)}
								<option value={s.id}>
									{s.name}{s.starts_at ? ` · ${formatDate(s.starts_at, s.timezone)}` : ''} ·
									{s.targets}
									{s.targets === 1 ? 'company' : 'companies'}{s.brief ? ' + brief' : ''}
								</option>
							{/each}
						</select>
						<button class="btn btn-secondary"><Copy size={16} /> Copy</button>
					</div>
					{#if form && 'copyError' in form}<p class="error-text">{form.copyError}</p>{/if}
					{#if copyResult}
						<p class="muted small"><Check size={14} /> {copiedMessage(copyResult)}</p>
					{/if}
				</form>
			{/if}

			<details class="accounts" open={!!accountsPreview}>
				<summary>Paste a Dynamics 365 accounts export</summary>
				<form
					method="POST"
					action="?/accounts"
					use:enhance={() =>
						async ({ update }) =>
							update({ reset: false })}
				>
					<p class="hint">
						Open an Accounts view in Dynamics 365, export or copy it with its header row (<em
							>Account Name</em
						>, <em>Website</em>, <em>Primary Contact</em>, <em>Owner</em>,
						<em>Industry</em>, <em>Main Phone</em>) and paste it here. Each account becomes a target
						company recorded as a customer; its owner becomes the company’s owner when it names a
						team member and nobody owns it yet, otherwise it is kept as a note. The primary contact
						and phone are not kept: add people on the People tab.
					</p>
					<textarea
						class="input textarea"
						name="accounts"
						rows="4"
						aria-label="Dynamics 365 accounts export"
						placeholder={'Account Name\tWebsite\tPrimary Contact\tOwner\tIndustry\tMain Phone\nBatavia Foods\thttps://bataviafoods.co.id\t…'}
						bind:value={accountsText}></textarea>
					<input
						type="hidden"
						name="columns"
						value={accountColumns ? JSON.stringify(accountColumns) : ''}
					/>
					<input type="hidden" name="header" value={accountHeader ? '1' : '0'} />
					{#if accountsPreview && accountsPreview.headers.length >= 2}
						<div class="columns">
							<p class="hint">
								{#if accountsPreview.unsure}
									The app couldn’t tell which column is which. Say what each one holds:
								{:else}
									{Object.keys(accountsPreview.columns).length} of {accountsPreview.headers.length}
									columns recognised, {accountsPreview.count}
									{accountsPreview.count === 1 ? 'company' : 'companies'} to add. Change any that landed
									in the wrong place:
								{/if}
							</p>
							<div class="column-grid">
								{#each accountsPreview.headers as cell, i (i)}
									<label class="column">
										<span class="column-header" title={cell}>{cell || `Column ${i + 1}`}</span>
										<select
											class="input"
											value={accountColumnAt(i)}
											onchange={(e) => remapAccount(i, e.currentTarget.value)}
										>
											<option value="">Ignore</option>
											{#each data.accountOptions as o (o.key)}
												<option value={o.key}>{o.label}</option>
											{/each}
										</select>
									</label>
								{/each}
							</div>
							<label class="chip">
								<input type="checkbox" bind:checked={accountHeader} />
								The first line is a header row, not a company
							</label>
						</div>
					{/if}
					<div class="actions">
						{#if form && 'accountsError' in form}<p class="error-text">{form.accountsError}</p>{/if}
						{#if accountsResult}
							<p class="muted small">
								Added {accountsResult.added.length}{accountsResult.duplicates.length
									? ` · ${accountsResult.duplicates.length} already listed`
									: ''}{accountsResult.skipped
									? ` · ${accountsResult.skipped} ${accountsResult.skipped === 1 ? 'line' : 'lines'} without a name`
									: ''}{accountsResult.truncated ? ' · only the first 1000 lines were read' : ''}.
								{#if accountsResult.blocked.length}
									<span class="bad">Blocked, not added: {accountsResult.blocked.join(', ')}.</span>
								{/if}
							</p>
						{/if}
						<input
							type="file"
							accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
							class="sr-only"
							bind:this={accountsFile}
							onchange={pickAccountsFile}
							tabindex="-1"
						/>
						<button
							type="button"
							class="btn btn-ghost btn-sm"
							onclick={() => accountsFile?.click()}
						>
							<FileUp size={15} /> Open a CSV file
						</button>
						<button
							class="btn btn-ghost btn-sm"
							name="preview"
							value="1"
							disabled={!accountsText.trim()}
						>
							<Columns3 size={15} /> Check columns
						</button>
						<button class="btn btn-secondary" disabled={!accountsText.trim()}>
							<Plus size={16} /> Add accounts
						</button>
					</div>
				</form>
			</details>
		</div>
	</section>

	<!-- 3. Run the research -->
	<section class="card step">
		<div class="step-head">
			<span class="step-number">3</span>
			<div>
				<h2>Find people with Claude</h2>
				<p class="muted">
					Runs in your terminal with your own Claude Code sign-in. Claude only gets web search,
					never your Event Planner token, and everything it finds waits on the People tab for your
					approval.
				</p>
			</div>
		</div>

		{#if data.started}
			<p class="banner banner-warn">
				The event has started: research still runs, but the list has gone live, so what it finds now
				is not kept. Found rows nobody approved were deleted when it began.
			</p>
		{/if}
		{#if !ready}
			<p class="banner banner-warn">
				{briefIsReady(brief)
					? 'Add at least one target company first.'
					: 'Answer “which roles”, “how senior” or “which departments” above and save first.'}
			</p>
		{:else if data.refusal}
			<p class="banner banner-warn">{data.refusal}</p>
		{:else if data.pending === 0}
			<!-- Ticked, but all answered today: the command would print this and stop. -->
			<p class="banner">{researchedAllMessage(data.ticked)}</p>
		{:else}
			<p class="muted small">{forecast}</p>
		{/if}

		<div class="run">
			<h3><KeyRound size={16} /> Access token</h3>
			<p class="hint">
				The command reads <code>{RESEARCH_TOKEN_VAR}</code> from your shell. Create one under
				<a href="/admin/settings#tokens">Settings › API tokens</a> and export it once in the
				terminal you research from (or in <code>~/.zshrc</code>).
			</p>

			<h3><Sparkles size={16} /> Command</h3>
			<div class="code">
				<pre>{command}</pre>
				<button class="btn btn-secondary btn-sm" onclick={() => copy(command, 'command')}>
					{#if copied === 'command'}<Check size={15} /> Copied{:else}<Copy size={15} /> Copy{/if}
				</button>
			</div>
			<p class="hint">
				Up to {data.cap} companies per batch, a few minutes per company; each batch is posted back before
				the next starts, and Claude's raw answers are saved as
				<code>event-planner-research-…json</code> files in the folder you run it from. If it stops part-way,
				run it again: companies researched in the last 24 hours are left out, and people already invited,
				suggested or dismissed are skipped.
			</p>
		</div>
	</section>

	<!-- 4. Review -->
	<section class="card step">
		<div class="step-head">
			<span class="step-number">4</span>
			<div>
				<h2>Review what it found</h2>
				<p class="muted">
					{#if data.toReview}
						{data.toReview}
						{data.toReview === 1 ? 'person waits' : 'people wait'} under
						<strong>To review</strong> on the People tab: open the source, then Add or Skip each one.
					{:else}
						Nothing to review yet. Suggestions appear on the People tab after a run.
					{/if}
					{#if data.accepted}
						<span
							>{data.accepted} added so far; anyone added or skipped is not suggested again.</span
						>
					{/if}
				</p>
			</div>
		</div>
		<a class="btn btn-secondary review-link" href="/admin/events/{event.id}/people">
			<UserCheck size={16} /> Open People{data.toReview ? ` · ${data.toReview} to review` : ''}
		</a>
	</section>

	<!-- Retention (D10): what research left behind, and the button that deletes it now. -->
	<section class="card step" id="retention">
		<div class="step-head">
			<span class="step-number"><Timer size={15} /></span>
			<div>
				<h2>Planning data</h2>
				<p class="muted">
					What research finds is personal data with a short life: the names nobody approved go when
					the event starts, and everything left, skipped names and the research stamps on the
					companies, goes 90 days after the start. The brief and the target companies stay, so a
					later event can copy them.
				</p>
			</div>
		</div>
		<div class="retention">
			<p>
				{#if event.planning_purged_at}
					Planning data deleted {formatDate(event.planning_purged_at, event.timezone)}{data
						.retention.found
						? `; ${data.retention.found} found since`
						: ''}.
				{:else if data.retention.keptUntil}
					Kept until {formatDate(data.retention.keptUntil, event.timezone)}{data.retention.found
						? ` · ${data.retention.found} found ${data.retention.found === 1 ? 'row' : 'rows'} now`
						: ''}.
				{/if}
				{#if form && 'purged' in form && form.purged !== null}
					<span class="saved"><Check size={16} /> Deleted {form.purged}</span>
				{/if}
			</p>
			{#if data.retention.found}
				<form
					method="POST"
					action="?/purge"
					use:enhance={({ cancel }) => {
						if (
							!confirm(
								`Delete this event’s planning data now? ${data.retention.found} found ${data.retention.found === 1 ? 'row goes' : 'rows go'}, with the research stamps. The brief and the companies stay. This is logged.`
							)
						)
							cancel();
					}}
				>
					<button class="btn btn-danger"><Trash2 size={16} /> Delete planning data</button>
				</form>
			{/if}
		</div>
	</section>

	<!-- Invitation wording (D21): this event's own text over the message default. -->
	<section class="card step" id="invitation">
		<div class="step-head">
			<span class="step-number"><MessageSquareText size={15} /></span>
			<div>
				<h2>Invitation wording</h2>
				<p class="muted">
					What the WhatsApp and email buttons open for people not yet invited. Leave it blank to use
					the <a href="/admin/settings#messages">message default</a> in each person’s language; text here
					is sent to everyone on this list as written. The opt-out line is always added at the end.
				</p>
			</div>
		</div>
		<form
			class="brief"
			method="POST"
			action="?/invitation"
			use:enhance={() => {
				invitationSaved = false;
				return async ({ result, update }) => {
					await update({ reset: false });
					invitationSaved = result.type === 'success';
				};
			}}
			oninput={() => (invitationSaved = false)}
		>
			<div class="field">
				<label class="label" for="invitation-text">
					This event’s invitation <span class="optional">(optional)</span>
				</label>
				<textarea
					class="input textarea"
					id="invitation-text"
					name="text"
					rows="5"
					maxlength="2000"
					placeholder={data.invitation.fallback}>{data.invitation.text}</textarea
				>
				<p class="hint">
					Placeholders: {#each data.invitation.placeholders as p, i (p)}{i ? ', ' : ''}<code
							>{p}</code
						>{/each}. Blank means the {data.invitation.languageLabel} default shown above.
				</p>
			</div>
			{#if form && 'invitationError' in form}<p class="error-text">{form.invitationError}</p>{/if}
			<div class="actions">
				{#if invitationSaved}<span class="saved"><Check size={16} /> Saved</span>{/if}
				<button class="btn btn-primary">Save wording</button>
			</div>
		</form>
	</section>

	<!-- Chase rules (D20): this event's own over the settings defaults. -->
	<section class="card step" id="chase">
		<div class="step-head">
			<span class="step-number"><CalendarClock size={15} /></span>
			<div>
				<h2>Chase rules</h2>
				<p class="muted">
					When people on this list become due: a chase so many working days after the last message,
					until the cap for that person is reached or the event is too close; a reminder shortly
					before for everyone attending. The <a href="/admin/settings#chase">defaults</a>
					apply unless this event sets its own.
				</p>
			</div>
		</div>
		<form
			class="brief"
			method="POST"
			action="?/chase"
			use:enhance={() => {
				chaseSaved = false;
				return async ({ result, update }) => {
					await update({ reset: false });
					chaseSaved = result.type === 'success';
				};
			}}
			oninput={() => (chaseSaved = false)}
		>
			<label class="chip use-defaults">
				<input type="checkbox" name="useDefaults" value="1" bind:checked={useDefaults} />
				Use the defaults
			</label>
			<div class="chase-grid" class:dimmed={useDefaults}>
				{#each data.chase.fields as f (f.key)}
					<div class="field">
						<label class="label" for="chase-{f.key}">{f.label}</label>
						<div class="chase-input">
							<input
								class="input"
								id="chase-{f.key}"
								name={f.key}
								type="number"
								min="0"
								max={f.max}
								step="1"
								required
								disabled={useDefaults}
								value={useDefaults ? data.chase.defaults[f.key] : data.chase.values[f.key]}
							/>
							{#if f.unit}<span class="muted small">{f.unit}</span>{/if}
						</div>
					</div>
				{/each}
			</div>
			{#if form && 'chaseError' in form}<p class="error-text">{form.chaseError}</p>{/if}
			<div class="actions">
				{#if chaseSaved}<span class="saved"><Check size={16} /> Saved</span>{/if}
				<button class="btn btn-primary">Save chase rules</button>
			</div>
		</form>
	</section>
{/if}

<style>
	.back {
		margin: -8px 0 12px -10px;
	}

	.head {
		margin-bottom: 20px;
	}

	.title {
		display: grid;
		gap: 8px;
	}

	.status {
		display: flex;
		gap: 8px;
	}

	h1 {
		font-size: clamp(28px, 4vw, 38px);
		font-weight: 800;
		letter-spacing: -0.035em;
	}

	.step {
		display: grid;
		/* minmax(0…): a long command scrolls inside its box instead of widening the card. */
		grid-template-columns: minmax(0, 1fr);
		gap: 18px;
		padding: 20px;
		margin-bottom: 14px;
	}

	.step-head {
		display: flex;
		gap: 14px;
		align-items: flex-start;
	}

	.step-head h2 {
		font-size: 18px;
		margin-bottom: 2px;
	}

	.step-head p {
		font-size: 14.5px;
	}

	.step-number {
		flex: none;
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border-radius: 50%;
		background: var(--brand-soft);
		color: var(--brand-text);
		font-weight: 750;
	}

	.brief,
	.add-targets {
		display: grid;
		gap: 16px;
	}

	fieldset {
		border: 0;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 8px;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		height: 38px;
		padding: 0 14px;
		border-radius: 999px;
		border: 1px solid var(--border-strong);
		background: var(--surface);
		font-size: 14.5px;
		font-weight: 600;
		color: var(--text-2);
		cursor: pointer;
	}

	.chip:has(input:checked) {
		background: var(--brand-soft);
		border-color: color-mix(in oklab, var(--brand) 55%, transparent);
		color: var(--brand-text);
	}

	.chip input {
		width: 16px;
		height: 16px;
		margin: 0;
		accent-color: var(--brand);
	}

	.other {
		height: 38px;
		width: 220px;
		border-radius: 999px;
	}

	.row {
		display: grid;
		grid-template-columns: 220px 1fr;
		gap: 16px;
	}

	.use-defaults {
		justify-self: start;
	}

	.chase-grid {
		display: grid;
		gap: 12px;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
	}

	.chase-grid.dimmed {
		opacity: 0.55;
	}

	.chase-input {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.chase-input .input {
		width: 90px;
	}

	.textarea {
		height: auto;
		padding: 12px 14px;
		line-height: 1.5;
		resize: vertical;
	}

	.actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 12px;
		flex-wrap: wrap;
	}

	.saved {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: var(--good);
		font-weight: 650;
	}

	.targets {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.target {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) minmax(0, 1.2fr) auto;
		align-items: center;
		gap: 12px;
		padding: 10px 0;
		border-top: 1px solid var(--border);
	}

	.target.unticked .target-name strong {
		color: var(--muted);
	}

	.tick-form {
		display: flex;
	}

	.tick {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		cursor: pointer;
	}

	.tick input {
		width: 18px;
		height: 18px;
		margin: 0;
		accent-color: var(--brand);
	}

	.tick input:disabled {
		cursor: not-allowed;
	}

	.reset {
		--h: 24px;
		font-size: 12px;
		padding: 0 8px;
	}

	.bad {
		color: var(--bad);
		font-weight: 650;
	}

	.target-name {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 2px 10px;
		min-width: 0;
	}

	.small {
		font-size: 13px;
	}

	.focus {
		width: 100%;
		height: 36px;
		padding: 0 10px;
		border-radius: 10px;
		border: 1px solid transparent;
		background: var(--surface-2);
		font-size: 16px;
	}

	.focus:focus {
		outline: none;
		border-color: var(--brand);
		box-shadow: var(--ring);
		background: var(--surface);
	}

	.reuse {
		display: grid;
		gap: 14px;
		padding-top: 16px;
		border-top: 1px solid var(--border);
	}

	.copy-from {
		display: grid;
		gap: 8px;
	}

	.copy-row {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
	}

	.copy-row .input {
		flex: 1 1 260px;
		min-width: 0;
	}

	.copy-from .small {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}

	.accounts summary {
		cursor: pointer;
		font-weight: 650;
		color: var(--text-2);
	}

	.accounts form {
		display: grid;
		gap: 12px;
		padding-top: 12px;
	}

	.columns {
		display: grid;
		gap: 10px;
		padding: 12px 14px;
		border-radius: var(--radius);
		background: var(--surface-2);
	}

	.column-grid {
		display: grid;
		gap: 8px 10px;
		grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
	}

	.column {
		display: grid;
		gap: 4px;
		min-width: 0;
	}

	.column-header {
		font-size: 12.5px;
		font-weight: 650;
		color: var(--muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.column .input {
		height: 38px;
		padding: 0 10px;
		border-radius: 10px;
		font-size: 14px;
	}

	.run {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 12px;
	}

	.run h3 {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 15px;
		margin-top: 4px;
	}

	.code {
		position: relative;
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 12px 14px;
		border-radius: var(--radius);
		background: var(--surface-2);
		border: 1px solid var(--border);
	}

	.code pre {
		flex: 1;
		min-width: 0;
		margin: 0;
		overflow-x: auto;
		font-size: 13px;
		line-height: 1.6;
	}

	.review-link {
		justify-self: start;
	}

	.retention {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		flex-wrap: wrap;
	}

	.retention p {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
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

	@media (max-width: 700px) {
		.row {
			grid-template-columns: 1fr;
		}

		/* The tick keeps the name beside it; the focus and remove controls drop under both. */
		.target {
			grid-template-columns: auto minmax(0, 1fr);
			gap: 6px 10px;
		}

		.target > :nth-child(n + 3) {
			grid-column: 1 / -1;
		}

		.other {
			width: 100%;
		}
	}
</style>
