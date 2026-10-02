<script lang="ts">
	import { enhance } from '$app/forms';
	import EventTabs from '$lib/components/EventTabs.svelte';
	import { briefIsReady, DEPARTMENTS, SENIORITY } from '$lib/planning';
	import { formatDateTime, timeAgo } from '$lib/time';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Check from '@lucide/svelte/icons/check';
	import Copy from '@lucide/svelte/icons/copy';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import Plus from '@lucide/svelte/icons/plus';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import UserPlus from '@lucide/svelte/icons/user-plus';
	import X from '@lucide/svelte/icons/x';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const event = $derived(data.event);
	const brief = $derived(data.brief);
	const otherDepartments = $derived(
		brief.departments.filter((d) => !DEPARTMENTS.includes(d)).join(', ')
	);
	const ready = $derived(briefIsReady(brief) && data.targets.length > 0);

	let briefSaved = $state(false);
	let copied = $state<string | null>(null);

	const promptUrl = $derived(`${data.base}/api/research/events/${event.id}/prompt`);
	const postUrl = $derived(`${data.base}/api/research/events/${event.id}/suggestions`);
	// The agent gets web tools only and never the token: curl fetches its brief and posts its answer.
	const command = $derived(
		[
			// The brief is fetched first: if the app refuses it, its reason is printed and Claude never runs.
			`brief=$(curl -sS --fail-with-body -H "Authorization: Bearer $EVENT_PLANNER_TOKEN" ${promptUrl}) || { echo "$brief" >&2; false; } \\`,
			`  && printf '%s' "$brief" \\`,
			`  | claude -p --tools "WebSearch WebFetch" --allowedTools "WebSearch WebFetch" --output-format json \\`,
			`  | tee "event-planner-research-${event.id}-$(date +%H%M).json" \\`,
			`  | curl -sS --fail-with-body -H "Authorization: Bearer $EVENT_PLANNER_TOKEN" -H "content-type: application/json" --data-binary @- ${postUrl}`
		].join('\n')
	);
	const newToken = $derived(form && 'token' in form ? form.token : null);

	const groups = $derived.by(() => {
		const byCompany = new Map<string, typeof data.suggestions>();
		for (const s of data.suggestions)
			byCompany.set(s.company, [...(byCompany.get(s.company) ?? []), s]);
		return [...byCompany].sort((a, b) => a[0].localeCompare(b[0], 'en', { sensitivity: 'base' }));
	});

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
	checkins={data.checkins}
	invitations={data.invitations}
	suggestions={data.suggestions.length}
/>

