<script lang="ts">
	import { page } from '$app/state';
	import Logo from '$lib/components/Logo.svelte';
	import { t } from '$lib/i18n/t.svelte';
</script>

<svelte:head>
	<title>{page.status === 404 ? t('Not found') : t('Something went wrong')} · Event Planner</title>
</svelte:head>

<main>
	<Logo size={40} wordmark={false} />
	<p class="code">{page.status}</p>
	<h1>{page.status === 404 ? t('We couldn’t find that page') : t('Something went wrong')}</h1>
	<p class="muted">
		{#if page.status === 404}
			{t(
				'If you scanned a QR code, it may belong to an event that has ended. Ask the team at the entrance for the current code.'
			)}
		{:else}
			{page.error?.message ? t(page.error.message) : ''}
		{/if}
	</p>
	<a class="btn btn-secondary" href="/">{t('Go home')}</a>
</main>

<style>
	main {
		min-height: 100dvh;
		display: grid;
		place-content: center;
		justify-items: center;
		gap: 14px;
		padding: 24px 16px;
		text-align: center;
		max-width: 460px;
		margin: 0 auto;
	}

	.code {
		font-size: 14px;
		font-weight: 700;
		letter-spacing: 0.12em;
		color: var(--brand-text);
		margin-top: 8px;
	}

	h1 {
		font-size: 26px;
	}

	a {
		margin-top: 10px;
	}
</style>
