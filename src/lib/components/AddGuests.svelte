<script lang="ts">
	import { enhance } from '$app/forms';
	import { nameFromLinkedin, REPLY_LABEL, type Reply } from '$lib/invitations';
	import Columns3 from '@lucide/svelte/icons/columns-3';
	import FileUp from '@lucide/svelte/icons/file-up';
	import ListPlus from '@lucide/svelte/icons/list-plus';
	import SquarePen from '@lucide/svelte/icons/square-pen';
	import X from '@lucide/svelte/icons/x';

	interface Person {
		id: string;
		name: string;
		jobTitle: string;
		email: string | null;
		onList: boolean;
		/** Not on the default list (§2.3): never replied, attended or registered. */
		prospect: boolean;
	}

	interface AddResult {
		added: number;
		found: number;
		duplicates: string[];
		refused: { name: string; reason: string }[];
		skipped: string[];
		truncated: boolean;
		company: string;
	}

	/** The flags a Dynamics 365 row carries (§6.1); shown on the card and saved with the person. */
	interface Extra {
		isCustomer?: boolean;
		doNotEmail?: boolean;
		doNotPhone?: boolean;
		suppressed?: boolean;
		owner?: string;
		status?: string;
	}

	/** One person, field by field, while being checked before saving. */
	interface Entry {
		key: number;
		name: string;
		company: string;
		jobTitle: string;
		email: string;
		phone: string;
		linkedin: string;
		reply: Reply;
		note: string;
		extra?: Extra | null;
	}

	/** What the review endpoint says about the paste's shape, for the column-mapping control. */
	interface Mapping {
		headers: string[];
		header: boolean;
		columns: Record<string, number>;
		options: { key: string; label: string }[];
		d365: boolean;
	}

	interface Props {
		eventId: string;
		/** Nobody is on the list yet, so explain what the list is for. */
		first?: boolean;
		autofocus?: boolean;
		onclose: () => void;
	}

	let { eventId, first = false, autofocus = false, onclose }: Props = $props();

	/** Typed lists up to this size go straight onto the list; bigger pastes wait at To review. */
	const FOUND_THRESHOLD = 10;
	// Asked once per browser session: the answer stamps every typed person's origin (D16).
	const ORIGIN_KEY = 'ep_origin_detail';

	let company = $state('');
	let names = $state('');
	let people = $state<Person[]>([]);
	let picked = $state<string[]>([]);
	let prospects = $state(false);
	let park = $state(false);
	let originDetail = $state('');
	let busy = $state(false);
	let message = $state('');
	let problem = $state('');
	let refresh = $state(0);
	/** null while typing; the rows being checked once "Check each field" is pressed. */
	let entries = $state<Entry[] | null>(null);
	let mapping = $state<Mapping | null>(null);
	let showColumns = $state(false);
	let fileInput = $state<HTMLInputElement | null>(null);
	let nextKey = 0;
	// The mapping control lists one select per header cell: which column it feeds, or none.
	const matched = $derived(mapping ? Object.keys(mapping.columns).length : 0);
	const mappable = $derived(!!mapping && mapping.headers.length >= 2);
	const d365 = $derived(!!mapping?.d365);
	const REPLY_ORDER: Reply[] = ['pending', 'yes', 'maybe', 'no'];

	const PLACEHOLDER =
		'Rina Wijaya\nAndi Pratama, IT Manager, andi@bataviafoods.co.id, 0812 3456 7890';

	$effect(() => {
		try {
			originDetail = sessionStorage.getItem(ORIGIN_KEY) ?? '';
		} catch {
			// Private mode or blocked storage: the field simply starts empty.
		}
	});

	function rememberOrigin() {
		try {
			sessionStorage.setItem(ORIGIN_KEY, originDetail.trim());
		} catch {
			// Nothing to do: the answer still travels with this submit.
		}
	}

	// Everyone the pool knows at this company, looked up as the name is typed.
	$effect(() => {
		const q = company.trim();
		void refresh;
		if (!q) {
			people = [];
			picked = [];
			return;
		}
		const controller = new AbortController();
		const timer = setTimeout(async () => {
			try {
				const url = `/admin/events/${eventId}/people/people.json?company=${encodeURIComponent(q)}`;
				const res = await fetch(url, { signal: controller.signal });
				if (!res.ok) return;
				people = ((await res.json()) as { people: Person[] }).people;
				picked = picked.filter((id) => people.some((p) => p.id === id && !p.onList));
			} catch {
				// Aborted by the next keystroke, or offline: keep what's showing.
			}
		}, 200);
		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	});

	const shownPeople = $derived(people.filter((p) => p.prospect === prospects));
	const prospectCount = $derived(people.filter((p) => p.prospect).length);
	const available = $derived(shownPeople.filter((p) => !p.onList));
	const allPicked = $derived(available.length > 0 && available.every((p) => picked.includes(p.id)));

	function toggleAll() {
		picked = allPicked
			? picked.filter((id) => !available.some((p) => p.id === id))
			: [...new Set([...picked, ...available.map((p) => p.id)])];
	}

	function listNames(list: string[]) {
		return list.length <= 3
			? list.join(', ')
			: `${list.slice(0, 2).join(', ')} and ${list.length - 2} others`;
	}

	function summarize(r: AddResult) {
		const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
		const parts: string[] = [];
		if (r.added)
			parts.push(
				`Added ${plural(r.added, 'person', 'people')}${r.company ? ` from ${r.company}` : ''}.`
			);
		if (r.found) parts.push(`${plural(r.found, 'person waits', 'people wait')} under To review.`);
		if (r.duplicates.length)
			parts.push(
				`${listNames(r.duplicates)} ${r.duplicates.length === 1 ? 'was' : 'were'} already on the list.`
			);
		if (r.refused.length)
			parts.push(`Couldn’t add ${r.refused.map((x) => `${x.name} (${x.reason})`).join(', ')}.`);
		if (r.skipped.length)
			parts.push(
				`Skipped ${plural(r.skipped.length, 'line', 'lines')} without a name. Use “Check each field” to fill them in.`
			);
		if (r.truncated) parts.push('Only the first 1,000 lines were read.');
		return parts.join(' ');
	}

	function entry(fields: Partial<Omit<Entry, 'key'>> = {}): Entry {
		return {
			key: nextKey++,
			name: '',
			company: company.trim(),
			jobTitle: '',
			email: '',
			phone: '',
			linkedin: '',
			reply: 'pending',
			note: '',
			...fields
		};
	}

	/**
	 * Splits the typed lines into fields on the server, the same way adding them would. With
	 * `columns`, the organizer's own mapping is used instead of the detected one.
	 */
	async function review(columns?: Record<string, number>, header?: boolean) {
		busy = true;
		problem = '';
		message = '';
		try {
			const res = await fetch(`/admin/events/${eventId}/people/review.json`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ company, names, columns, header })
			});
			if (!res.ok) throw new Error(String(res.status));
			const data = (await res.json()) as Mapping & {
				guests: (Omit<Entry, 'key' | 'email' | 'phone' | 'linkedin'> & {
					email: string | null;
					phone: string | null;
					linkedin: string | null;
				})[];
			};
			entries = data.guests.length
				? data.guests.map((g) =>
						entry({ ...g, email: g.email ?? '', phone: g.phone ?? '', linkedin: g.linkedin ?? '' })
					)
				: [entry()];
			mapping = {
				headers: data.headers,
				header: data.header,
				columns: data.columns,
				options: data.options,
				d365: data.d365
			};
			// A paste whose header the app could barely read is the one to show the mapping for.
			if (columns === undefined) showColumns = mapping.headers.length >= 2 && matched < 2;
		} catch {
			problem = 'Couldn’t split those lines. Please try again.';
		} finally {
			busy = false;
		}
	}

	/** The select for one header cell changed: re-read every row with the new mapping. */
	function remap(index: number, column: string) {
		if (!mapping) return;
		const columns: Record<string, number> = {};
		for (const [key, i] of Object.entries(mapping.columns)) if (i !== index) columns[key] = i;
		if (column) columns[column] = index;
		void review(columns, true);
	}

	function columnAt(index: number): string {
		if (!mapping) return '';
		return Object.entries(mapping.columns).find(([, i]) => i === index)?.[0] ?? '';
	}

	/** A CSV or tab-separated file goes through the same parser as a paste. */
	async function pickFile(e: Event & { currentTarget: HTMLInputElement }) {
		const file = e.currentTarget.files?.[0];
		if (!file) return;
		if (file.size > 2_000_000) {
			problem = 'That file is too big. Export fewer rows, or paste the ones you need.';
			return;
		}
		names = await file.text();
		e.currentTarget.value = '';
		await review();
	}

	function flags(extra: Extra | null | undefined): string[] {
		if (!extra) return [];
		const list: string[] = [];
		if (extra.suppressed) list.push('Suppressed');
		if (extra.doNotEmail) list.push('No email');
		if (extra.doNotPhone) list.push('No calls');
		if (extra.owner) list.push(`Owner ${extra.owner}`);
		return list;
	}

	// A profile link pasted into an empty row usually spells out the name.
	function fillNameFromLinkedin(e: Entry) {
		if (!e.name.trim() && e.linkedin.includes('/in/')) e.name = nameFromLinkedin(e.linkedin) ?? '';
	}

	// Only the reviewed rows can be counted exactly; typed lines are split on the server.
	const typedLines = $derived(names.split(/\r?\n/).filter((l) => l.trim()).length);
	const typedCount = $derived(entries ? entries.length : typedLines);
	const toAdd = $derived(typedCount + picked.length);
	const canAdd = $derived(entries ? !!toAdd : !!names.trim() || picked.length > 0);
	// A big paste always waits for review, whatever the box says (D5).
	const parking = $derived(park || typedCount > FOUND_THRESHOLD);
	const buttonLabel = $derived.by(() => {
		if (!toAdd) return 'Add to the list';
		if (parking && !picked.length) return `Park ${toAdd} for review`;
		return `Add ${toAdd} to the list`;
	});

	function maybeFocus(node: HTMLInputElement) {
		if (autofocus) node.focus();
	}