<!-- 1. Who to invite -->
<section class="card step">
	<div class="step-head">
		<span class="step-number">1</span>
		<div>
			<h2>Who should come?</h2>
			<p class="muted">Claude researches against these answers, so the more specific the better.</p>
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
				The companies to find people at. Add a focus to change the brief for one company.
			</p>
		</div>
	</div>

	{#if data.targets.length}
		<ul class="targets">
			{#each data.targets as t (t.id)}
				<li class="target">
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
							{t.invited} invited{t.suggested ? ` · ${t.suggested} to review` : ''}
						</span>
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
							placeholder="Focus for this company (optional)"
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
</section>

<!-- 3. Run the research -->
<section class="card step">
	<div class="step-head">
		<span class="step-number">3</span>
		<div>
			<h2>Find people with Claude</h2>
			<p class="muted">
				Runs in your terminal with your own Claude login. Claude only gets web search, never your
				Event Planner token, and everything it finds waits below for your approval.
			</p>
		</div>
	</div>

	{#if !ready}
		<p class="banner banner-warn">
			{briefIsReady(brief)
				? 'Add at least one target company first.'
				: 'Answer “which roles”, “how senior” or “which departments” above and save first.'}
		</p>
	{/if}

	<div class="run">
		<h3><KeyRound size={16} /> Access token</h3>
		{#if newToken}
			<p class="banner banner-brand">
				Copy this now; it won’t be shown again. Run it in the terminal you’ll research from (or add
				it to <code>~/.zshrc</code>).
			</p>
			<div class="code">
				<pre>export EVENT_PLANNER_TOKEN={newToken}</pre>
				<button
					class="btn btn-secondary btn-sm"
					onclick={() => copy(`export EVENT_PLANNER_TOKEN=${newToken}`, 'token')}
				>
					{#if copied === 'token'}<Check size={15} /> Copied{:else}<Copy size={15} /> Copy{/if}
				</button>
			</div>
		{/if}
		{#if data.tokens.length}
			<ul class="tokens">
				{#each data.tokens as t (t.id)}
					<li>
						<span>{t.label}</span>
						<span class="muted small">
							created {timeAgo(t.created_at, Date.now())}{t.last_used_at
								? ` · last used ${timeAgo(t.last_used_at, Date.now())}`
								: ' · never used'}
						</span>
						<form
							method="POST"
							action="?/revokeToken"
							use:enhance={({ cancel }) => {
								if (!confirm('Revoke this token? Anything using it stops working.')) cancel();
							}}
						>
							<input type="hidden" name="id" value={t.id} />
							<button class="btn btn-ghost btn-sm">Revoke</button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}
		<form method="POST" action="?/createToken" use:enhance class="new-token">
			<input
				class="input"
				name="label"
				placeholder="Label, e.g. Edmund’s MacBook"
				aria-label="Token label"
			/>
			<button class="btn btn-secondary btn-sm">Create a token</button>
		</form>

		<h3><Sparkles size={16} /> Command</h3>
		<div class="code">
			<pre>{command}</pre>
			<button class="btn btn-secondary btn-sm" onclick={() => copy(command, 'command')}>
				{#if copied === 'command'}<Check size={15} /> Copied{:else}<Copy size={15} /> Copy{/if}
			</button>
		</div>
		<p class="hint">
			It takes a few minutes per company. Claude's raw answer is also saved as a
			<code>event-planner-research-…json</code> file in the folder you run it from, so nothing is lost
			if the last step fails. Run it again any time: people already invited, suggested or dismissed are
			skipped.
		</p>
	</div>
</section>

<!-- 4. Review -->
<section class="card step">
	<div class="step-head">
		<span class="step-number">4</span>
		<div>
			<h2>Suggested people</h2>
			<p class="muted">
				{data.suggestions.length
					? 'Check each one before adding: open the source to confirm they still hold the role.'
					: 'Nothing to review yet. Suggestions appear here after a run.'}
				{#if data.accepted || data.dismissed}
					<span>
						{data.accepted} added, {data.dismissed} dismissed so far; neither is suggested again.</span
					>
				{/if}
			</p>
		</div>
	</div>

	{#each groups as [company, people] (company)}
		<div class="suggest-group">
			<div class="suggest-head">
				<h3>{company}</h3>
				{#if people.length > 1}
					<form method="POST" action="?/accept" use:enhance>
						{#each people as p (p.id)}<input type="hidden" name="id" value={p.id} />{/each}
						<button class="btn btn-ghost btn-sm"
							><UserPlus size={15} /> Add all {people.length}</button
						>
					</form>
				{/if}
			</div>
			<ul>
				{#each people as p (p.id)}
					<li class="suggestion">
						<div class="who">
							<p>
								<strong>{p.name}</strong>
								{#if p.jobTitle}<span class="muted"> · {p.jobTitle}</span>{/if}
							</p>
							{#if p.reason}<p class="reason">{p.reason}</p>{/if}
							<p class="links">
								{#if p.linkedin}<a href={p.linkedin} target="_blank" rel="noreferrer"
										>LinkedIn <ExternalLink size={12} /></a
									>{/if}
								{#if p.sourceUrl}<a href={p.sourceUrl} target="_blank" rel="noreferrer"
										>Source: {new URL(p.sourceUrl).hostname.replace(/^www\./, '')}
										<ExternalLink size={12} /></a
									>{/if}
							</p>
						</div>
						<div class="decide">
							<form method="POST" action="?/accept" use:enhance>
								<input type="hidden" name="id" value={p.id} />
								<button class="btn btn-soft btn-sm"><UserPlus size={15} /> Add</button>
							</form>
							<form method="POST" action="?/dismiss" use:enhance>
								<input type="hidden" name="id" value={p.id} />
								<button class="btn btn-ghost btn-icon btn-sm" title="Dismiss {p.name}">
									<X size={16} /><span class="sr-only">Dismiss {p.name}</span>
								</button>
							</form>
						</div>
					</li>
				{/each}
			</ul>
		</div>
	{/each}
</section>

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

	.targets,
	.tokens,
	.suggest-group ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.target {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr) auto;
		align-items: center;
		gap: 12px;
		padding: 10px 0;
		border-top: 1px solid var(--border);
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

	.tokens li {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 6px 0;
	}

	.tokens li span:first-child {
		font-weight: 650;
	}

	.tokens form {
		margin-left: auto;
	}

	.new-token {
		display: flex;
		gap: 8px;
		max-width: 520px;
	}

	.new-token .input {
		height: 36px;
	}

	.suggest-group {
		border-top: 1px solid var(--border);
		padding-top: 12px;
	}

	.suggest-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 4px;
	}

	.suggest-head h3 {
		font-size: 16px;
	}

	.suggestion {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		padding: 10px 0;
	}

	.who {
		display: grid;
		gap: 2px;
		min-width: 0;
	}

	.reason {
		font-size: 14px;
		color: var(--text-2);
	}

	.links {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 14px;
		font-size: 13.5px;
	}

	.links a {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-weight: 600;
	}

	.decide {
		display: flex;
		gap: 4px;
	}

	@media (max-width: 700px) {
		.row,
		.target {
			grid-template-columns: 1fr;
		}

		.target {
			gap: 6px;
		}

		.other {
			width: 100%;
		}
	}
</style>
