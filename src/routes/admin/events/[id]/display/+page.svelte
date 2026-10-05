<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import { flip } from 'svelte/animate';
	import { cubicOut } from 'svelte/easing';
	import { Tween } from 'svelte/motion';
	import { fade, fly, scale } from 'svelte/transition';
	import Logo from '$lib/components/Logo.svelte';
	import QrCode from '$lib/components/QrCode.svelte';
	import { connectLive, type LiveArrival, type LiveQr } from '$lib/live';
	import { initials } from '$lib/names';
	import { t, lang } from '$lib/i18n/t.svelte';
	import { formatTime, timeAgo } from '$lib/time';
	import Maximize from '@lucide/svelte/icons/maximize';
	import Minimize from '@lucide/svelte/icons/minimize';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Lock from '@lucide/svelte/icons/lock';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// svelte-ignore state_referenced_locally
	let qr = $state<LiveQr>(data.qr);
	// svelte-ignore state_referenced_locally
	let arrivals = $state<LiveArrival[]>(data.recent);
	// svelte-ignore state_referenced_locally
	const shown = new Tween(data.count, { duration: 900, easing: cubicOut });
	let welcome = $state<LiveArrival | null>(null);
	let online = $state(true);
	let now = $state(Date.now());
	let fullscreen = $state(false);
	let chromeVisible = $state(true);

	// The server decides when codes rotate; correct for this screen's clock drift.
	// svelte-ignore state_referenced_locally
	const skew = data.serverNow - Date.now();
	const remaining = $derived(qr.rotatesAt ? Math.max(0, qr.rotatesAt - (now + skew)) : 0);

	const clock = $derived(formatTime(now, data.event.timezone, false, lang()));

	const queue: LiveArrival[] = [];
	let welcomeTimer: ReturnType<typeof setTimeout> | undefined;

	function showNextWelcome() {
		welcome = queue.shift() ?? null;
		if (!welcome) return;
		burst();
		welcomeTimer = setTimeout(showNextWelcome, queue.length ? 2200 : 3800);
	}

	async function burst() {
		const { default: confetti } = await import('canvas-confetti');
		confetti({
			particleCount: 90,
			spread: 100,
			startVelocity: 38,
			origin: { x: 0.5, y: 1 },
			colors: ['#7a5cff', '#4f7bff', '#22d3ee', '#f472b6', '#fbbf24'],
			disableForReducedMotion: true
		});
	}

	onMount(() => {
		const tick = setInterval(() => (now = Date.now()), 250);
		const disconnect = connectLive(data.event.id, {
			qr: (next) => (qr = next),
			checkin: ({ count, arrival }) => {
				shown.target = count;
				arrivals = [arrival, ...arrivals.filter((a) => a.id !== arrival.id)].slice(0, 7);
				queue.push(arrival);
				if (!welcome) showNextWelcome();
			},
			refresh: () => invalidateAll(),
			connection: (ok) => (online = ok)
		});

		// Keep a tablet or laptop at the door from dimming the screen.
		let wakeLock: { release(): Promise<void> } | null = null;
		const requestWakeLock = async () => {
			try {
				wakeLock =
					(await (
						navigator as Navigator & {
							wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> };
						}
					).wakeLock?.request('screen')) ?? null;
			} catch {
				/* not supported or not allowed */
			}
		};
		requestWakeLock();
		const onVisible = () => document.visibilityState === 'visible' && requestWakeLock();
		document.addEventListener('visibilitychange', onVisible);

		const onFullscreen = () => (fullscreen = !!document.fullscreenElement);
		document.addEventListener('fullscreenchange', onFullscreen);

		let idle: ReturnType<typeof setTimeout>;
		const wake = () => {
			chromeVisible = true;
			clearTimeout(idle);
			idle = setTimeout(() => (chromeVisible = false), 2500);
		};
		wake();
		window.addEventListener('pointermove', wake);

		return () => {
			clearInterval(tick);
			clearTimeout(idle);
			clearTimeout(welcomeTimer);
			disconnect();
			wakeLock?.release();
			document.removeEventListener('visibilitychange', onVisible);
			document.removeEventListener('fullscreenchange', onFullscreen);
			window.removeEventListener('pointermove', wake);
		};
	});

	// Page data refreshes when doors open/close or someone is removed.
	$effect(() => {
		shown.target = data.count;
		arrivals = data.recent;
	});

	function toggleFullscreen() {
		if (document.fullscreenElement) document.exitFullscreen();
		else document.documentElement.requestFullscreen?.();
	}
