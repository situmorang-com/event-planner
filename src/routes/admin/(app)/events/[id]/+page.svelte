<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import ArrivalsChart from '$lib/components/ArrivalsChart.svelte';
	import DeviceSplit from '$lib/components/DeviceSplit.svelte';
	import EventFields from '$lib/components/EventFields.svelte';
	import EventTabs from '$lib/components/EventTabs.svelte';
	import QrCode from '$lib/components/QrCode.svelte';
	import { connectLive, type LiveArrival, type LiveQr } from '$lib/live';
	import { mailtoHref } from '$lib/mailto';
	import { initials } from '$lib/names';
	import { formatDate, formatDateTime, formatTime } from '$lib/time';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Monitor from '@lucide/svelte/icons/monitor';
	import Download from '@lucide/svelte/icons/download';
	import Copy from '@lucide/svelte/icons/copy';
	import Check from '@lucide/svelte/icons/check';
	import Search from '@lucide/svelte/icons/search';
	import UserPlus from '@lucide/svelte/icons/user-plus';
	import X from '@lucide/svelte/icons/x';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import Settings from '@lucide/svelte/icons/settings';
	import Printer from '@lucide/svelte/icons/printer';
	import ScrollText from '@lucide/svelte/icons/scroll-text';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const event = $derived(data.event);
	const stats = $derived(data.stats);

	let liveQr = $state<LiveQr | null>(null);
	let online = $state(false);
	let toasts = $state<LiveArrival[]>([]);
	let query = $state('');
	let adding = $state(false);
	let copied = $state(false);

	onMount(() => {
		let pending: ReturnType<typeof setTimeout> | undefined;
		const refresh = () => {
			clearTimeout(pending);
			pending = setTimeout(() => invalidateAll(), 400);
		};
		const disconnect = connectLive(data.event.id, {
			qr: (qr) => (liveQr = qr),
			checkin: ({ arrival }) => {
				toasts = [arrival, ...toasts].slice(0, 3);
				setTimeout(() => (toasts = toasts.filter((t) => t !== arrival)), 4500);
				refresh();
			},
			refresh,
			connection: (ok) => (online = ok)
		});
		return () => {
			clearTimeout(pending);
			disconnect();
		};
	});

	const filtered = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return data.attendees;
		return data.attendees.filter((a) =>
			[a.name, a.email, a.phone, a.company, a.job_title].some((v) => v?.toLowerCase().includes(q))
		);
	});

	const METHOD_LABEL = {
		form: 'Form',
		picker: 'Contact card',
		returning: 'One-tap',
		staff: 'Staff'
	} as const;
	const DEVICE_LABEL = {
		ios: 'iPhone',
		android: 'Android',
		desktop: 'Computer',
		other: 'Other'
	} as const;

	async function copyLink() {
		await navigator.clipboard.writeText(data.staticLink);
		copied = true;
		setTimeout(() => (copied = false), 1600);
	}

	// The log holds ids and counts only (§8), so this is all there is to say about an entry.
	const ACTIVITY_LABEL = {
		export: 'Exported',
		delete: 'Deleted',
		purge: 'Purged',
		import: 'Imported',
		merge: 'Merged',
		bulk: 'Bulk action',
		lock: 'Don’t contact again',
		unlock: 'Taken off the do-not-contact list'
	} as const;

	function activityDetail(kind: keyof typeof ACTIVITY_LABEL, what: string, count: number) {
		let parsed: Record<string, unknown> = {};
		try {
			parsed = JSON.parse(what) ?? {};
		} catch {
			// An unreadable entry still shows its kind and count.
		}
		const rows = `${count} ${count === 1 ? 'row' : 'rows'}`;
		if (kind === 'export' && typeof parsed.export === 'string')
			return `the ${parsed.export} list, ${rows}`;
		return rows;
	}

	const addErrors = $derived<Record<string, string | undefined>>(
		form && 'addErrors' in form ? (form.addErrors ?? {}) : {}
	);
	const addValues = $derived(form && 'addValues' in form ? form.addValues : null);
