<script lang="ts">
	import { deserialize } from '$app/forms';
	import { lang, plural, t } from '$lib/i18n/t.svelte';
	import type { PeopleRow } from '$lib/people';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import Undo2 from '@lucide/svelte/icons/undo-2';
	import UserPlus from '@lucide/svelte/icons/user-plus';
	import X from '@lucide/svelte/icons/x';

	/*
	 * Review mode: the To review rows one at a time, decided with a key. Add shortlists the
	 * person, Skip hides them, Add & connect also opens their LinkedIn and records the request
	 * (D26), exactly as the row's own buttons do. The queue is the list as it was on opening;
	 * the page reloads its data when review closes.
	 */

	interface Props {
		/** The Found rows to review, in the page's company order. */
		queue: PeopleRow[];
		/** How many people each company already has on the list, by company key. */
		listed: Record<string, number>;
		onclose: () => void;
	}

	let { queue, listed, onclose }: Props = $props();

	type Decision = 'added' | 'connected' | 'skipped';
	let decided = $state<Record<number, Decision>>({});
	let history = $state<{ id: number; decision: Decision }[]>([]);
	let index = $state(0);
	let busy = $state(false);
	let problem = $state('');
	let dialog = $state<HTMLDialogElement | null>(null);

	const row = $derived<PeopleRow | undefined>(queue[index]);
	const done = $derived(queue.filter((r) => decided[r.id]).length);
	const finished = $derived(done === queue.length);
	const added = $derived(Object.values(decided).filter((d) => d !== 'skipped').length);
	const connected = $derived(Object.values(decided).filter((d) => d === 'connected').length);
	const skipped = $derived(Object.values(decided).filter((d) => d === 'skipped').length);
	const canAdd = $derived(!!row && !row.blocked_at && !row.suppressed);
	// On the list at this company now: before review, plus who was added in this session.
	const atCompany = $derived(
		row
			? (listed[row.company_key] ?? 0) +
					queue.filter(
						(r) => r.company_key === row.company_key && decided[r.id] && decided[r.id] !== 'skipped'
					).length
			: 0
	);
	const host = (url: string) => {
		try {
			return new URL(url).hostname.replace(/^www\./, '');
		} catch {
			return url;
		}
	};

	$effect(() => {
		dialog?.showModal();
	});

	async function post(action: string, fields: Record<string, string>) {
		const body = new FormData();
		for (const [k, v] of Object.entries(fields)) body.set(k, v);
		const res = await fetch(`${location.pathname}?/${action}`, {
			method: 'POST',
			body,
			headers: { 'x-sveltekit-action': 'true' }
		});
		const result = deserialize(await res.text());
		if (result.type === 'failure') {
			const data = (result.data ?? {}) as Record<string, unknown>;
			throw new Error(String(Object.values(data)[0] ?? t('That didn’t work. Try again.')));
		}
		if (result.type === 'error') throw new Error(t('That didn’t work. Try again.'));
	}

	/** The next row nobody has decided, after this one (wrapping round), or stay put. */
	function advance() {
		for (let step = 1; step <= queue.length; step++) {
			const next = (index + step) % queue.length;
			if (!decided[queue[next].id]) {
				index = next;
				return;
			}
		}
	}

	async function decide(decision: Decision) {
		const current = row;
		if (!current || busy || decided[current.id]) return;
		if (decision !== 'skipped' && !canAdd) return;
		// The profile opens inside the key press or click, before anything waits, or the
		// browser would block it as a pop-up.
		if (decision === 'connected' && current.linkedin)
			window.open(current.linkedin, '_blank', 'noopener');
		busy = true;
		problem = '';
		try {
			if (decision === 'skipped') await post('skip', { id: String(current.id) });
			else {
				await post('shortlist', { id: String(current.id) });
				// Adding keeps the row's id, now with a person behind it: the request is theirs.
				if (decision === 'connected')
					await post('linkedin', { id: String(current.id), status: 'requested', opened: '1' });
			}
			decided[current.id] = decision;
			history.push({ id: current.id, decision });
			advance();
		} catch (e) {
			problem = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	// Only a skip can be taken back here; an added person is on the list, where Remove is.
	const lastSkip = $derived([...history].reverse().find((h) => h.decision === 'skipped'));
	async function undoSkip() {
		const last = lastSkip;
		if (!last || busy) return;
		busy = true;
		problem = '';
		try {
			await post('unskip', { id: String(last.id) });
			delete decided[last.id];
			history = history.filter((h) => h !== last);
			index = queue.findIndex((r) => r.id === last.id);
		} catch (e) {
			problem = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	function step(by: number) {
		index = (index + by + queue.length) % queue.length;
	}

	function keys(e: KeyboardEvent) {
		if (e.metaKey || e.ctrlKey || e.altKey || finished) return;
		const k = e.key.toLowerCase();
		const action: Record<string, () => void> = {
			a: () => decide('added'),
			c: () => row?.linkedin && decide('connected'),
			s: () => decide('skipped'),
			u: () => undoSkip(),
			arrowright: () => step(1),
			arrowleft: () => step(-1),
			l: () => row?.linkedin && window.open(row.linkedin, '_blank', 'noopener'),
			o: () => row?.source_url && window.open(row.source_url, '_blank', 'noopener')
		};
		if (!action[k]) return;
		e.preventDefault();
		action[k]();
	}
</script>

<svelte:window onkeydown={keys} />

<dialog
	class="review"
	bind:this={dialog}
	aria-label={t('Review the people research found')}
	{onclose}
>
	<header class="top">
		<p class="count">
			{#if finished}
				{t('All reviewed')}
			{:else}
				{t('Review · {n} of {total}', { n: index + 1, total: queue.length })}
			{/if}
		</p>
		<div
			class="bar"
			role="progressbar"
			aria-label={t('Reviewed')}
			aria-valuemin="0"
			aria-valuemax={queue.length}
			aria-valuenow={done}
		>
			<span style="width: {queue.length ? (done / queue.length) * 100 : 100}%"></span>
		</div>
		<button
			class="btn btn-ghost btn-icon btn-sm"
			onclick={() => dialog?.close()}
			title={t('Close (Esc)')}
		>
			<X size={18} /><span class="sr-only">{t('Close')}</span>
		</button>
	</header>

	{#if finished}
		<div class="done">
			<h2>{t('Done for now')}</h2>
			<p>
				{[
					plural(added, '{n} added', '{n} added'),
					connected
						? plural(connected, '{n} LinkedIn request recorded', '{n} LinkedIn requests recorded')
						: '',
					plural(skipped, '{n} skipped', '{n} skipped')
				]
					.filter(Boolean)
					.join(' · ')}
			</p>
			<p class="muted">
				{t('Everyone you added is Shortlisted on the People tab, ready to invite.')}
			</p>
			<button class="btn btn-primary" onclick={() => dialog?.close()}
				>{t('Back to the list')}</button
			>
		</div>
	{:else if row}
		{@const state = decided[row.id]}
		<article class="card-body" aria-live="polite">
			<p class="company">
				<strong>{row.company || t('No company')}</strong>
				<span class="muted">· {plural(atCompany, '{n} on the list', '{n} on the list')}</span>
			</p>
			<h2 class="name">{row.name}</h2>
			{#if row.job_title}<p class="title">{row.job_title}</p>{/if}
			{#if row.reason}<p class="reason">{row.reason}</p>{/if}
			<p class="links">
				{#if row.source_url}
					<a href={row.source_url} target="_blank" rel="noreferrer"
						>{t('Source: {site}', { site: host(row.source_url) })} <ExternalLink size={12} /></a
					>
				{/if}
				{#if row.linkedin}
					<a href={row.linkedin} target="_blank" rel="noreferrer"
						>{t('LinkedIn profile')} <ExternalLink size={12} /></a
					>
				{/if}
			</p>
			{#if !canAdd}
				<p class="warn">
					{row.blocked_at
						? t('Their company is blocked: they can only be skipped.')
						: t('Dynamics 365 marks them do-not-contact: they can only be skipped.')}
				</p>
			{/if}
			{#if state}
				<p class="state {state}">
					{state === 'skipped'
						? t('Skipped')
						: state === 'connected'
							? t('Added, LinkedIn request recorded')
							: t('Added')}
				</p>
			{/if}
			{#if problem}<p class="error-text" role="alert">{problem}</p>{/if}
		</article>

		<footer class="decide">
			<button
				class="btn btn-secondary"
				disabled={busy || !!state}
				onclick={() => decide('skipped')}
			>
				{t('Skip')} <kbd>S</kbd>
			</button>
			<button
				class="btn btn-soft"
				disabled={busy || !!state || !canAdd}
				onclick={() => decide('added')}
			>
				<UserPlus size={16} />
				{t('Add')} <kbd>A</kbd>
			</button>
			{#if row.linkedin}
				<button
					class="btn btn-primary"
					disabled={busy || !!state || !canAdd}
					onclick={() => decide('connected')}
					title={t(
						'Add them and open their LinkedIn to send a connection request; it is recorded as sent'
					)}
				>
					<span class="in" aria-hidden="true">in</span>
					{t('Add & connect')} <kbd>C</kbd>
				</button>
			{/if}
		</footer>
		<p class="hints muted">
			{t('← → move without deciding · L opens LinkedIn · O opens the source')}
			{#if lastSkip}
				· <button class="link-btn" onclick={undoSkip} disabled={busy}
					><Undo2 size={12} /> {t('Undo the last skip')} <kbd>U</kbd></button
				>
			{/if}
		</p>
	{/if}
</dialog>

<style>
	.review {
		width: min(640px, calc(100vw - 32px));
		max-height: calc(100dvh - 32px);
		padding: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface);
		color: var(--text);
		box-shadow: var(--shadow-lg);
	}

	.review::backdrop {
		background: color-mix(in oklab, var(--bg) 70%, transparent);
		backdrop-filter: blur(4px);
	}

	.top {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: 14px;
		padding: 12px 14px 12px 20px;
		border-bottom: 1px solid var(--border);
	}

	.count {
		margin: 0;
		font-size: 13px;
		font-weight: 700;
		color: var(--text-2);
	}

	.bar {
		height: 6px;
		border-radius: 999px;
		background: var(--surface-3);
		overflow: hidden;
	}

	.bar span {
		display: block;
		height: 100%;
		background: var(--brand);
		transition: width 0.2s ease;
	}

	.card-body {
		display: grid;
		gap: 8px;
		padding: 22px 24px 10px;
	}

	.company {
		margin: 0;
		font-size: 14px;
	}

	.name {
		margin: 4px 0 0;
		font-size: 24px;
		line-height: 1.2;
	}

	.title {
		margin: 0;
		color: var(--text-2);
		font-weight: 600;
	}

	.reason {
		margin: 6px 0 0;
		padding: 12px 14px;
		border-radius: 12px;
		background: var(--surface-2);
		line-height: 1.5;
	}

	.links {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 16px;
		margin: 4px 0 0;
		font-size: 14px;
	}

	.links a {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-weight: 650;
	}

	.warn {
		margin: 0;
		color: var(--warn);
		font-weight: 600;
	}

	.state {
		margin: 0;
		font-weight: 700;
	}

	.state.added,
	.state.connected {
		color: var(--good);
	}

	.state.skipped {
		color: var(--muted);
	}

	.decide {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		padding: 14px 24px 6px;
	}

	.decide .btn {
		flex: 1;
		justify-content: center;
		gap: 8px;
	}

	kbd {
		padding: 1px 6px;
		border-radius: 6px;
		border: 1px solid currentColor;
		font: inherit;
		font-size: 11px;
		font-weight: 750;
		opacity: 0.6;
	}

	.in {
		display: grid;
		place-items: center;
		height: 16px;
		padding: 0 3px;
		border-radius: 4px;
		border: 1.5px solid currentColor;
		font-size: 10px;
		font-weight: 800;
		line-height: 1;
	}

	.hints {
		margin: 0;
		padding: 6px 24px 18px;
		font-size: 12.5px;
	}

	.link-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 0;
		border: 0;
		background: none;
		color: var(--brand-text);
		font: inherit;
		font-weight: 650;
		cursor: pointer;
	}

	.done {
		display: grid;
		justify-items: start;
		gap: 10px;
		padding: 28px 24px 24px;
	}

	.done h2,
	.done p {
		margin: 0;
	}

	@media (max-width: 600px) {
		.decide .btn {
			flex-basis: 100%;
		}

		kbd {
			display: none;
		}
	}
</style>
