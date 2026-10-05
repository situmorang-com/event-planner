<script lang="ts">
	import { enhance } from '$app/forms';
	import EventTabs from '$lib/components/EventTabs.svelte';
	import {
		briefIsReady,
		DEPARTMENTS,
		researchCommand,
		RESEARCH_TOKEN_VAR,
		SENIORITY
	} from '$lib/planning';
	import { lang, plural, t } from '$lib/i18n/t.svelte';
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
				? t(', in {batches} batches of up to {cap}, posting each batch back before the next', {
						batches: data.batches,
						cap: data.cap
					})
				: '';
		const left =
			out > 0
				? plural(
						out,
						'; the other ticked company was researched in the last 24 hours and is left out',
						'; the other {n} ticked companies were researched in the last 24 hours and are left out'
					)
				: '';
		const next = plural(
			data.pending,
			'The next run researches {n} company',
			'The next run researches {n} companies'
		);
		return `${next}${batches}${left}.`;
	});

	/** "researched 2 Oct", "requested 2 Oct" or nothing, for a target's research tick. */
	function researchNote(target: { researchedAt: number | null; requestedAt: number | null }) {
		if (target.researchedAt)
			return t('researched {date}', {
				date: formatDate(target.researchedAt, event.timezone, lang())
			});
		if (target.requestedAt)
			return t('requested {date}', {
				date: formatDate(target.requestedAt, event.timezone, lang())
			});
		return '';
	}

	/** The same text as researchedAllMessage (which the terminal prints), in the page's language. */
	function researchedAll(ticked: number) {
		return plural(
			ticked,
			'The only ticked company was researched in the last 24 hours. Tick another company, or remove and re-add one to research it again today.',
			'All {n} ticked companies were researched in the last 24 hours. Tick another company, or remove and re-add one to research it again today.'
		);
	}

	/** A translated sentence split around its {slots}, so links and code can sit inside it. */
	function pieces(text: string): { text?: string; slot?: string }[] {
		return text
			.split(/(\{\w+\})/)
			.filter(Boolean)
			.map((p) => (/^\{\w+\}$/.test(p) ? { slot: p.slice(1, -1) } : { text: p }));
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
			alert(t('That file is too big. Export fewer rows, or paste the ones you need.'));
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
		const companies = plural(c.added, '{n} company', '{n} companies');
		const parts = [
			c.brief === 'copied'
				? t('Copied the brief and {companies}', { companies })
				: t('Copied {companies}', { companies }),
			c.duplicates ? t('{n} already listed', { n: c.duplicates }) : '',
			c.brief === 'kept' ? t('your answers kept') : ''
		].filter(Boolean);
		return t('{parts} from {event}.', { parts: parts.join(' · '), event: c.from });
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
	<title>{t('Planning')} · {event.name} · Event Planner</title>
</svelte:head>

<a class="back btn btn-ghost btn-sm" href="/admin"><ArrowLeft size={16} /> {t('Events')}</a>

<header class="head">
	<div class="title">
		<div class="status">
			{#if event.is_open}
				<span class="pill pill-good"><span class="dot dot-live"></span> {t('Check-in open')}</span>
			{:else}
				<span class="pill">{t('Check-in closed')}</span>
			{/if}
		</div>
		<h1>{event.name}</h1>
		<p class="muted">
			{#if event.starts_at}{formatDateTime(event.starts_at, event.timezone, lang())}{/if}
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
		<h2>{t('Set the event date first')}</h2>
		<p class="muted">
			{t('Research keeps what it finds until the event starts, so it needs to know when that is.')}
		</p>
		<a class="btn btn-primary btn-lg" href="/admin/events/{event.id}#settings"
			>{t('Event settings')}</a
		>
	</section>
{:else}
	<!-- 1. Who to invite -->
	<section class="card step">
		<div class="step-head">
			<span class="step-number">1</span>
			<div>
				<h2>{t('Who should come?')}</h2>
				<p class="muted">
					{t('Claude researches against these answers, so the more specific the better.')}
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
				<label class="label" for="goal">{t('What is the event for?')}</label>
				<textarea
					class="input textarea"
					id="goal"
					name="goal"
					rows="2"
					placeholder={t(
						'A breakfast briefing on Dynamics 365 Finance for manufacturers planning to replace their ERP in the next two years.'
					)}>{brief.goal}</textarea
				>
			</div>
			<div class="field">
				<label class="label" for="roles">{t('Which roles or job titles?')}</label>
				<input
					class="input"
					id="roles"
					name="roles"
					value={brief.roles}
					placeholder={t('CIO, CFO, Head of IT, ERP project lead')}
				/>
			</div>
			<fieldset>
				<legend class="label">{t('How senior?')}</legend>
				<div class="chips">
					{#each SENIORITY as level (level)}
						<label class="chip">
							<input
								type="checkbox"
								name="seniority"
								value={level}
								checked={brief.seniority.includes(level)}
							/>
							{t(level)}
						</label>
					{/each}
				</div>
			</fieldset>
			<fieldset>
				<legend class="label">{t('Which departments?')}</legend>
				<div class="chips">
					{#each DEPARTMENTS as dept (dept)}
						<label class="chip">
							<input
								type="checkbox"
								name="departments"
								value={dept}
								checked={brief.departments.includes(dept)}
							/>
							{t(dept)}
						</label>
					{/each}
					<input
						class="input other"
						name="otherDepartments"
						value={otherDepartments}
						placeholder={t('Others, comma-separated')}
						aria-label={t('Other departments')}
					/>
				</div>
			</fieldset>
			<div class="row">
				<div class="field per-company">
					<label class="label" for="perCompany">{t('At most how many per company?')}</label>
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
					<label class="label" for="avoid">{t('Who should be left out?')}</label>
					<input
						class="input"
						id="avoid"
						name="avoid"
						value={brief.avoid}
						placeholder={t('Competitors, interns, people our sales team already meets')}
					/>
					<p class="hint">
						{t(
							'Roles and companies, not names: the brief Claude gets counts the people already known per company and never carries a name, so a line naming someone is left out of it.'
						)}
					</p>
				</div>
			</div>
			<div class="actions">
				{#if briefSaved}<span class="saved"><Check size={16} /> {t('Saved')}</span>{/if}
				<button class="btn btn-primary">{t('Save answers')}</button>
			</div>
		</form>
	</section>

	<!-- 2. Target companies -->
	<section class="card step">
		<div class="step-head">
			<span class="step-number">2</span>
			<div>
				<h2>{t('Target companies')}</h2>
				<p class="muted">
					{plural(
						brief.perCompany,
						'The companies to find people at. Add a focus to change the brief for one company (roles and departments, not names). The tick says whether the next run researches it: by default, until {n} contactable person is known there. A company researched in the last 24 hours is left out of the next run; the command takes the rest {cap} at a time.',
						'The companies to find people at. Add a focus to change the brief for one company (roles and departments, not names). The tick says whether the next run researches it: by default, until {n} contactable people are known there. A company researched in the last 24 hours is left out of the next run; the command takes the rest {cap} at a time.',
						{ cap: data.cap }
					)}
				</p>
			</div>
		</div>

		{#if data.targets.length}
			<ul class="targets">
				{#each data.targets as target (target.id)}
					{@const done = !!target.researchedAt && !target.ticked && !target.blocked}
					<li class="target" class:unticked={!target.ticked && !done}>
						{#if done}
							<!-- Researched and out of the queue: a status, not a box to tick. -->
							<span
								class="done"
								title={t('Researched {date}', {
									date: formatDate(target.researchedAt!, event.timezone, lang())
								})}
							>
								<Check size={15} strokeWidth={3} />
								<span class="sr-only">{t('Researched')}</span>
							</span>
						{:else}
							<form
								method="POST"
								action="?/research"
								class="tick-form"
								use:enhance={() =>
									async ({ update }) =>
										update({ reset: false })}
							>
								<input type="hidden" name="id" value={target.id} />
								<!-- The hidden value is what the next click sends: the opposite of the tick. -->
								<input type="hidden" name="research" value={target.ticked ? '0' : '1'} />
								<label
									class="tick"
									title={target.blocked ? t('Blocked company') : t('Research this company')}
								>
									<input
										type="checkbox"
										checked={target.ticked}
										disabled={target.blocked}
										onchange={(e) => e.currentTarget.form?.requestSubmit()}
									/>
									<span class="sr-only">{t('Research {company}', { company: target.name })}</span>
								</label>
							</form>
						{/if}
						<div class="target-name">
							<strong>{target.name}</strong>
							{#if target.website}
								<a
									class="muted small"
									href={target.website.startsWith('http')
										? target.website
										: `https://${target.website}`}
									target="_blank"
									rel="noreferrer">{target.website.replace(/^https?:\/\//, '')}</a
								>
							{/if}
							<span class="muted small">
								{t('{n} on the list', { n: target.live })}{target.waiting
									? ` · ${t('{n} to review', { n: target.waiting })}`
									: ''}
								{#if target.phoneCountry}
									· <span title={t('Phone country, set on the People tab')}
										>{target.phoneCountry === 'MY' ? '+60 Malaysia' : '+62 Indonesia'}</span
									>
								{/if}
								{#if target.blocked}
									· <span class="bad">{t('blocked')}</span>
								{:else if done}
									· <span class="done-text"
										>{t('Researched {date}', {
											date: formatDate(target.researchedAt!, event.timezone, lang())
										})}</span
									>
								{:else if target.research === null}
									· {target.ticked
										? t('research by default')
										: t('{n} known, not researched', { n: target.known })}
								{/if}
								{#if !done && researchNote(target)}· {researchNote(target)}{/if}
							</span>
							{#if done}
								<form
									method="POST"
									action="?/research"
									use:enhance={() =>
										async ({ update }) =>
											update({ reset: false })}
								>
									<input type="hidden" name="id" value={target.id} />
									<input type="hidden" name="research" value="1" />
									<button
										class="btn btn-ghost btn-sm reset"
										title={t('Put it back in the queue for the next run')}
									>
										{t('Research again')}
									</button>
								</form>
							{:else if target.research !== null}
								<form
									method="POST"
									action="?/research"
									use:enhance={() =>
										async ({ update }) =>
											update({ reset: false })}
								>
									<input type="hidden" name="id" value={target.id} />
									<button
										class="btn btn-ghost btn-sm reset"
										title={t('Back to the computed default')}
									>
										{t('default')}
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
							<input type="hidden" name="id" value={target.id} />
							<input
								class="focus"
								name="focus"
								value={target.focus}
								placeholder={t('Focus for this company: roles and departments, not names')}
								aria-label={t('Focus for {company}', { company: target.name })}
								onblur={(e) => saveOnBlur(e, target.focus)}
								onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), e.currentTarget.blur())}
							/>
						</form>
						<form
							method="POST"
							action="?/removeTarget"
							use:enhance={({ cancel }) => {
								if (
									!confirm(
										t('Remove {company} from the targets? Its guests stay on the list.', {
											company: target.name
										})
									)
								)
									cancel();
							}}
						>
							<input type="hidden" name="id" value={target.id} />
							<button
								class="btn btn-ghost btn-icon btn-sm"
								title={t('Remove {company}', { company: target.name })}
							>
								<Trash2 size={15} /><span class="sr-only"
									>{t('Remove {company}', { company: target.name })}</span
								>
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
				aria-label={t('Companies to add')}
				placeholder={t('One company per line, with its website if you know it:') +
					'\nBatavia Foods, bataviafoods.co.id\nSelat Energy'}></textarea>
			<div class="actions">
				{#if form && 'targetError' in form}<p class="error-text">
						{t(form.targetError ?? '')}
					</p>{/if}
				{#if form && 'targetsAdded' in form}
					<p class="muted small">
						{t('Added {n}', { n: form.targetsAdded ?? 0 })}{form.targetDuplicates?.length
							? t('; {companies} already listed', {
									companies: form.targetDuplicates.join(', ')
								})
							: ''}.
					</p>
				{/if}
				<button class="btn btn-secondary"><Plus size={16} /> {t('Add companies')}</button>
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
									t(
										'Replace this event’s answers to “Who should come?” with {event}’s? Cancel keeps your answers; the companies are copied either way.',
										{ event: from.name }
									)
								)
									? '1'
									: '0'
							);
						return async ({ update }) => update({ reset: false });
					}}
				>
					<label class="label" for="copy-from">{t('Copy brief + targets from…')}</label>
					<div class="copy-row">
						<select class="input" id="copy-from" name="from" required>
							<option value="">{t('Another event')}</option>
							{#each data.sources as s (s.id)}
								<option value={s.id}>
									{s.name}{s.starts_at ? ` · ${formatDate(s.starts_at, s.timezone, lang())}` : ''} ·
									{plural(s.targets, '{n} company', '{n} companies')}{s.brief
										? ` + ${t('brief')}`
										: ''}
								</option>
							{/each}
						</select>
						<button class="btn btn-secondary"><Copy size={16} /> {t('Copy')}</button>
					</div>
					{#if form && 'copyError' in form}<p class="error-text">{t(form.copyError ?? '')}</p>{/if}
					{#if copyResult}
						<p class="muted small"><Check size={14} /> {copiedMessage(copyResult)}</p>
					{/if}
				</form>
			{/if}

			<details class="accounts" open={!!accountsPreview}>
				<summary>{t('Paste a Dynamics 365 accounts export')}</summary>
				<form
					method="POST"
					action="?/accounts"
					use:enhance={() =>
						async ({ update }) =>
							update({ reset: false })}
				>
					<p class="hint">
						{#each pieces(t('Open an Accounts view in Dynamics 365, export or copy it with its header row ({columns}) and paste it here. Each account becomes a target company recorded as a customer; its owner becomes the company’s owner when it names a team member and nobody owns it yet, otherwise it is kept as a note. The primary contact and phone are not kept: add people on the People tab.')) as p, i (i)}{#if p.slot === 'columns'}{#each ['Account Name', 'Website', 'Primary Contact', 'Owner', 'Industry', 'Main Phone'] as h, j (h)}{j
										? ', '
										: ''}<em>{h}</em>{/each}{:else}{p.text ?? ''}{/if}{/each}
					</p>
					<textarea
						class="input textarea"
						name="accounts"
						rows="4"
						aria-label={t('Dynamics 365 accounts export')}
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
									{t('The app couldn’t tell which column is which. Say what each one holds:')}
								{:else}
									{plural(
										accountsPreview.count,
										'{matched} of {total} columns recognised, {n} company to add. Change any that landed in the wrong place:',
										'{matched} of {total} columns recognised, {n} companies to add. Change any that landed in the wrong place:',
										{
											matched: Object.keys(accountsPreview.columns).length,
											total: accountsPreview.headers.length
										}
									)}
								{/if}
							</p>
							<div class="column-grid">
								{#each accountsPreview.headers as cell, i (i)}
									<label class="column">
										<span class="column-header" title={cell}
											>{cell || t('Column {n}', { n: i + 1 })}</span
										>
										<select
											class="input"
											value={accountColumnAt(i)}
											onchange={(e) => remapAccount(i, e.currentTarget.value)}
										>
											<option value="">{t('Ignore')}</option>
											{#each data.accountOptions as o (o.key)}
												<option value={o.key}>{t(o.label)}</option>
											{/each}
										</select>
									</label>
								{/each}
							</div>
							<label class="chip">
								<input type="checkbox" bind:checked={accountHeader} />
								{t('The first line is a header row, not a company')}
							</label>
						</div>
					{/if}
					<div class="actions">
						{#if form && 'accountsError' in form}<p class="error-text">
								{t(form.accountsError ?? '')}
							</p>{/if}
						{#if accountsResult}
							<p class="muted small">
								{t('Added {n}', { n: accountsResult.added.length })}{accountsResult.duplicates
									.length
									? ` · ${t('{n} already listed', { n: accountsResult.duplicates.length })}`
									: ''}{accountsResult.skipped
									? ` · ${plural(accountsResult.skipped, '{n} line without a name', '{n} lines without a name')}`
									: ''}{accountsResult.truncated
									? ` · ${t('only the first 1000 lines were read')}`
									: ''}.
								{#if accountsResult.blocked.length}
									<span class="bad"
										>{t('Blocked, not added: {companies}.', {
											companies: accountsResult.blocked.join(', ')
										})}</span
									>
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
							<FileUp size={15} />
							{t('Open a CSV file')}
						</button>
						<button
							class="btn btn-ghost btn-sm"
							name="preview"
							value="1"
							disabled={!accountsText.trim()}
						>
							<Columns3 size={15} />
							{t('Check columns')}
						</button>
						<button class="btn btn-secondary" disabled={!accountsText.trim()}>
							<Plus size={16} />
							{t('Add accounts')}
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
				<h2>{t('Find people with Claude')}</h2>
				<p class="muted">
					{t(
						'Runs in your terminal with your own Claude Code sign-in. Claude only gets web search, never your Event Planner token, and everything it finds waits on the People tab for your approval.'
					)}
				</p>
			</div>
		</div>

		{#if data.started}
			<p class="banner banner-warn">
				{t(
					'The event has started: research still runs, but the list has gone live, so what it finds now is not kept. Found rows nobody approved were deleted when it began.'
				)}
			</p>
		{/if}
		{#if !ready}
			<p class="banner banner-warn">
				{briefIsReady(brief)
					? t('Add at least one target company first.')
					: t('Answer “which roles”, “how senior” or “which departments” above and save first.')}
			</p>
		{:else if data.refusal}
			<p class="banner banner-warn">{t(data.refusal)}</p>
		{:else if data.pending === 0}
			<!-- Ticked, but all answered today: the command would print this and stop. -->
			<p class="banner">{researchedAll(data.ticked)}</p>
		{:else}
			<p class="muted small">{forecast}</p>
		{/if}

		<div class="run">
			<h3><KeyRound size={16} /> {t('Access token')}</h3>
			<p class="hint">
				{#each pieces(t('The command reads {variable} from your shell. Create one under {settings} and export it once in the terminal you research from (or in {profile}).')) as p, i (i)}{#if p.slot === 'variable'}<code
							>{RESEARCH_TOKEN_VAR}</code
						>{:else if p.slot === 'settings'}<a href="/admin/settings#tokens"
							>{t('Settings › API tokens')}</a
						>{:else if p.slot === 'profile'}<code>~/.zshrc</code>{:else}{p.text ?? ''}{/if}{/each}
			</p>

			<h3><Sparkles size={16} /> {t('Command')}</h3>
			<div class="code">
				<pre>{command}</pre>
				<button class="btn btn-secondary btn-sm" onclick={() => copy(command, 'command')}>
					{#if copied === 'command'}<Check size={15} /> {t('Copied')}{:else}<Copy size={15} />
						{t('Copy')}{/if}
				</button>
			</div>
			<p class="hint">
				{#each pieces(t("Up to {cap} companies per batch, a few minutes per company; each batch is posted back before the next starts, and Claude's raw answers are saved as {files} files in the folder you run it from. If it stops part-way, run it again: companies researched in the last 24 hours are left out, and people already invited, suggested or dismissed are skipped.")) as p, i (i)}{#if p.slot === 'cap'}{data.cap}{:else if p.slot === 'files'}<code
							>event-planner-research-…json</code
						>{:else}{p.text ?? ''}{/if}{/each}
			</p>
		</div>
	</section>

	<!-- 4. Review -->
	<section class="card step">
		<div class="step-head">
			<span class="step-number">4</span>
			<div>
				<h2>{t('Review what it found')}</h2>
				<p class="muted">
					{#if data.toReview}
						{#each pieces(plural(data.toReview, '{n} person waits under {tab} on the People tab: open the source, then Add or Skip each one.', '{n} people wait under {tab} on the People tab: open the source, then Add or Skip each one.')) as p, i (i)}{#if p.slot === 'tab'}<strong
									>{t('To review')}</strong
								>{:else}{p.text ?? ''}{/if}{/each}
					{:else}
						{t('Nothing to review yet. Suggestions appear on the People tab after a run.')}
					{/if}
					{#if data.accepted}
						<span
							>{t('{n} added so far; anyone added or skipped is not suggested again.', {
								n: data.accepted
							})}</span
						>
					{/if}
				</p>
			</div>
		</div>
		<a class="btn btn-secondary review-link" href="/admin/events/{event.id}/people">
			<UserCheck size={16} />
			{t('Open People')}{data.toReview ? ` · ${t('{n} to review', { n: data.toReview })}` : ''}
		</a>
	</section>

	<!-- Retention (D10): what research left behind, and the button that deletes it now. -->
	<section class="card step" id="retention">
		<div class="step-head">
			<span class="step-number"><Timer size={15} /></span>
			<div>
				<h2>{t('Planning data')}</h2>
				<p class="muted">
					{t(
						'What research finds is personal data with a short life: the names nobody approved go when the event starts, and everything left, skipped names and the research stamps on the companies, goes 90 days after the start. The brief and the target companies stay, so a later event can copy them.'
					)}
				</p>
			</div>
		</div>
		<div class="retention">
			<p>
				{#if event.planning_purged_at}
					{t('Planning data deleted {date}', {
						date: formatDate(event.planning_purged_at, event.timezone, lang())
					})}{data.retention.found ? t('; {n} found since', { n: data.retention.found }) : ''}.
				{:else if data.retention.keptUntil}
					{t('Kept until {date}', {
						date: formatDate(data.retention.keptUntil, event.timezone, lang())
					})}{data.retention.found
						? ` · ${plural(data.retention.found, '{n} found row now', '{n} found rows now')}`
						: ''}.
				{/if}
				{#if form && 'purged' in form && form.purged !== null}
					<span class="saved"><Check size={16} /> {t('Deleted {n}', { n: form.purged ?? 0 })}</span>
				{/if}
			</p>
			{#if data.retention.found}
				<form
					method="POST"
					action="?/purge"
					use:enhance={({ cancel }) => {
						if (
							!confirm(
								plural(
									data.retention.found,
									'Delete this event’s planning data now? {n} found row goes, with the research stamps. The brief and the companies stay. This is logged.',
									'Delete this event’s planning data now? {n} found rows go, with the research stamps. The brief and the companies stay. This is logged.'
								)
							)
						)
							cancel();
					}}
				>
					<button class="btn btn-danger"><Trash2 size={16} /> {t('Delete planning data')}</button>
				</form>
			{/if}
		</div>
	</section>

	<!-- Invitation wording (D21): this event's own text over the message default. -->
	<section class="card step" id="invitation">
		<div class="step-head">
			<span class="step-number"><MessageSquareText size={15} /></span>
			<div>
				<h2>{t('Invitation wording')}</h2>
				<p class="muted">
					{#each pieces(t('What the WhatsApp and email buttons open for people not yet invited. Leave it blank to use the {link} in each person’s language; text here is sent to everyone on this list as written. The opt-out line is always added at the end.')) as p, i (i)}{#if p.slot === 'link'}<a
								href="/admin/settings#messages">{t('message default')}</a
							>{:else}{p.text ?? ''}{/if}{/each}
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
					{t('This event’s invitation')} <span class="optional">{t('(optional)')}</span>
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
					{t('Placeholders:')}
					{#each data.invitation.placeholders as p, i (p)}{i ? ', ' : ''}<code>{p}</code>{/each}. {t(
						'Blank means the {language} default shown above.',
						{
							language: t(data.invitation.languageLabel)
						}
					)}
				</p>
			</div>
			{#if form && 'invitationError' in form}<p class="error-text">
					{t(form.invitationError ?? '')}
				</p>{/if}
			<div class="actions">
				{#if invitationSaved}<span class="saved"><Check size={16} /> {t('Saved')}</span>{/if}
				<button class="btn btn-primary">{t('Save wording')}</button>
			</div>
		</form>
	</section>

	<!-- Chase rules (D20): this event's own over the settings defaults. -->
	<section class="card step" id="chase">
		<div class="step-head">
			<span class="step-number"><CalendarClock size={15} /></span>
			<div>
				<h2>{t('Chase rules')}</h2>
				<p class="muted">
					{#each pieces(t('When people on this list become due: a chase so many working days after the last message, until the cap for that person is reached or the event is too close; a reminder shortly before for everyone attending. The {link} apply unless this event sets its own.')) as p, i (i)}{#if p.slot === 'link'}<a
								href="/admin/settings#chase">{t('defaults')}</a
							>{:else}{p.text ?? ''}{/if}{/each}
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
				{t('Use the defaults')}
			</label>
			<div class="chase-grid" class:dimmed={useDefaults}>
				{#each data.chase.fields as f (f.key)}
					<div class="field">
						<label class="label" for="chase-{f.key}">{t(f.label)}</label>
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
							{#if f.unit}<span class="muted small">{t(f.unit)}</span>{/if}
						</div>
					</div>
				{/each}
			</div>
			{#if form && 'chaseError' in form}<p class="error-text">{form.chaseError}</p>{/if}
			<div class="actions">
				{#if chaseSaved}<span class="saved"><Check size={16} /> {t('Saved')}</span>{/if}
				<button class="btn btn-primary">{t('Save chase rules')}</button>
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

	/* Researched: a filled check where the box was, so done and queued can't be mistaken. */
	.done {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
	}

	.done :global(svg) {
		padding: 2px;
		border-radius: 50%;
		background: var(--good);
		color: var(--surface);
		width: 20px;
		height: 20px;
	}

	.done-text {
		color: var(--good);
		font-weight: 650;
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