</script>

<svelte:head>
	<title>{event.name} · Event Planner</title>
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
			<span class="pill" title={online ? 'Updates arrive live' : 'Reconnecting…'}>
				<span class="dot" style="color: {online ? 'var(--good)' : 'var(--muted)'}"></span>
				{online ? 'Live' : 'Connecting'}
			</span>
		</div>
		<h1>{event.name}</h1>
		<p class="muted">
			{#if event.starts_at}{formatDateTime(event.starts_at, event.timezone)}{/if}
			{#if event.starts_at && event.venue}&nbsp;·&nbsp;{/if}
			{event.venue}
		</p>
		{#if event.planning_purged_at}
			<p class="muted small kept">
				Planning data deleted {formatDate(event.planning_purged_at, event.timezone)}
			</p>
		{:else if data.planningKeptUntil}
			<p class="muted small kept">
				Planning data kept until {formatDate(data.planningKeptUntil, event.timezone)}
			</p>
		{/if}
	</div>
	<div class="head-actions">
		<form method="POST" action="?/toggle" use:enhance>
			<input type="hidden" name="open" value={event.is_open ? '0' : '1'} />
			<button class="btn btn-secondary">{event.is_open ? 'Close check-in' : 'Open check-in'}</button
			>
		</form>
		<a
			class="btn btn-primary"
			href="/admin/events/{event.id}/display"
			target="_blank"
			rel="noopener"
		>
			<Monitor size={18} /> Entrance screen
		</a>
	</div>
</header>

<EventTabs
	eventId={event.id}
	current="checkins"
	checkins={stats.total}
	people={data.people}
	review={data.review}
/>

{#if data.created}
	<p class="banner banner-brand created rise">
		Event created. {event.qr_mode === 'rotating'
			? 'Open the entrance screen on a TV, laptop or tablet at the door and people can start scanning.'
			: 'Download the QR code below and put it on posters or table cards.'}
	</p>
{/if}

{#if !data.reachable}
	<p class="banner banner-warn rise">
		<CircleAlert size={18} />
		<span>
			Phones can’t open <strong>localhost</strong>. Set <code>PUBLIC_BASE_URL</code>, or connect
			this computer to Wi-Fi so the QR code can use its network address.
		</span>
	</p>
{/if}

<section class="kpis">
	<div class="card kpi hero">
		<p class="kpi-label">Checked in</p>
		<p class="hero-value">{stats.total.toLocaleString()}</p>
	</div>
	<div class="card kpi">
		<p class="kpi-label">New to your database</p>
		<p class="kpi-value">{stats.newContacts.toLocaleString()}</p>
	</div>
	<div class="card kpi">
		<p class="kpi-label">Returning attendees</p>
		<p class="kpi-value">{stats.returning.toLocaleString()}</p>
	</div>
	<div class="card kpi">
		<p class="kpi-label">Busiest {stats.bucketMinutes} minutes</p>
		{#if stats.peak && stats.peak.count > 0}
			<p class="kpi-value">{stats.peak.count}</p>
			<p class="kpi-sub muted">from {formatTime(stats.peak.start, event.timezone)}</p>
		{:else}
			<p class="kpi-value muted">–</p>
		{/if}
	</div>
</section>

<div class="layout">
	<div class="main-col">
		<section class="card panel">
			<div class="panel-head">
				<h2>Arrivals</h2>
				<p class="muted">Check-ins per {stats.bucketMinutes} minutes</p>
			</div>
			{#if stats.arrivals.length >= 3}
				<ArrivalsChart
					buckets={stats.arrivals}
					bucketMinutes={stats.bucketMinutes}
					timezone={event.timezone}
				/>
			{:else}
				<p class="placeholder muted">
					{stats.total === 0
						? 'Arrivals will chart here as soon as people start checking in.'
						: 'The chart fills in once check-ins span a few minutes.'}
				</p>
			{/if}
		</section>

		<section class="card panel">
			<div class="panel-head">
				<h2>Devices</h2>
				<p class="muted">Which phones people checked in with</p>
			</div>
			<DeviceSplit devices={stats.devices} />
		</section>
	</div>

	<aside class="card panel qr-panel">
		<div class="panel-head">
			<h2>{event.qr_mode === 'rotating' ? 'Live QR code' : 'Printable QR code'}</h2>
			<p class="muted">
				{event.qr_mode === 'rotating'
					? 'Changes every 20 seconds. Show it on the entrance screen.'
					: 'One fixed code for posters, badges and table cards.'}
			</p>
		</div>
		<div class="qr-box" class:off={!event.is_open}>
			{#if event.qr_mode === 'static'}
				<QrCode value={data.staticLink} label="Check-in QR code" />
			{:else if liveQr}
				{#key liveQr.url}
					<div in:fly={{ y: 6, duration: 250 }}>
						<QrCode value={liveQr.url} label="Live check-in QR code" />
					</div>
				{/key}
			{:else}
				<div class="qr-wait"><span class="spinner"></span></div>
			{/if}
			{#if !event.is_open}<span class="qr-closed">Check-in closed</span>{/if}
		</div>
		{#if event.qr_mode === 'static'}
			<div class="link-row">
				<input class="input" readonly value={data.staticLink} aria-label="Check-in link" />
				<button class="btn btn-secondary btn-icon" onclick={copyLink} title="Copy link">
					{#if copied}<Check size={18} />{:else}<Copy size={18} />{/if}
					<span class="sr-only">Copy link</span>
				</button>
			</div>
			<div class="qr-actions">
				<a class="btn btn-soft btn-sm" href="/admin/events/{event.id}/qr.svg" download>
					<Download size={16} /> SVG
				</a>
				<a
					class="btn btn-soft btn-sm"
					href="/admin/events/{event.id}/poster"
					target="_blank"
					rel="noopener"
				>
					<Printer size={16} /> Print poster
				</a>
			</div>
		{:else}
			<a
				class="btn btn-soft btn-block"
				href="/admin/events/{event.id}/display"
				target="_blank"
				rel="noopener"
			>
				<ExternalLink size={16} /> Open entrance screen
			</a>
		{/if}
		<a class="preview" href="/c/{event.id}" target="_blank" rel="noopener"
			>Preview the attendee page</a
		>
	</aside>
</div>

<section class="card attendees">
	<div class="table-head">
		<div>
			<h2>Attendees</h2>
			<p class="muted">{data.attendees.length.toLocaleString()} checked in</p>
		</div>
		<div class="table-tools">
			<label class="search">
				<Search size={17} />
				<span class="sr-only">Search attendees</span>
				<input
					class="input"
					type="search"
					placeholder="Search name, email, company"
					bind:value={query}
				/>
			</label>
			<button class="btn btn-secondary" onclick={() => (adding = !adding)} aria-expanded={adding}>
				<UserPlus size={17} /> Add
			</button>
			<a class="btn btn-secondary" href="/admin/events/{event.id}/export.csv"
				><Download size={17} /> CSV</a
			>
		</div>
	</div>

	{#if adding}
		<form
			class="add"
			method="POST"
			action="?/add"
			transition:fly={{ y: -6, duration: 180 }}
			use:enhance={() => {
				return async ({ result, update }) => {
					await update();
					if (result.type === 'success') adding = false;
				};
			}}
		>
			<p class="hint">For anyone who can’t scan: their phone is flat, or they’d rather not.</p>
			<div class="add-grid">
				<div class="field">
					<label class="label" for="add-name">Name</label>
					<input
						class="input"
						id="add-name"
						name="name"
						value={addValues?.name ?? ''}
						aria-invalid={addErrors.name ? 'true' : undefined}
					/>
					{#if addErrors.name}<p class="error-text">{addErrors.name}</p>{/if}
				</div>
				<div class="field">
					<label class="label" for="add-email">Email</label>
					<input
						class="input"
						id="add-email"
						name="email"
						type="email"
						value={addValues?.email ?? ''}
						aria-invalid={addErrors.email ? 'true' : undefined}
					/>
					{#if addErrors.email}<p class="error-text">{addErrors.email}</p>{/if}
				</div>
				<div class="field">
					<label class="label" for="add-phone">Mobile</label>
					<input
						class="input"
						id="add-phone"
						name="phone"
						type="tel"
						value={addValues?.phone ?? ''}
					/>
				</div>
				<div class="field">
					<label class="label" for="add-company">Company</label>
					<input class="input" id="add-company" name="company" value={addValues?.company ?? ''} />
				</div>
			</div>
			<div class="add-actions">
				<button type="button" class="btn btn-ghost" onclick={() => (adding = false)}>Cancel</button>
				<button class="btn btn-primary">Check in</button>
			</div>
		</form>
	{/if}

	{#if data.attendees.length === 0}
		<p class="placeholder muted">No one has checked in yet.</p>
	{:else}
		<div class="table-wrap">
			<table class="table">
				<thead>
					<tr>
						<th>Name</th>
						<th>Email</th>
						<th>Mobile</th>
						<th>Company</th>
						<th>Time</th>
						<th>Via</th>
						<th><span class="sr-only">Actions</span></th>
					</tr>
				</thead>
				<tbody>
					{#each filtered as a (a.checkin_id)}
						<tr>
							<td>
								<div class="person">
									<span class="avatar" aria-hidden="true">{initials(a.name)}</span>
									<span>
										<span class="person-name">{a.name}</span>
										{#if a.is_returning}<span class="pill pill-brand tiny">Returning</span>{/if}
									</span>
								</div>
							</td>
							<td
								>{#if a.email}<a href={mailtoHref(a.email)}>{a.email}</a>{:else}<span class="muted"
										>–</span
									>{/if}</td
							>
							<td class="num">{a.phone ?? '–'}</td>
							<td>
								{a.company || '–'}
								{#if a.job_title}<div class="muted small">{a.job_title}</div>{/if}
							</td>
							<td class="num nowrap">{formatTime(a.checked_in_at, event.timezone)}</td>
							<td class="muted small nowrap">{METHOD_LABEL[a.method]} · {DEVICE_LABEL[a.device]}</td
							>
							<td>
								<form
									method="POST"
									action="?/remove"
									use:enhance={({ cancel }) => {
										if (
											!confirm(`Remove ${a.name}'s check-in? Their contact stays in the database.`)
										)
											cancel();
									}}
								>
									<input type="hidden" name="checkin" value={a.checkin_id} />
									<button class="btn btn-ghost btn-icon btn-sm" title="Remove check-in">
										<X size={16} /><span class="sr-only">Remove {a.name}'s check-in</span>
									</button>
								</form>
							</td>
						</tr>
					{:else}
						<tr><td colspan="7" class="muted">No one matches “{query}”.</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

<section class="card panel activity">
	<div class="panel-head">
		<h2><ScrollText size={17} /> Activity</h2>
		<p class="muted">Exports, deletions, locks and merges on this event: who, when and how many</p>
	</div>
	{#if data.activity.length === 0}
		<p class="placeholder muted">Nothing logged yet.</p>
	{:else}
		<ul class="log">
			{#each data.activity as a (a.id)}
				<li>
					<span class="log-kind">{ACTIVITY_LABEL[a.kind]}</span>
					<span class="muted">{activityDetail(a.kind, a.what, a.row_count)}</span>
					<span class="muted small log-when">
						{a.who || 'Someone'} · {formatDateTime(a.at, event.timezone)}
					</span>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<details class="card settings" id="settings" open={page.url.hash === '#settings'}>
	<summary><Settings size={18} /> Event settings</summary>
	<form
		method="POST"
		action="?/update"
		use:enhance={() =>
			async ({ update }) =>
				update({ reset: false })}
	>
		<EventFields
			values={form && 'settingsValues' in form && form.settingsValues
				? form.settingsValues
				: data.settings}
			errors={form && 'settingsErrors' in form ? form.settingsErrors : undefined}
		/>
		<div class="settings-actions">
			{#if form && 'saved' in form}<span class="muted saved">Saved</span>{/if}
			<button class="btn btn-primary">Save changes</button>
		</div>
	</form>
	<div class="danger">
		<div>
			<h3>Delete this event</h3>
			<p class="muted">Removes the event and its check-ins. Contacts stay in your database.</p>
		</div>
		<form
			method="POST"
			action="?/delete"
			use:enhance={({ cancel }) => {
				if (!confirm(`Delete “${event.name}” and all ${data.attendees.length} check-ins?`))
					cancel();
			}}
		>
			<button class="btn btn-danger">Delete event</button>
		</form>
	</div>
</details>

<div class="toasts" aria-live="polite">
	{#each toasts as t (t)}
		<div class="toast" in:fly={{ y: 16, duration: 250 }} out:fly={{ x: 40, duration: 200 }}>
			<span class="avatar" aria-hidden="true">{initials(t.name)}</span>
			<span
				><strong>{t.name}</strong> checked in{#if t.company}<span class="muted">
						· {t.company}</span
					>{/if}</span
			>
		</div>
	{/each}
</div>

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

	.kept {
		margin-top: -4px;
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

	.created,
	.banner-warn {
		margin-bottom: 16px;
	}

	.banner code {
		font-size: 13px;
	}

	.kpis {
		display: grid;
		grid-template-columns: 1.3fr repeat(3, 1fr);
		gap: 14px;
		margin-bottom: 14px;
	}

	.kpi {
		display: grid;
		align-content: space-between;
		gap: 6px;
		padding: 18px 20px;
		min-height: 118px;
	}

	.kpi-label {
		font-size: 14px;
		font-weight: 650;
		color: var(--text-2);
	}

	.kpi-value {
		font-size: 34px;
		font-weight: 700;
		letter-spacing: -0.03em;
		line-height: 1;
	}

	.kpi-sub {
		font-size: 13.5px;
	}

	.hero {
		background:
			radial-gradient(
				120% 140% at 100% 0%,
				color-mix(in oklab, var(--aurora-1) 16%, transparent),
				transparent 60%
			),
			var(--surface);
	}

	.hero-value {
		font-size: 60px;
		font-weight: 700;
		letter-spacing: -0.045em;
		line-height: 1;
	}

	.layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 340px;
		gap: 14px;
		margin-bottom: 14px;
	}

	.main-col {
		display: grid;
		gap: 14px;
		align-content: start;
	}

	.panel {
		padding: 20px;
		min-width: 0;
	}

	.panel-head {
		margin-bottom: 16px;
	}

	.panel-head h2,
	.table-head h2 {
		font-size: 17px;
		margin-bottom: 2px;
	}

	.panel-head p,
	.table-head p {
		font-size: 14px;
	}

	.placeholder {
		padding: 28px 0;
		text-align: center;
		font-size: 14.5px;
	}

	.qr-panel {
		display: grid;
		gap: 14px;
		align-content: start;
	}

	.qr-panel .panel-head {
		margin-bottom: 0;
	}

	.qr-box {
		position: relative;
		padding: 14px;
		border-radius: var(--radius);
		background: #fff;
		border: 1px solid var(--border);
	}

	.qr-box.off :global(.qr) {
		opacity: 0.15;
	}

	.qr-closed {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		font-weight: 750;
		color: #0b0b1a;
	}

	.qr-wait {
		aspect-ratio: 1;
		display: grid;
		place-items: center;
		color: #5b4cf0;
	}

	.link-row {
		display: flex;
		gap: 8px;
	}

	.link-row .input {
		height: 40px;
		font-size: 13.5px;
		color: var(--text-2);
	}

	.qr-actions {
		display: flex;
		gap: 8px;
	}

	.preview {
		font-size: 14px;
		font-weight: 600;
		justify-self: center;
	}

	.attendees {
		padding: 20px 0 8px;
		margin-bottom: 14px;
		overflow: hidden;
	}

	.table-head {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		gap: 12px;
		flex-wrap: wrap;
		padding: 0 20px 16px;
	}

	.table-tools {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}

	.search {
		position: relative;
		display: flex;
		align-items: center;
		color: var(--muted);
	}

	.search :global(svg) {
		position: absolute;
		left: 12px;
		pointer-events: none;
	}

	.search .input {
		height: 44px;
		padding-left: 38px;
		width: min(300px, 70vw);
	}

	.add {
		display: grid;
		gap: 12px;
		margin: 0 20px 18px;
		padding: 16px;
		border-radius: var(--radius);
		background: var(--surface-2);
	}

	.add-grid {
		display: grid;
		gap: 12px;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
	}

	.add-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}

	.table :global(th:first-child),
	.table :global(td:first-child) {
		padding-left: 20px;
	}

	.person {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 180px;
	}

	.person-name {
		font-weight: 650;
		margin-right: 6px;
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

	.tiny {
		font-size: 11.5px;
		padding: 2px 8px;
		vertical-align: 1px;
	}

	.small {
		font-size: 13px;
	}

	.nowrap {
		white-space: nowrap;
	}

	td a {
		color: inherit;
		text-decoration: none;
	}

	td a:hover {
		color: var(--brand-text);
		text-decoration: underline;
	}

	.activity {
		margin-bottom: 14px;
	}

	.activity h2 {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.log {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.log li {
		display: flex;
		align-items: baseline;
		gap: 10px;
		flex-wrap: wrap;
		padding: 8px 0;
		border-top: 1px solid var(--border);
		font-size: 14.5px;
	}

	.log-kind {
		font-weight: 650;
	}

	.log-when {
		margin-left: auto;
		white-space: nowrap;
	}

	.settings {
		padding: 0;
	}

	.settings summary {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 18px 20px;
		font-weight: 700;
		cursor: pointer;
		list-style: none;
	}

	.settings summary::-webkit-details-marker {
		display: none;
	}

	.settings form {
		display: grid;
		gap: 20px;
		padding: 4px 20px 20px;
	}

	.settings-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 12px;
	}

	.saved {
		font-weight: 600;
	}

	.danger {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		flex-wrap: wrap;
		margin: 0 20px 20px;
		padding: 16px;
		border-radius: var(--radius);
		border: 1px solid color-mix(in oklab, var(--bad) 30%, var(--border));
	}

	.danger h3 {
		font-size: 15px;
		margin-bottom: 2px;
	}

	.danger p {
		font-size: 14px;
	}

	.toasts {
		position: fixed;
		right: 16px;
		bottom: 16px;
		display: grid;
		gap: 8px;
		z-index: 50;
	}

	.toast {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 16px 10px 10px;
		border-radius: 999px;
		background: var(--surface);
		border: 1px solid var(--border);
		box-shadow: var(--shadow-lg);
		font-size: 14.5px;
	}

	@media (max-width: 1000px) {
		.layout {
			grid-template-columns: 1fr;
		}

		.qr-panel {
			max-width: 420px;
		}
	}

	@media (max-width: 760px) {
		.kpis {
			grid-template-columns: 1fr 1fr;
		}

		.hero {
			grid-column: 1 / -1;
		}
	}
</style>
