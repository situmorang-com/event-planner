<script lang="ts">
	import { deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { t, plural, lang } from '$lib/i18n/t.svelte';
	import { parseConnections, type Connection } from '$lib/linkedin-export';
	import { timeAgo } from '$lib/time';
	import { fileFromZip } from '$lib/unzip';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import Download from '@lucide/svelte/icons/download';
	import Upload from '@lucide/svelte/icons/upload';
	import X from '@lucide/svelte/icons/x';

	// Who accepted our requests (D28): LinkedIn has no API for it, so this reads Connections.csv
	// from LinkedIn's own data export, in the browser, and sends names, links and dates only.
	let { syncedAt, now }: { syncedAt: number | null; now: number } = $props();

	const EXPORT_PAGE = 'https://www.linkedin.com/mypreferences/d/download-my-data';
	// A few thousand connections are past the server's upload limit in one go.
	const CHUNK = 1000;

	let open = $state(false);
	let busy = $state(false);
	let dragging = $state(false);
	let error = $state('');
	let done = $state<{ total: number; names: string[]; already: number } | null>(null);
	let panel = $state<HTMLElement | null>(null);
	let input = $state<HTMLInputElement | null>(null);

	async function readFile(file: File): Promise<Connection[] | null> {
		const text = /\.zip$/i.test(file.name)
			? await fileFromZip(await file.arrayBuffer(), 'connections.csv')
			: await file.text();
		return text === null ? null : parseConnections(text);
	}

	async function sync(file: File) {
		error = '';
		done = null;
		busy = true;
		try {
			const connections = await readFile(file);
			if (!connections) {
				error = t(
					'That isn’t LinkedIn’s Connections file. Choose the zip LinkedIn sent, or Connections.csv inside it.'
				);
				return;
			}
			const result = { total: connections.length, names: [] as string[], already: 0 };
			for (let i = 0; i < connections.length || i === 0; i += CHUNK) {
				const body = new FormData();
				body.set('connections', JSON.stringify(connections.slice(i, i + CHUNK)));
				const res = await fetch('/admin?/linkedinSync', {
					method: 'POST',
					body,
					headers: { 'x-sveltekit-action': 'true' }
				});
				const answer = deserialize(await res.text());
				if (answer.type !== 'success') throw new Error();
				const synced = (
					answer.data as { synced: { connected: { name: string }[]; already: number } }
				).synced;
				result.names.push(...synced.connected.map((p) => p.name));
				result.already += synced.already;
			}
			done = result;
			await invalidateAll();
		} catch {
			error = t('That didn’t work. Try again.');
		} finally {
			busy = false;
			if (input) input.value = '';
		}
	}

	function pick(e: Event) {
		const file = (e.currentTarget as HTMLInputElement).files?.[0];
		if (file) sync(file);
	}

	function drop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		const file = e.dataTransfer?.files[0];
		if (file) sync(file);
	}

	// Closes on a press outside it or Escape, like the row menus.
	$effect(() => {
		if (!open) return;
		const away = (e: PointerEvent) => {
			if (panel && !panel.contains(e.target as Node)) open = false;
		};
		const esc = (e: KeyboardEvent) => {
			if (e.key === 'Escape') open = false;
		};
		document.addEventListener('pointerdown', away);
		document.addEventListener('keydown', esc);
		return () => {
			document.removeEventListener('pointerdown', away);
			document.removeEventListener('keydown', esc);
		};
	});
</script>

<div class="sync" bind:this={panel}>
	<button
		type="button"
		class="btn btn-secondary"
		aria-expanded={open}
		onclick={() => ((open = !open), (done = null), (error = ''))}
	>
		<RefreshCw size={17} class={busy ? 'spin' : ''} />
		{t('Sync LinkedIn')}
	</button>

	{#if open}
		<div
			class="panel card"
			role="dialog"
			tabindex="-1"
			aria-label={t('Sync LinkedIn connections')}
			class:dragging
			ondragover={(e) => (e.preventDefault(), (dragging = true))}
			ondragleave={() => (dragging = false)}
			ondrop={drop}
		>
			<div class="panel-head">
				<strong>{t('Who accepted on LinkedIn?')}</strong>
				<button
					type="button"
					class="btn btn-ghost btn-icon btn-sm"
					aria-label={t('Close')}
					onclick={() => (open = false)}><X size={16} /></button
				>
			</div>
			<p class="muted small">
				{t(
					'LinkedIn doesn’t let other apps see your connections, so this reads the list LinkedIn gives you. Everyone who accepted turns Connected, and they show here to message.'
				)}
			</p>
			<ol>
				<li>
					<a class="btn btn-soft btn-sm" href={EXPORT_PAGE} target="_blank" rel="noopener"
						><Download size={15} /> {t('Request the export on LinkedIn')}</a
					>
					<span class="muted small"
						>{t('Tick only “Connections”: LinkedIn emails it in about 10 minutes.')}</span
					>
				</li>
				<li>
					<button
						type="button"
						class="btn btn-primary btn-sm"
						disabled={busy}
						onclick={() => input?.click()}
						><Upload size={15} /> {busy ? t('Syncing…') : t('Choose the file')}</button
					>
					<span class="muted small"
						>{t('The zip from LinkedIn, or Connections.csv. You can drop it here.')}</span
					>
				</li>
			</ol>
			<input
				bind:this={input}
				type="file"
				accept=".zip,.csv,application/zip,text/csv"
				hidden
				onchange={pick}
			/>

			{#if error}<p class="error small" role="alert">{error}</p>{/if}
			{#if done}
				<p class="result small" role="status">
					{#if done.names.length}
						<strong>{plural(done.names.length, '{n} new connection', '{n} new connections')}</strong
						>: {done.names.join(', ')}
					{:else}
						{t('No new connections among your guests.')}
					{/if}
					<span class="muted">
						· {plural(done.total, '{n} in the file', '{n} in the file')}{#if done.already}
							· {plural(done.already, '{n} already connected', '{n} already connected')}{/if}
					</span>
				</p>
			{:else if syncedAt}
				<p class="muted small">{t('Last synced {ago}', { ago: timeAgo(syncedAt, now, lang()) })}</p>
			{/if}
		</div>
	{/if}
</div>

<style>
	/* The panel hangs from the nearest positioned box (the page head), so it stays on screen
	   when the buttons wrap on a phone. */
	.sync {
		display: contents;
	}

	.panel {
		position: absolute;
		right: 0;
		top: calc(100% + 8px);
		z-index: 20;
		width: min(420px, calc(100vw - 32px));
		padding: 16px 18px;
		display: grid;
		gap: 10px;
		box-shadow: var(--shadow-lg);
	}

	.panel.dragging {
		border-color: var(--brand);
		box-shadow: var(--ring), var(--shadow-lg);
	}

	.panel-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	ol {
		margin: 0;
		padding-left: 20px;
		display: grid;
		gap: 10px;
	}

	li {
		display: grid;
		gap: 4px;
		justify-items: start;
	}

	.small {
		font-size: 13px;
		margin: 0;
	}

	.error {
		color: var(--bad);
	}

	.result {
		background: var(--good-soft);
		color: var(--good);
		padding: 8px 10px;
		border-radius: var(--radius-sm);
	}

	:global(.spin) {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
