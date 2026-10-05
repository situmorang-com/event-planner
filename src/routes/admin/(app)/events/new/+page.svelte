<script lang="ts">
	import { enhance } from '$app/forms';
	import EventFields from '$lib/components/EventFields.svelte';
	import { t } from '$lib/i18n/t.svelte';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let busy = $state(false);
</script>

<svelte:head>
	<title>{t('New event')} · Event Planner</title>
</svelte:head>

<a class="back btn btn-ghost btn-sm" href="/admin"><ArrowLeft size={16} /> {t('Events')}</a>

<form
	class="card rise"
	method="POST"
	use:enhance={() => {
		busy = true;
		return async ({ update }) => {
			await update({ reset: false });
			busy = false;
		};
	}}
>
	<div>
		<h1>{t('New event')}</h1>
		<p class="muted">{t('You can change any of this later.')}</p>
	</div>

	<EventFields values={form?.values ?? data.values} errors={form?.errors} />

	<div class="actions">
		<a class="btn btn-ghost" href="/admin">{t('Cancel')}</a>
		<button class="btn btn-primary" disabled={busy}>
			{#if busy}<span class="spinner"></span>{/if}
			{t('Create event')}
		</button>
	</div>
</form>

<style>
	.back {
		margin: -8px 0 12px -10px;
	}

	form {
		max-width: 760px;
		display: grid;
		gap: 26px;
		padding: 28px 24px;
	}

	h1 {
		font-size: 28px;
		margin-bottom: 4px;
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
	}
</style>