</script>

<form
	class="card add rise"
	method="POST"
	action="?/add"
	use:enhance={() => {
		busy = true;
		message = '';
		problem = '';
		rememberOrigin();
		return async ({ result, update }) => {
			await update({ reset: false });
			busy = false;
			if (result.type === 'success' && result.data) {
				message = summarize(result.data as unknown as AddResult);
				names = '';
				entries = null;
				mapping = null;
				showColumns = false;
				picked = [];
				refresh++;
			} else if (result.type === 'failure') {
				problem = String(result.data?.addError ?? 'That didn’t work. Please try again.');
			}
		};
	}}
>
	<div class="add-head">
		<div>
			<h2>{first ? 'Start the list' : 'Add people'}</h2>
			<p class="muted">
				{first
					? 'List who you’re inviting, company by company, then record each reply as it comes in. On the day, everyone who checks in is ticked off.'
					: 'Pick people from the pool, type names, or paste rows from a spreadsheet.'}
			</p>
		</div>
		<button type="button" class="btn btn-ghost btn-icon btn-sm" onclick={onclose} title="Close">
			<X size={18} /><span class="sr-only">Close</span>
		</button>
	</div>

	<div class="field company">
		<label class="label" for="add-company">Company</label>
		<input
			class="input"
			id="add-company"
			name="company"
			list="company-options"
			autocomplete="off"
			placeholder="Batavia Foods"
			bind:value={company}
			use:maybeFocus
		/>
	</div>

	{#if people.length}
		<fieldset class="contacts">
			<div class="contacts-head">
				<legend class="label">
					Already known <span class="optional">· {people.length} at {company.trim()}</span>
				</legend>
				<div class="contacts-tools">
					{#if prospectCount}
						<button
							type="button"
							class="chip"
							aria-pressed={prospects}
							onclick={() => (prospects = !prospects)}
							title="People found or typed before, who never replied or attended"
						>
							Prospects <span class="chip-count">{prospectCount}</span>
						</button>
					{/if}
					{#if available.length > 1}
						<button type="button" class="btn btn-ghost btn-sm" onclick={toggleAll}>
							{allPicked ? 'Clear' : 'Select all'}
						</button>
					{/if}
				</div>
			</div>
			<div class="picks">
				{#each shownPeople as person (person.id)}
					<label class="pick" class:done={person.onList}>
						{#if person.onList}
							<input type="checkbox" checked disabled />
						{:else}
							<input type="checkbox" name="contact" value={person.id} bind:group={picked} />
						{/if}
						<span class="pick-text">
							<span class="pick-name">{person.name}</span>
							<span class="pick-meta">
								{person.onList ? 'On the list' : person.jobTitle || person.email || ''}
							</span>
						</span>
					</label>
				{:else}
					<p class="hint">
						{prospects ? 'No prospects at this company.' : 'Only prospects here so far.'}
					</p>
				{/each}
			</div>
		</fieldset>
	{/if}

	{#if entries}
		<fieldset class="entries">
			<div class="entries-head">
				<legend class="label">
					Check each person <span class="optional">· nothing is saved until you add them</span>
				</legend>
				<div class="entries-tools">
					{#if mappable}
						<button
							type="button"
							class="btn btn-ghost btn-sm"
							aria-expanded={showColumns}
							onclick={() => (showColumns = !showColumns)}
						>
							<Columns3 size={15} /> Change columns
						</button>
					{/if}
					<button
						type="button"
						class="btn btn-ghost btn-sm"
						onclick={() => ((entries = null), (mapping = null))}
					>
						Edit as text
					</button>
				</div>
			</div>
			<input type="hidden" name="guests" value={JSON.stringify(entries)} />
			{#if d365}
				<input type="hidden" name="d365" value="1" />
				<p class="hint d365">
					A Dynamics 365 export: everyone here is recorded as a customer, and the
					<em>do not email</em>, <em>do not phone</em> and marketing flags are honoured. Rows marked
					<strong>Suppressed</strong> wait under To review and can’t be added.
				</p>
			{/if}
			{#if mapping && mappable}
				<div class="columns" class:open={showColumns}>
					<p class="hint">
						{#if matched < 2}
							The app couldn’t tell which column is which. Say what each one holds:
						{:else}
							{matched} of {mapping.headers.length} columns recognised. Change any that landed in the
							wrong place:
						{/if}
					</p>
					{#if showColumns}
						<div class="column-grid">
							{#each mapping.headers as cell, i (i)}
								<label class="column">
									<span class="column-header" title={cell}>{cell || `Column ${i + 1}`}</span>
									<select
										class="input"
										value={columnAt(i)}
										disabled={busy}
										onchange={(e) => remap(i, e.currentTarget.value)}
									>
										<option value="">Ignore</option>
										{#each mapping.options as o (o.key)}
											<option value={o.key}>{o.label}</option>
										{/each}
									</select>
								</label>
							{/each}
						</div>
						<label class="check">
							<input
								type="checkbox"
								checked={mapping.header}
								disabled={busy}
								onchange={(e) => review(mapping?.columns, e.currentTarget.checked)}
							/>
							<span>The first line is a header row, not a person.</span>
						</label>
					{/if}
				</div>
			{/if}
			{#each entries as e, i (e.key)}
				<div class="entry" class:suppressed={!!e.extra?.suppressed}>
					<div class="entry-head">
						<span class="entry-number">{i + 1}</span>
						{#if e.extra}
							{#each flags(e.extra) as flag (flag)}
								<span class="flag" class:flag-bad={flag === 'Suppressed'}>{flag}</span>
							{/each}
						{/if}
						<button
							type="button"
							class="btn btn-ghost btn-icon btn-sm"
							title="Remove this row"
							onclick={() => entries?.splice(i, 1)}
						>
							<X size={16} /><span class="sr-only">Remove row {i + 1}</span>
						</button>
					</div>
					<div class="entry-fields">
						<label class="cell wide">
							<span class="cell-label">Name</span>
							<input
								class="input"
								bind:value={e.name}
								required
								aria-invalid={e.name.trim() ? undefined : 'true'}
								placeholder={e.linkedin ? 'Not in the link: type it' : ''}
							/>
						</label>
						<label class="cell">
							<span class="cell-label">Company</span>
							<input
								class="input"
								bind:value={e.company}
								list="company-options"
								autocomplete="off"
							/>
						</label>
						<label class="cell">
							<span class="cell-label">Job title</span>
							<input class="input" bind:value={e.jobTitle} />
						</label>
						<label class="cell wide">
							<span class="cell-label">Email</span>
							<input class="input" type="email" bind:value={e.email} />
						</label>
						<label class="cell">
							<span class="cell-label">Mobile</span>
							<input class="input" type="tel" bind:value={e.phone} />
						</label>
						<label class="cell wide">
							<span class="cell-label">LinkedIn</span>
							<input
								class="input"
								bind:value={e.linkedin}
								placeholder="linkedin.com/in/…"
								onblur={() => fillNameFromLinkedin(e)}
							/>
						</label>
						<label class="cell">
							<span class="cell-label">Reply</span>
							<select class="input" bind:value={e.reply}>
								{#each REPLY_ORDER as r (r)}<option value={r}>{REPLY_LABEL[r]}</option>{/each}
							</select>
						</label>
						<label class="cell wide">
							<span class="cell-label">Note</span>
							<input class="input" bind:value={e.note} />
						</label>
					</div>
				</div>
			{/each}
			<button
				type="button"
				class="btn btn-soft btn-sm add-row"
				onclick={() => entries?.push(entry())}
			>
				<ListPlus size={16} /> Add a row
			</button>
		</fieldset>
	{:else}
		<div class="field">
			<label class="label" for="add-names">{people.length ? 'Anyone else' : 'Names'}</label>
			<textarea
				class="input textarea"
				id="add-names"
				name="names"
				rows="5"
				placeholder={PLACEHOLDER}
				bind:value={names}></textarea>
			<p class="hint">
				One person per line. After the name you can add a job title, email, mobile or LinkedIn link,
				separated by commas; a LinkedIn link on its own is enough. Pasting from a spreadsheet or a
				Dynamics 365 export? Include its header row (Name, Company, Email, Mobile…) and each column
				lands in the right place. Use <strong>Check each field</strong> to see and fix every field before
				anything is saved.
			</p>
			<div class="file-row">
				<input
					type="file"
					accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
					class="sr-only"
					bind:this={fileInput}
					onchange={pickFile}
				/>
				<button
					type="button"
					class="btn btn-secondary btn-sm"
					disabled={busy}
					onclick={() => fileInput?.click()}
				>
					<FileUp size={15} /> Open a CSV file
				</button>
				<span class="hint">A spreadsheet or D365 export saved as CSV; it is read the same way.</span
				>
			</div>
		</div>
	{/if}

	{#if typedCount}
		<div class="typed-options">
			<label class="check">
				<input type="checkbox" name="park" value="1" bind:checked={park} />
				<span>
					Park as Found: they wait under <strong>To review</strong> instead of joining the list now.
					{#if typedCount > FOUND_THRESHOLD}Lists over {FOUND_THRESHOLD} rows always do.{/if}
				</span>
			</label>
			<div class="field origin">
				<label class="label" for="add-origin">
					Where did you get their details? <span class="optional">(asked once)</span>
				</label>
				<input
					class="input"
					id="add-origin"
					name="originDetail"
					placeholder="Business cards from the expo, a partner’s list…"
					maxlength="200"
					bind:value={originDetail}
				/>
			</div>
		</div>
	{/if}

	{#if message}<p class="banner banner-brand" role="status">{message}</p>{/if}
	{#if problem}<p class="error-text" role="alert">{problem}</p>{/if}

	<div class="add-actions">
		<button type="button" class="btn btn-ghost" onclick={onclose}
			>{message ? 'Done' : 'Cancel'}</button
		>
		{#if !entries}
			<button type="button" class="btn btn-secondary" disabled={busy} onclick={() => review()}>
				<SquarePen size={16} /> Check each field
			</button>
		{/if}
		<button class="btn btn-primary" disabled={busy || !canAdd}>
			{#if busy}<span class="spinner"></span>{/if}
			{buttonLabel}
		</button>
	</div>
</form>

<style>
	.add {
		display: grid;
		gap: 16px;
		padding: 20px;
		margin-bottom: 14px;
	}

	.add-head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 12px;
	}

	.add-head h2 {
		font-size: 19px;
		margin-bottom: 4px;
	}

	.add-head p {
		font-size: 14.5px;
		max-width: 620px;
	}

	.company {
		max-width: 420px;
	}

	.contacts {
		border: 0;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 8px;
		min-width: 0;
	}

	.contacts-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 8px 12px;
	}

	.contacts-head legend {
		padding: 0;
	}

	.contacts-tools {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		height: 32px;
		padding: 0 12px;
		border-radius: 999px;
		border: 1px solid var(--border-strong);
		background: var(--surface);
		color: var(--text-2);
		font-size: 13.5px;
		font-weight: 650;
		white-space: nowrap;
		cursor: pointer;
	}

	.chip[aria-pressed='true'] {
		background: var(--brand-soft);
		border-color: color-mix(in oklab, var(--brand) 55%, transparent);
		color: var(--brand-text);
	}

	.chip-count {
		font-size: 12.5px;
		font-weight: 700;
		color: var(--muted);
	}

	.chip[aria-pressed='true'] .chip-count {
		color: inherit;
	}

	.picks {
		display: grid;
		gap: 8px;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		max-height: 264px;
		overflow-y: auto;
		padding: 2px;
	}

	.pick {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border-strong);
		background: var(--surface);
		cursor: pointer;
		transition:
			border-color 0.15s ease,
			background-color 0.15s ease;
	}

	.pick:hover:not(.done) {
		border-color: color-mix(in oklab, var(--brand) 45%, var(--border-strong));
	}

	.pick:has(input:checked):not(.done) {
		border-color: var(--brand);
		background: var(--brand-soft);
	}

	.pick.done {
		cursor: default;
		opacity: 0.6;
	}

	.pick input {
		flex: none;
		width: 18px;
		height: 18px;
		margin: 0;
		accent-color: var(--brand);
	}

	.pick-text {
		display: grid;
		min-width: 0;
	}

	.pick-name {
		font-weight: 650;
		font-size: 14.5px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.pick-meta {
		font-size: 13px;
		color: var(--muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.textarea {
		height: auto;
		min-height: 128px;
		padding: 12px 14px;
		line-height: 1.5;
		resize: vertical;
	}

	.typed-options {
		display: grid;
		gap: 14px;
		padding: 14px 16px;
		border-radius: var(--radius);
		background: var(--surface-2);
	}

	.origin {
		max-width: 520px;
	}

	.origin .input {
		height: 44px;
	}

	.add-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 8px;
	}

	.entries {
		border: 0;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 10px;
		min-width: 0;
	}

	.entries-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.entries-head legend {
		padding: 0;
	}

	.entries-tools {
		display: flex;
		align-items: center;
		gap: 4px;
		flex-wrap: wrap;
	}

	.file-row {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
		margin-top: 8px;
	}

	.d365 {
		padding: 10px 12px;
		border-radius: var(--radius-sm);
		background: var(--brand-soft);
		color: var(--brand-text);
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

	.flag {
		display: inline-block;
		padding: 2px 6px;
		border-radius: 999px;
		background: var(--surface-2);
		color: var(--muted);
		font-size: 11px;
		font-weight: 650;
		text-align: center;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.flag-bad {
		background: color-mix(in oklab, var(--bad) 14%, transparent);
		color: var(--bad);
	}

	.entry.suppressed {
		opacity: 0.75;
	}

	.entry {
		display: grid;
		grid-template-columns: 28px minmax(0, 1fr);
		gap: 10px;
		padding: 12px;
		border-radius: var(--radius);
		border: 1px solid var(--border-strong);
		background: var(--surface);
	}

	.entry:has([aria-invalid='true']) {
		border-color: color-mix(in oklab, var(--bad) 45%, var(--border-strong));
	}

	.entry-head {
		display: grid;
		justify-items: center;
		align-content: start;
		gap: 6px;
		padding-top: 22px;
	}

	.entry-number {
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: var(--surface-2);
		color: var(--muted);
		font-size: 12px;
		font-weight: 700;
	}

	.entry-head .btn {
		--h: 28px;
	}

	.entry-fields {
		display: grid;
		gap: 8px 10px;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
	}

	.cell {
		display: grid;
		gap: 4px;
		min-width: 0;
	}

	.cell.wide {
		grid-column: span 2;
	}

	.cell-label {
		font-size: 12.5px;
		font-weight: 650;
		color: var(--muted);
	}

	.cell .input {
		height: 40px;
		padding: 0 10px;
		border-radius: 10px;
	}

	.add-row {
		justify-self: start;
	}

	@media (max-width: 560px) {
		.cell.wide {
			grid-column: 1 / -1;
		}

		.entry-fields {
			grid-template-columns: 1fr 1fr;
		}
	}
</style>
