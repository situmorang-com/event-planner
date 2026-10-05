<script lang="ts">
	import { enhance } from '$app/forms';
	import Logo from '$lib/components/Logo.svelte';
	import { t } from '$lib/i18n/t.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let busy = $state(false);
</script>

<svelte:head>
	<title>{t('Sign in')} · Event Planner</title>
</svelte:head>

<div class="aurora" aria-hidden="true"></div>

<main>
	<form
		class="card rise"
		method="POST"
		use:enhance={() => {
			busy = true;
			return async ({ update }) => {
				await update();
				busy = false;
			};
		}}
	>
		<Logo size={36} />
		<div>
			<h1>{t('Organizer sign in')}</h1>
			<p class="muted">{t('Run check-in, watch arrivals and export contacts.')}</p>
		</div>

		{#if !data.configured}
			<p class="banner banner-warn">
				<span>
					{t('Sign-in is switched off until an')} <strong>ADMIN_PASSWORD</strong>
					{t('environment variable is set on the server.')}
				</span>
			</p>
		{:else}
			{#if data.devPassword}
				<p class="banner banner-brand">
					<span
						>{t('Local development: the password is')} <strong>admin</strong>
						{t('until you set ADMIN_PASSWORD.')}</span
					>
				</p>
			{/if}
			<div class="field">
				<label class="label" for="password">{t('Password')}</label>
				<!-- svelte-ignore a11y_autofocus -->
				<input
					class="input"
					id="password"
					name="password"
					type="password"
					autocomplete="current-password"
					required
					autofocus
					aria-invalid={form?.message ? 'true' : undefined}
				/>
				{#if form?.message}<p class="error-text">{t(form.message)}</p>{/if}
			</div>
			<button class="btn btn-primary btn-lg btn-block" disabled={busy}>
				{#if busy}<span class="spinner"></span>{/if}
				{t('Sign in')}
			</button>
		{/if}
	</form>
</main>

<style>
	.aurora {
		position: fixed;
		inset: 0;
		z-index: -1;
		background:
			radial-gradient(
				40% 45% at 30% 30%,
				color-mix(in oklab, var(--aurora-1) 30%, transparent),
				transparent 70%
			),
			radial-gradient(
				35% 40% at 70% 70%,
				color-mix(in oklab, var(--aurora-2) 22%, transparent),
				transparent 70%
			);
	}

	main {
		min-height: 100dvh;
		display: grid;
		place-items: center;
		padding: 24px 16px;
	}

	form {
		width: min(420px, 100%);
		display: grid;
		gap: 20px;
		padding: 30px 24px;
	}

	h1 {
		font-size: 24px;
		margin-bottom: 4px;
	}
</style>
