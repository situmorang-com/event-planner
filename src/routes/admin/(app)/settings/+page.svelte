<script lang="ts">
	import { enhance } from '$app/forms';
	import { timeAgo } from '$lib/time';
	import CalendarClock from '@lucide/svelte/icons/calendar-clock';
	import Check from '@lucide/svelte/icons/check';
	import Copy from '@lucide/svelte/icons/copy';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import MessageSquareText from '@lucide/svelte/icons/message-square-text';
	import Phone from '@lucide/svelte/icons/phone';
	import Plus from '@lucide/svelte/icons/plus';
	import ShieldBan from '@lucide/svelte/icons/shield-ban';
	import Users from '@lucide/svelte/icons/users';
	import X from '@lucide/svelte/icons/x';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let copied = $state(false);
	let removing = $state<number | null>(null);

	const newToken = $derived(form && 'token' in form ? form.token : null);
	const unblockId = $derived(form && 'unblockId' in form ? form.unblockId : null);

	// One language's bodies show at a time; the one just saved (or refused) stays open.
	function openLanguage(): string {
		if (form && 'templatesSaved' in form && form.templatesSaved) return String(form.templatesSaved);
		if (form && 'templateLanguage' in form && form.templateLanguage)
			return String(form.templateLanguage);
		return data.messages.languages[0].key;
	}
	// svelte-ignore state_referenced_locally
	let language = $state(openLanguage());
	const templatesSaved = $derived(
		form && 'templatesSaved' in form && form.templatesSaved === language
	);
	const templateError = $derived(
		form &&
			'templateError' in form &&
			(!('templateLanguage' in form) || form.templateLanguage === language)
			? form.templateError
			: null
	);

	const KIND_LABEL = { email: 'Email', phone: 'Mobile', name_company: 'Name + company' } as const;
	const SOURCE_LABEL = {
		staff: 'Staff',
		stop_reply: 'Replied STOP',
		not_me: 'Not me',
		remove_me: 'Remove me'
	} as const;

	async function copyToken() {
		if (!newToken) return;
		await navigator.clipboard.writeText(`export EVENT_PLANNER_TOKEN=${newToken}`);
		copied = true;
		setTimeout(() => (copied = false), 1600);
	}

	// The settings page has no event, so timestamps are relative with the exact time on hover.
	const when = (ts: number) => timeAgo(ts, data.now);
	const exact = (ts: number) => new Date(ts).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
</script>

<svelte:head>
	<title>Settings · Event Planner</title>
</svelte:head>

<div class="head">
	<h1>Settings</h1>
	<p class="muted">Shared by everyone who signs in.</p>
</div>

