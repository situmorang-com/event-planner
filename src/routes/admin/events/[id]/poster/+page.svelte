<script lang="ts">
	import Logo from '$lib/components/Logo.svelte';
	import QrCode from '$lib/components/QrCode.svelte';
	import { t } from '$lib/i18n/t.svelte';
	import Printer from '@lucide/svelte/icons/printer';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{t('Poster')} · {data.event.name}</title>
</svelte:head>

<div class="tools">
	<a class="btn btn-ghost btn-sm" href="/admin/events/{data.event.id}"
		><ArrowLeft size={16} /> {t('Back')}</a
	>
	{#if !data.event.rotating}
		<button class="btn btn-primary btn-sm" onclick={() => print()}
			><Printer size={16} /> {t('Print')}</button
		>
	{/if}
</div>

{#if data.event.rotating}
	<p class="note card">
		{t(
			'This event uses a live QR code that changes every 20 seconds, so there’s nothing fixed to print.'
		)}
		{t('Switch the event to Printed QR in its settings, or open the entrance screen instead.')}
	</p>
{:else}
	<article class="poster">
		<p class="kicker">{t('Welcome to')}</p>
		<h1>{data.event.name}</h1>
		{#if data.event.venue}<p class="venue">{data.event.venue}</p>{/if}
		<div class="qr"><QrCode value={data.link} label={t('Scan to check in')} /></div>
		<h2>{t('Scan to check in')}</h2>
		<p class="how">
			{t('Open your phone camera and point it at the code. No app, about five seconds.')}
		</p>
		<p class="link">{data.shortLink}</p>
		<footer><Logo size={22} /></footer>
	</article>
{/if}

<style>
	:global(body) {
		background: var(--surface-2);
	}

	.tools {
		display: flex;
		justify-content: space-between;
		max-width: 794px;
		margin: 16px auto;
		padding: 0 16px;
	}

	.note {
		max-width: 560px;
		margin: 40px auto;
		padding: 24px;
	}

	.poster {
		width: min(794px, calc(100% - 32px));
		aspect-ratio: 210 / 297;
		margin: 0 auto 40px;
		padding: 7% 8%;
		background: #fff;
		color: #0b0b1a;
		border-radius: 12px;
		box-shadow: var(--shadow);
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
	}

	.kicker {
		font-size: 18px;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: #5b4cf0;
	}

	h1 {
		font-size: clamp(30px, 6vw, 54px);
		font-weight: 800;
		letter-spacing: -0.035em;
		margin-top: 10px;
	}

	.venue {
		font-size: 18px;
		color: #4a4f66;
		margin-top: 8px;
	}

	.qr {
		width: 64%;
		margin: auto 0 0;
		padding-top: 5%;
	}

	h2 {
		font-size: clamp(26px, 5vw, 44px);
		font-weight: 800;
		letter-spacing: -0.03em;
		margin-top: 4%;
	}

	.how {
		font-size: 18px;
		color: #4a4f66;
		margin-top: 8px;
		max-width: 30ch;
	}

	.link {
		font-size: 15px;
		font-weight: 700;
		margin-top: 14px;
		color: #0b0b1a;
	}

	footer {
		margin-top: auto;
		padding-top: 5%;
	}

	footer :global(.word) {
		color: #0b0b1a;
	}

	@media print {
		@page {
			size: A4;
			margin: 0;
		}

		:global(body) {
			background: #fff;
		}

		.tools {
			display: none;
		}

		.poster {
			width: 100%;
			height: 100vh;
			margin: 0;
			border-radius: 0;
			box-shadow: none;
		}
	}
</style>