</script>

<svelte:head>
	<title>{t('Entrance')} · {data.event.name}</title>
	<meta name="theme-color" content="#05060f" />
</svelte:head>

<div class="screen" class:hide-cursor={!chromeVisible}>
	<div class="aurora" aria-hidden="true"><span></span><span></span><span></span></div>

	<header>
		<div class="brand">
			<Logo size={40} wordmark={false} />
			<div>
				<p class="event">{data.event.name}</p>
				{#if data.event.venue}<p class="venue">{data.event.venue}</p>{/if}
			</div>
		</div>
		<div class="status">
			<span class="live" class:offline={!online}
				><span class="dot dot-live"></span>{online ? t('Live') : t('Reconnecting')}</span
			>
			<span class="clock">{clock}</span>
		</div>
	</header>

	<main>
		<section class="scan">
			<div class="qr-card" class:closed={!data.event.isOpen}>
				{#key qr.url}
					<div class="qr-swap" in:fade={{ duration: 220 }}>
						<QrCode value={qr.url} label={t('Scan to check in')} />
					</div>
				{/key}
				{#if !data.event.isOpen}
					<div class="closed-overlay" transition:fade>
						<Lock size={48} />
						<p>{t('Check-in is closed')}</p>
					</div>
				{/if}
				{#if qr.rotatesAt && data.event.isOpen}
					{#key qr.url}
						<div class="countdown" style="animation-duration: {remaining}ms"></div>
					{/key}
				{/if}
			</div>
			<div class="scan-text">
				<h1>{t('Scan to check in')}</h1>
				<p>
					{t('Open your phone camera and point it at the code. No app needed.')}
					{#if !data.event.rotating}<span class="link">{data.shortLink}</span>{/if}
				</p>
			</div>
		</section>

		<section class="stats">
			<div class="counter">
				<p class="count">{Math.round(shown.current).toLocaleString()}</p>
				<p class="count-label">{t('checked in')}</p>
			</div>

			<div class="arrivals">
				<p class="arrivals-title">{t('Latest arrivals')}</p>
				{#if arrivals.length === 0}
					<p class="empty">{t('Be the first to check in 👋')}</p>
				{:else}
					<ul>
						{#each arrivals as a (a.id)}
							<li animate:flip={{ duration: 400 }} in:fly={{ x: 40, duration: 450 }}>
								<span class="avatar">{initials(a.name)}</span>
								<span class="who">
									<span class="name">{a.name}</span>
									{#if a.company}<span class="company">{a.company}</span>{/if}
								</span>
								<span class="ago">{timeAgo(a.at, now + skew, lang())}</span>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</section>
	</main>

	{#if welcome}
		{#key welcome.id}
			<div
				class="welcome"
				in:scale={{ start: 0.85, duration: 380, easing: cubicOut }}
				out:fade={{ duration: 250 }}
			>
				<span class="wave" aria-hidden="true">👋</span>
				<span>{t('Welcome,')} <strong>{welcome.name.replace(/ \w\.$/, '')}</strong>!</span>
			</div>
		{/key}
	{/if}

	{#if !data.reachable}
		<p class="warning">
			<CircleAlert size={20} />
			{t('Phones can’t reach this address (localhost). Set PUBLIC_BASE_URL.')}
		</p>
	{/if}

	<nav class="chrome" class:visible={chromeVisible}>
		<a class="btn btn-sm" href="/admin/events/{data.event.id}"
			><ArrowLeft size={16} /> {t('Dashboard')}</a
		>
		<button class="btn btn-sm" onclick={toggleFullscreen}>
			{#if fullscreen}<Minimize size={16} /> {t('Exit full screen')}{:else}<Maximize size={16} />
				{t('Full screen')}{/if}
		</button>
	</nav>
</div>

<style>
	.screen {
		--ink: #f3f4ff;
		--ink-2: #b7bce0;
		--ink-3: #7f86b3;
		position: fixed;
		inset: 0;
		overflow: hidden;
		background: #05060f;
		color: var(--ink);
		display: grid;
		grid-template-rows: auto 1fr;
		padding: clamp(16px, 3vmin, 40px) clamp(20px, 4vmin, 56px);
	}

	.hide-cursor {
		cursor: none;
	}

	.aurora {
		position: absolute;
		inset: 0;
		z-index: 0;
		filter: blur(60px) saturate(1.2);
		opacity: 0.9;
		pointer-events: none;
	}

	.aurora span {
		position: absolute;
		border-radius: 50%;
		animation: drift 24s ease-in-out infinite alternate;
	}

	.aurora span:nth-child(1) {
		width: 60vmax;
		height: 60vmax;
		left: -18vmax;
		top: -22vmax;
		background: radial-gradient(circle, rgb(122 92 255 / 0.55), transparent 65%);
	}

	.aurora span:nth-child(2) {
		width: 55vmax;
		height: 55vmax;
		right: -20vmax;
		top: 10vmax;
		background: radial-gradient(circle, rgb(34 211 238 / 0.32), transparent 65%);
		animation-duration: 30s;
		animation-delay: -8s;
	}

	.aurora span:nth-child(3) {
		width: 45vmax;
		height: 45vmax;
		left: 25vmax;
		bottom: -25vmax;
		background: radial-gradient(circle, rgb(244 114 182 / 0.28), transparent 65%);
		animation-duration: 36s;
		animation-delay: -14s;
	}

	@keyframes drift {
		0% {
			transform: translate(0, 0) scale(1);
		}
		50% {
			transform: translate(6vmax, 4vmax) scale(1.08);
		}
		100% {
			transform: translate(-4vmax, 6vmax) scale(0.95);
		}
	}

	header,
	main {
		position: relative;
		z-index: 1;
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 24px;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 16px;
		min-width: 0;
	}

	.event {
		font-size: clamp(18px, 2.6vmin, 30px);
		font-weight: 750;
		letter-spacing: -0.02em;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.venue {
		font-size: clamp(13px, 1.7vmin, 18px);
		color: var(--ink-3);
	}

	.status {
		display: flex;
		align-items: center;
		gap: 18px;
		font-size: clamp(15px, 2vmin, 22px);
		font-weight: 650;
	}

	.live {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		padding: 6px 14px;
		border-radius: 999px;
		background: rgb(52 211 153 / 0.12);
		color: #34d399;
	}

	.live.offline {
		background: rgb(251 191 36 / 0.12);
		color: #fbbf24;
	}

	.clock {
		color: var(--ink-2);
		font-variant-numeric: tabular-nums;
	}

	main {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: center;
		gap: clamp(24px, 6vmin, 96px);
		min-height: 0;
	}

	.scan {
		display: grid;
		justify-items: center;
		gap: clamp(16px, 3vmin, 32px);
	}

	.qr-card {
		position: relative;
		width: min(62vh, 42vw);
		padding: clamp(14px, 2.2vmin, 28px);
		border-radius: clamp(24px, 4vmin, 44px);
		background: #fff;
		box-shadow:
			0 0 0 1px rgb(255 255 255 / 0.3),
			0 40px 120px -30px rgb(122 92 255 / 0.75),
			0 0 80px -20px rgb(34 211 238 / 0.45);
		overflow: hidden;
	}

	.qr-card.closed .qr-swap {
		opacity: 0.08;
	}

	.closed-overlay {
		position: absolute;
		inset: 0;
		display: grid;
		place-content: center;
		justify-items: center;
		gap: 12px;
		color: #0b0b1a;
		font-size: clamp(18px, 3vmin, 32px);
		font-weight: 750;
	}

	.countdown {
		position: absolute;
		left: 0;
		bottom: 0;
		height: 6px;
		width: 100%;
		background: linear-gradient(90deg, #7a5cff, #4f7bff, #22d3ee);
		transform-origin: left;
		animation: deplete linear forwards;
	}

	@keyframes deplete {
		from {
			transform: scaleX(1);
		}
		to {
			transform: scaleX(0);
		}
	}

	.scan-text {
		text-align: center;
		display: grid;
		gap: 8px;
	}

	h1 {
		font-size: clamp(28px, 5.2vmin, 64px);
		font-weight: 800;
		letter-spacing: -0.035em;
	}

	.scan-text p {
		font-size: clamp(15px, 2.2vmin, 24px);
		color: var(--ink-2);
		max-width: 34ch;
	}

	.link {
		display: block;
		margin-top: 6px;
		font-weight: 700;
		color: var(--ink);
	}

	.stats {
		display: grid;
		gap: clamp(20px, 4vmin, 48px);
		align-content: center;
		/* When space runs out, overflow at the bottom (the fading list), never over the counter. */
		align-content: safe center;
		min-width: 0;
		min-height: 0;
		max-height: 100%;
		overflow: hidden;
	}

	/* Small windows show fewer arrivals; the last visible one fades instead of being cut. */
	.arrivals ul {
		mask-image: linear-gradient(to bottom, #000 calc(100% - 48px), transparent);
	}

	.count {
		font-size: clamp(80px, 22vmin, 260px);
		font-weight: 800;
		letter-spacing: -0.06em;
		line-height: 0.85;
		background: linear-gradient(180deg, #fff 30%, #b9b2ff);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
	}

	.count-label {
		font-size: clamp(20px, 3.4vmin, 40px);
		font-weight: 650;
		color: var(--ink-2);
		margin-top: 0.3em;
	}

	.arrivals-title {
		font-size: clamp(13px, 1.7vmin, 18px);
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ink-3);
		margin-bottom: 14px;
	}

	.arrivals ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: clamp(8px, 1.2vmin, 14px);
	}

	.arrivals li {
		display: flex;
		align-items: center;
		gap: clamp(12px, 1.8vmin, 20px);
		padding: clamp(10px, 1.4vmin, 16px) clamp(12px, 1.8vmin, 20px);
		border-radius: clamp(14px, 2vmin, 22px);
		background: rgb(255 255 255 / 0.06);
		border: 1px solid rgb(255 255 255 / 0.08);
		backdrop-filter: blur(12px);
	}

	.arrivals li:first-child {
		background: rgb(122 92 255 / 0.18);
		border-color: rgb(160 140 255 / 0.35);
	}

	.avatar {
		flex: none;
		display: grid;
		place-items: center;
		width: clamp(36px, 5vmin, 56px);
		height: clamp(36px, 5vmin, 56px);
		border-radius: 50%;
		background: linear-gradient(135deg, #7a5cff, #2f6fe4);
		font-size: clamp(13px, 1.8vmin, 20px);
		font-weight: 750;
	}

	.who {
		display: grid;
		min-width: 0;
		flex: 1;
	}

	.name {
		font-size: clamp(16px, 2.4vmin, 28px);
		font-weight: 700;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.company {
		font-size: clamp(13px, 1.7vmin, 19px);
		color: var(--ink-3);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.ago {
		font-size: clamp(13px, 1.7vmin, 18px);
		color: var(--ink-3);
		white-space: nowrap;
	}

	.empty {
		font-size: clamp(18px, 2.6vmin, 30px);
		color: var(--ink-2);
	}

	.welcome {
		position: absolute;
		z-index: 5;
		left: 50%;
		bottom: clamp(24px, 6vmin, 72px);
		translate: -50% 0;
		display: flex;
		align-items: center;
		gap: 0.5em;
		padding: 0.55em 1.1em;
		border-radius: 999px;
		font-size: clamp(22px, 4.4vmin, 56px);
		font-weight: 650;
		white-space: nowrap;
		background: linear-gradient(120deg, #6b4dff, #2f6fe4);
		box-shadow: 0 30px 80px -20px rgb(107 77 255 / 0.9);
	}

	.welcome strong {
		font-weight: 850;
	}

	.wave {
		display: inline-block;
		animation: wave 1.2s ease-in-out 2;
		transform-origin: 70% 70%;
	}

	@keyframes wave {
		0%,
		100% {
			transform: rotate(0);
		}
		25% {
			transform: rotate(18deg);
		}
		50% {
			transform: rotate(-10deg);
		}
		75% {
			transform: rotate(14deg);
		}
	}

	.warning {
		position: absolute;
		z-index: 6;
		top: 16px;
		left: 50%;
		translate: -50% 0;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 16px;
		border-radius: 12px;
		background: #33270b;
		color: #fbbf24;
		font-weight: 600;
	}

	.chrome {
		position: absolute;
		z-index: 6;
		left: 16px;
		bottom: 16px;
		display: flex;
		gap: 8px;
		opacity: 0;
		transition: opacity 0.3s ease;
		pointer-events: none;
	}

	.chrome.visible {
		opacity: 1;
		pointer-events: auto;
	}

	.chrome .btn {
		background: rgb(255 255 255 / 0.1);
		color: var(--ink);
		border: 1px solid rgb(255 255 255 / 0.14);
		backdrop-filter: blur(10px);
	}

	@media (max-aspect-ratio: 1/1) {
		main {
			grid-template-columns: 1fr;
			align-content: center;
		}

		.qr-card {
			width: min(70vw, 44vh);
		}

		.stats {
			justify-items: center;
			text-align: center;
		}

		.arrivals {
			width: min(100%, 640px);
			text-align: left;
		}

		.count {
			font-size: clamp(64px, 14vh, 180px);
		}
	}
</style>