<!-- Team names -->
<section class="card block" id="team">
	<div class="block-head">
		<span class="block-icon"><Users size={18} /></span>
		<div>
			<h2>Team names</h2>
			<p class="muted">
				Who can be picked as “me” in the header. The name is stamped on everything that person does:
				rows they add, people they invite, locks and exports.
			</p>
		</div>
	</div>
	{#if data.team.length}
		<ul class="list">
			{#each data.team as name (name)}
				<li>
					<span class="list-main">{name}</span>
					{#if name === data.who}<span class="pill pill-brand tiny">you</span>{/if}
					<form
						method="POST"
						action="?/removeTeam"
						use:enhance={({ cancel }) => {
							if (!confirm(`Remove ${name} from the team? Their past stamps stay as they are.`))
								cancel();
						}}
					>
						<input type="hidden" name="name" value={name} />
						<button class="btn btn-ghost btn-icon btn-sm" title="Remove {name}">
							<X size={16} /><span class="sr-only">Remove {name}</span>
						</button>
					</form>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="placeholder muted">No names yet. Add the people who run events.</p>
	{/if}
	<form class="inline" method="POST" action="?/addTeam" use:enhance>
		<input class="input" name="name" placeholder="Name, as you’d like it shown" aria-label="Name" />
		<button class="btn btn-secondary"><Plus size={16} /> Add</button>
		{#if form && 'teamError' in form}<p class="error-text">{form.teamError}</p>{/if}
	</form>
</section>

<!-- API tokens -->
<section class="card block" id="tokens">
	<div class="block-head">
		<span class="block-icon"><KeyRound size={18} /></span>
		<div>
			<h2>API tokens</h2>
			<p class="muted">
				For the research command on an event’s Planning tab. A token is shown once; only its hash is
				kept, and anything using a revoked one stops working.
			</p>
		</div>
	</div>
	{#if newToken}
		<p class="banner banner-brand">
			Copy this now; it won’t be shown again. Run it in the terminal you’ll research from (or add it
			to <code>~/.zshrc</code>).
		</p>
		<div class="code">
			<pre>export EVENT_PLANNER_TOKEN={newToken}</pre>
			<button class="btn btn-secondary btn-sm" onclick={copyToken}>
				{#if copied}<Check size={15} /> Copied{:else}<Copy size={15} /> Copy{/if}
			</button>
		</div>
	{/if}
	{#if data.tokens.length}
		<ul class="list">
			{#each data.tokens as t (t.id)}
				<li>
					<span class="list-main">{t.label}</span>
					<span class="muted small">
						created {when(t.created_at)}{t.last_used_at
							? ` · last used ${when(t.last_used_at)}`
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
	{:else}
		<p class="placeholder muted">No tokens yet.</p>
	{/if}
	<form class="inline" method="POST" action="?/createToken" use:enhance>
		<input
			class="input"
			name="label"
			placeholder="Label, e.g. Edmund’s MacBook"
			aria-label="Token label"
		/>
		<button class="btn btn-secondary"><Plus size={16} /> Create a token</button>
	</form>
</section>

<!-- Phone-country default -->
<section class="card block" id="phone">
	<div class="block-head">
		<span class="block-icon"><Phone size={18} /></span>
		<div>
			<h2>Phone country</h2>
			<p class="muted">
				How local numbers such as 0812-3456-7890 are read when nothing says otherwise. New events
				start with this; each event and company can pick its own.
			</p>
		</div>
	</div>
	<form
		class="inline"
		method="POST"
		action="?/phoneCountry"
		use:enhance={() =>
			async ({ update }) =>
				update({ reset: false })}
	>
		<select class="input" name="country" aria-label="Default phone country">
			<option value="ID" selected={data.phoneCountry === 'ID'}>Indonesia (+62)</option>
			<option value="MY" selected={data.phoneCountry === 'MY'}>Malaysia (+60)</option>
		</select>
		<button class="btn btn-secondary">Save</button>
		{#if form && 'phoneSaved' in form}<span class="saved"><Check size={16} /> Saved</span>{/if}
		{#if form && 'phoneError' in form}<p class="error-text">{form.phoneError}</p>{/if}
	</form>
</section>

<!-- Chase defaults -->
<section class="card block" id="chase">
	<div class="block-head">
		<span class="block-icon"><CalendarClock size={18} /></span>
		<div>
			<h2>Chase defaults</h2>
			<p class="muted">
				When a row becomes due (D20): a chase so many working days after the last message, until the
				cap for that person is reached or the event is too close; a reminder for everyone attending
				shortly before. Working days are Monday to Friday in the event’s time zone. An event can set
				its own rules on its Planning tab.
			</p>
		</div>
	</div>
	<form
		class="chase"
		method="POST"
		action="?/chase"
		use:enhance={() =>
			async ({ update }) =>
				update({ reset: false })}
	>
		<div class="chase-grid">
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
							value={data.chase.values[f.key]}
						/>
						{#if f.unit}<span class="muted small">{f.unit}</span>{/if}
					</div>
				</div>
			{/each}
		</div>
		<div class="actions">
			{#if form && 'chaseError' in form}<p class="error-text">{form.chaseError}</p>{/if}
			{#if form && 'chaseSaved' in form}<span class="saved"><Check size={16} /> Saved</span>{/if}
			<button class="btn btn-primary">Save chase defaults</button>
		</div>
	</form>
</section>

<!-- Message defaults -->
<section class="card block" id="messages">
	<div class="block-head">
		<span class="block-icon"><MessageSquareText size={18} /></span>
		<div>
			<h2>Message defaults</h2>
			<p class="muted">
				What the WhatsApp and email buttons open, per language. Each person gets the language of
				their company’s or event’s phone country unless the event picks one. The opt-out line, and
				for people found by research the source line, are added when a message opens, so they can’t
				be edited out. A blank box restores the built-in wording.
			</p>
		</div>
	</div>
	<div class="languages" role="tablist" aria-label="Language">
		{#each data.messages.languages as l (l.key)}
			<button
				class="chip"
				role="tab"
				aria-selected={language === l.key}
				onclick={() => (language = l.key)}
			>
				{l.label}
			</button>
		{/each}
	</div>
	{#each data.messages.languages as l (l.key)}
		{#if language === l.key}
			<form
				class="templates"
				method="POST"
				action="?/templates"
				use:enhance={() =>
					async ({ update }) =>
						update({ reset: false })}
			>
				<input type="hidden" name="language" value={l.key} />
				<p class="hint">
					Placeholders: {#each data.messages.placeholders as p, i (p)}{i ? ', ' : ''}<code>{p}</code
						>{/each}. <code>{'{link}'}</code> is the person’s own registration link; the reminder must
					include it.
				</p>
				<div class="template-grid">
					{#each data.messages.kinds as k (k.key)}
						<div class="field">
							<label class="label" for="body-{l.key}-{k.key}">{k.label}</label>
							<textarea
								class="input textarea"
								id="body-{l.key}-{k.key}"
								name="body_{k.key}"
								rows="4"
								maxlength="2000">{data.messages.bodies[l.key][k.key]}</textarea
							>
						</div>
					{/each}
				</div>
				<div class="actions">
					{#if templateError}<p class="error-text">{templateError}</p>{/if}
					{#if templatesSaved}<span class="saved"><Check size={16} /> Saved</span>{/if}
					<button class="btn btn-primary">Save {l.label}</button>
				</div>
			</form>
		{/if}
	{/each}
</section>

<!-- Do-not-contact list -->
<section class="card block" id="blocked">
	<div class="block-head">
		<span class="block-icon"><ShieldBan size={18} /></span>
		<div>
			<h2>Do-not-contact list</h2>
			<p class="muted">
				People who asked not to hear from us. Only a hash of each email, mobile or name is kept, so
				the list shows masked labels. Anyone it matches is locked: no message buttons, channels
				blanked in exports, refused on every list. It never expires; an entry comes off only by
				hand, with a reason, and that is logged.
			</p>
		</div>
	</div>

	{#if form && 'blocked' in form}
		<p class="banner banner-brand">
			Added. {form.blocked === 0
				? 'Nobody in the pool matches it yet; anyone who turns up later is refused.'
				: `${form.blocked} ${form.blocked === 1 ? 'person' : 'people'} in the pool locked.`}
		</p>
	{/if}

	{#if data.blocked.length}
		<div class="table-wrap">
			<table class="table">
				<thead>
					<tr>
						<th>Who</th>
						<th>Reason</th>
						<th>Source</th>
						<th>By</th>
						<th>When</th>
						<th><span class="sr-only">Actions</span></th>
					</tr>
				</thead>
				<tbody>
					{#each data.blocked as e (e.id)}
						<tr class:removed={e.removed_at !== null}>
							<td>
								<span class="label-text">{e.label}</span>
								<div class="muted small">{KIND_LABEL[e.kind]}</div>
							</td>
							<td>{e.reason || '–'}</td>
							<td class="nowrap">{SOURCE_LABEL[e.source]}</td>
							<td>{e.by || '–'}</td>
							<td class="nowrap" title={exact(e.created_at)}>{when(e.created_at)}</td>
							<td>
								{#if e.removed_at !== null}
									<span class="muted small">
										removed {when(e.removed_at)} by {e.removed_by || 'staff'}: {e.removed_reason}
									</span>
								{:else if removing === e.id || unblockId === e.id}
									<form
										class="unblock"
										method="POST"
										action="?/unblock"
										use:enhance={() =>
											async ({ result, update }) => {
												await update();
												if (result.type === 'success') removing = null;
											}}
									>
										<input type="hidden" name="id" value={e.id} />
										<!-- svelte-ignore a11y_autofocus -->
										<input
											class="input"
											name="reason"
											placeholder="Why it comes off"
											aria-label="Reason for removing {e.label}"
											autofocus
										/>
										<button class="btn btn-danger btn-sm">Remove</button>
										<button
											type="button"
											class="btn btn-ghost btn-sm"
											onclick={() => (removing = null)}>Cancel</button
										>
									</form>
									{#if unblockId === e.id && form && 'unblockError' in form}
										<p class="error-text">{form.unblockError}</p>
									{/if}
								{:else}
									<button class="btn btn-ghost btn-sm" onclick={() => (removing = e.id)}>
										Remove…
									</button>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<p class="placeholder muted">Nobody is on the list.</p>
	{/if}
	<p class="small toggle">
		{#if data.showRemoved}
			<a href="/admin/settings#blocked">Hide removed entries</a>
		{:else}
			<a href="/admin/settings?removed#blocked">Show removed entries</a>
		{/if}
	</p>

	<form class="add-block" method="POST" action="?/block" use:enhance>
		<h3>Add by hand</h3>
		<div class="kinds" role="radiogroup" aria-label="What to block">
			<label class="chip"><input type="radio" name="kind" value="email" checked /> Email</label>
			<label class="chip"><input type="radio" name="kind" value="phone" /> Mobile</label>
			<label class="chip">
				<input type="radio" name="kind" value="name_company" /> Name + company
			</label>
		</div>
		<div class="add-grid">
			<div class="field">
				<label class="label" for="block-value">Email, mobile or name</label>
				<input class="input" id="block-value" name="value" required />
			</div>
			<div class="field">
				<label class="label" for="block-company"
					>Company <span class="optional">for a name</span></label
				>
				<input class="input" id="block-company" name="company" />
			</div>
			<div class="field">
				<label class="label" for="block-reason">Reason</label>
				<input
					class="input"
					id="block-reason"
					name="reason"
					placeholder="Asked by email on 2 Oct"
				/>
			</div>
		</div>
		<div class="actions">
			{#if form && 'blockError' in form}<p class="error-text">{form.blockError}</p>{/if}
			<button class="btn btn-secondary"><ShieldBan size={16} /> Add to the list</button>
		</div>
	</form>
</section>

<style>
	.head {
		margin-bottom: 24px;
	}

	h1 {
		font-size: 32px;
		margin-bottom: 4px;
	}

	.block {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 16px;
		padding: 20px;
		margin-bottom: 14px;
		scroll-margin-top: 80px;
	}

	.block-head {
		display: flex;
		gap: 14px;
		align-items: flex-start;
	}

	.block-head h2 {
		font-size: 18px;
		margin-bottom: 2px;
	}

	.block-head p {
		font-size: 14.5px;
		max-width: 68ch;
	}

	.block-icon {
		flex: none;
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		border-radius: 10px;
		background: var(--brand-soft);
		color: var(--brand-text);
	}

	.list {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.list li {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 0;
		border-top: 1px solid var(--border);
	}

	.list-main {
		font-weight: 650;
	}

	.list form {
		margin-left: auto;
	}

	.inline {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
		max-width: 560px;
	}

	.inline .input {
		flex: 1;
		min-width: 200px;
		height: 40px;
	}

	.saved {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: var(--good);
		font-weight: 650;
	}

	.code {
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

	.placeholder {
		padding: 12px 0;
		font-size: 14.5px;
	}

	.tiny {
		font-size: 11.5px;
		padding: 2px 8px;
	}

	.small {
		font-size: 13px;
	}

	.nowrap {
		white-space: nowrap;
	}

	.label-text {
		font-weight: 650;
		font-variant-numeric: tabular-nums;
	}

	tr.removed td {
		color: var(--muted);
	}

	.unblock {
		display: flex;
		gap: 6px;
		align-items: center;
		min-width: 320px;
	}

	.unblock .input {
		height: 36px;
		flex: 1;
	}

	.toggle {
		margin: -6px 0 0;
	}

	.add-block {
		display: grid;
		gap: 12px;
		padding: 16px;
		border-radius: var(--radius);
		background: var(--surface-2);
	}

	.add-block h3 {
		font-size: 15px;
	}

	.kinds {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		height: 36px;
		padding: 0 14px;
		border-radius: 999px;
		border: 1px solid var(--border-strong);
		background: var(--surface);
		font-size: 14px;
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

	.add-grid {
		display: grid;
		gap: 12px;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
	}

	.chase {
		display: grid;
		gap: 14px;
	}

	.chase-grid {
		display: grid;
		gap: 12px;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
	}

	.chase-input {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.chase-input .input {
		width: 90px;
		height: 40px;
	}

	.languages {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.chip[aria-selected='true'] {
		background: var(--brand-soft);
		border-color: color-mix(in oklab, var(--brand) 55%, transparent);
		color: var(--brand-text);
	}

	.templates {
		display: grid;
		gap: 14px;
	}

	.template-grid {
		display: grid;
		gap: 14px;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
	}

	.textarea {
		height: auto;
		padding: 10px 12px;
		line-height: 1.5;
		resize: vertical;
		font-size: 14.5px;
	}

	.actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 12px;
		flex-wrap: wrap;
	}
</style>
