<script lang="ts">
	import { enhance } from '$app/forms';
	import { replaceState } from '$app/navigation';
	import { onMount, tick } from 'svelte';
	import type { SubmitFunction } from '@sveltejs/kit';
	import ConsentBoxes from '$lib/components/ConsentBoxes.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import { firstName, initials } from '$lib/names';
	import { formatDate, formatDateTime, formatTime } from '$lib/time';
	import ContactRound from '@lucide/svelte/icons/contact-round';
	import ScanLine from '@lucide/svelte/icons/scan-line';
	import Lock from '@lucide/svelte/icons/lock';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import Calendar from '@lucide/svelte/icons/calendar';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	type Values = { name: string; email: string; phone: string; company: string; jobTitle: string };
	type Done = {
		status: 'created' | 'existing';
		name: string;
		company: string;
		number: number;
		checkedInAt: number;
	};

	const me = $derived(data.state === 'form' ? data.me : null);
	const failure = $derived(form && 'reason' in form ? form.reason : null);
	const errors = $derived<Record<string, string | undefined>>(
		form && 'errors' in form ? (form.errors ?? {}) : {}
	);
	const done = $derived<Done | null>(
		form && 'done' in form && form.done ? form.done : data.state === 'done' ? data.done : null
	);
	const view = $derived(
		done ? 'done' : failure === 'expired' ? 'expired' : failure === 'closed' ? 'closed' : data.state
	);

	function startingValues(): Values {
		const typed = form && 'values' in form ? form.values : null;
		const known = data.state === 'form' ? data.me : null;
		return {
			name: typed?.name ?? known?.name ?? '',
			email: typed?.email ?? known?.email ?? '',
			phone: typed?.phone ?? known?.phone ?? '',
			company: typed?.company ?? known?.company ?? '',
			jobTitle: typed?.jobTitle ?? known?.jobTitle ?? ''
		};
	}

	let values = $state(startingValues());
	// svelte-ignore state_referenced_locally
	let editing = $state(data.state !== 'form' || !data.me);
	// svelte-ignore state_referenced_locally
	let method = $state<'form' | 'picker' | 'returning'>(
		data.state === 'form' && data.me ? 'returning' : 'form'
	);
	let submitting = $state(false);
	let pickerSupported = $state(false);
	let formEl = $state<HTMLFormElement>();
	let now = $state(Date.now());

	onMount(() => {
		pickerSupported = 'contacts' in navigator && 'ContactsManager' in window;
		// Keep the token out of anything the attendee copies or shares. The router only accepts
		// replaceState once hydration has finished, hence the deferral.
		const strip = setTimeout(() => {
			try {
				if (location.search.includes('t=')) replaceState(location.pathname, {});
			} catch {
				// Cosmetic only; the pass cookie keeps the page working either way.
			}
		});
		const ticker = setInterval(() => (now = Date.now()), 1000);
		return () => {
			clearTimeout(strip);
			clearInterval(ticker);
		};
	});

	interface PickedContact {
		name?: string[];
		email?: string[];
		tel?: string[];
	}

	async function useContactCard() {
		try {
			const contacts = (
				navigator as Navigator & {
					contacts: {
						select(props: string[], opts: { multiple: boolean }): Promise<PickedContact[]>;
					};
				}
			).contacts;
			const [picked] = await contacts.select(['name', 'email', 'tel'], { multiple: false });
			if (!picked) return;
			if (picked.name?.[0]) values.name = picked.name[0];
			if (picked.email?.[0]) values.email = picked.email[0];
			if (picked.tel?.[0]) values.phone = picked.tel[0];
			method = 'picker';
			await tick();
			const firstEmpty = formEl?.querySelector<HTMLInputElement>('.fields input:placeholder-shown');
			firstEmpty?.focus();
		} catch {
			// Cancelled, or the browser refused; the form still works as normal.
		}
	}

	async function celebrate() {
		const { default: confetti } = await import('canvas-confetti');
		const colors = ['#7a5cff', '#4f7bff', '#22d3ee', '#f472b6', '#fbbf24'];
		const base = {
			particleCount: 70,
			spread: 70,
			startVelocity: 45,
			colors,
			disableForReducedMotion: true
		};
		confetti({ ...base, origin: { x: 0.1, y: 0.65 }, angle: 60 });
		confetti({ ...base, origin: { x: 0.9, y: 0.65 }, angle: 120 });
	}

	const submit: SubmitFunction = ({ action }) => {
		const forgetting = action.search.includes('forget');
		if (!forgetting) submitting = true;
		return async ({ result, update }) => {
			await update({ reset: false });
			submitting = false;
			if (forgetting) {
				values = { name: '', email: '', phone: '', company: '', jobTitle: '' };
				editing = true;
				method = 'form';
				return;
			}
			if (result.type === 'success') {
				window.scrollTo({ top: 0, behavior: 'smooth' });
				celebrate();
			} else if (result.type === 'failure') {
				await tick();
				formEl?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
			}
		};
	};

	const clock = $derived(formatTime(now, data.event.timezone, true));
</script>

<svelte:head>
	<title>Check in · {data.event.name}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="glow" aria-hidden="true"></div>

<main>
	<header class="rise">
		<Logo size={28} />
		<h1>{data.event.name}</h1>
		<p class="meta">
			{#if data.event.startsAt}
				<span><Calendar size={15} />{formatDateTime(data.event.startsAt, data.event.timezone)}</span
				>
			{/if}
			{#if data.event.venue}
				<span><MapPin size={15} />{data.event.venue}</span>
			{/if}
		</p>
	</header>

	{#if view === 'done' && done}
		<section class="done" aria-live="polite">
			<div class="tick" aria-hidden="true">
				<svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24" /><path d="M15 27l7 7 15-16" /></svg
				>
			</div>
			<h2>
				{#if done.status === 'existing'}
					You’re already checked in
				{:else}
					You’re in, {firstName(done.name)}!
				{/if}
			</h2>
			<p class="muted">
				{#if done.status === 'existing'}
					We had you down at {formatTime(done.checkedInAt, data.event.timezone)}, so there’s nothing
					more to do. Enjoy the event.
				{:else}
					Welcome to {data.event.name}. You can close this page, or show it at the door if asked.
				{/if}
			</p>

			<div class="pass">
				<div class="pass-inner">
					<div class="pass-top">
						<span class="pill pill-good"><span class="dot"></span> Checked in</span>
						<span class="number">#{String(done.number).padStart(3, '0')}</span>
					</div>
					<p class="pass-name">{done.name}</p>
					{#if done.company}<p class="muted">{done.company}</p>{/if}
					<hr />
					<p class="pass-event">{data.event.name}</p>
					<p class="muted small">
						{formatTime(done.checkedInAt, data.event.timezone)} · {formatDate(
							done.checkedInAt,
							data.event.timezone
						)}
					</p>
					<p class="live"><span class="dot dot-live"></span> Live pass · {clock}</p>
				</div>
			</div>

			<form method="POST" action="?/forget" use:enhance={submit}>
				<button class="btn btn-ghost btn-sm">Check in someone else on this phone</button>
			</form>
		</section>
	{:else if view === 'expired'}
		<section class="notice card rise">
			<div class="notice-icon"><ScanLine size={28} /></div>
			<h2>Scan the code at the entrance</h2>
			<p class="muted">
				This check-in link has expired. The QR code on the entrance screen changes every few seconds
				so it can only be used on site. Scan it again with your camera and you’ll be in straight
				away.
			</p>
		</section>
	{:else if view === 'closed'}
		<section class="notice card rise">
			<div class="notice-icon"><Lock size={26} /></div>
			<h2>Check-in isn’t open right now</h2>
			<p class="muted">
				Please find someone from the team at the entrance and they’ll sign you in.
			</p>
		</section>
	{:else}
		<form
			class="card checkin rise"
			style="animation-delay: 60ms"
			method="POST"
			action="?/checkin"
			autocomplete="on"
			novalidate
			bind:this={formEl}
			use:enhance={submit}
			oninput={(e) => {
				if (method === 'returning' && (e.target as HTMLElement).closest('.fields')) method = 'form';
			}}
		>
			{#if data.state === 'form' && data.pass}<input
					type="hidden"
					name="pass"
					value={data.pass}
				/>{/if}
			<input type="hidden" name="method" value={method} />

			{#if me && !editing}
				<div class="me">
					<div class="avatar" aria-hidden="true">{initials(values.name)}</div>
					<div class="me-text">
						<p class="eyebrow">Welcome back</p>
						<p class="me-name">{values.name}</p>
						<p class="muted small">
							{values.email}{values.company ? ` · ${values.company}` : ''}
						</p>
					</div>
					<button type="button" class="btn btn-ghost btn-sm" onclick={() => (editing = true)}>
						Edit
					</button>
				</div>
			{:else}
				<div class="intro">
					<h2>Check in</h2>
					<p class="muted">Takes about five seconds.</p>
				</div>

				{#if pickerSupported}
					<button type="button" class="btn btn-soft btn-lg btn-block" onclick={useContactCard}>
						<ContactRound size={20} /> Use my contact card
					</button>
					<p class="or"><span>or type it in</span></p>
				{:else if data.platform === 'ios'}
					<div class="tip">
						<Sparkles size={18} />
						<p>
							Tap <strong>Full name</strong>, then pick <strong>your contact card</strong> above the keyboard.
							Your iPhone fills in the rest.
						</p>
					</div>
				{:else if data.platform === 'android'}
					<div class="tip">
						<Sparkles size={18} />
						<p>
							Tap <strong>Full name</strong> and choose your saved details to fill everything at once.
						</p>
					</div>
				{/if}
			{/if}

			<div class="fields" hidden={!!me && !editing}>
				<div class="field">
					<label class="label" for="name">Full name</label>
					<input
						class="input"
						id="name"
						name="name"
						autocomplete="name"
						autocapitalize="words"
						enterkeyhint="next"
						placeholder=" "
						bind:value={values.name}
						aria-invalid={errors.name ? 'true' : undefined}
						aria-describedby={errors.name ? 'name-error' : undefined}
					/>
					{#if errors.name}<p class="error-text" id="name-error">{errors.name}</p>{/if}
				</div>
				<div class="field">
					<label class="label" for="email">Email</label>
					<input
						class="input"
						id="email"
						name="email"
						type="email"
						inputmode="email"
						autocomplete="email"
						autocapitalize="off"
						spellcheck="false"
						enterkeyhint="next"
						placeholder=" "
						bind:value={values.email}
						aria-invalid={errors.email ? 'true' : undefined}
						aria-describedby={errors.email ? 'email-error' : undefined}
					/>
					{#if errors.email}<p class="error-text" id="email-error">{errors.email}</p>{/if}
				</div>
				<div class="field">
					<label class="label" for="tel">Mobile <span class="optional">(optional)</span></label>
					<input
						class="input"
						id="tel"
						name="tel"
						type="tel"
						inputmode="tel"
						autocomplete="tel"
						enterkeyhint="next"
						placeholder=" "
						bind:value={values.phone}
					/>
				</div>
				<div class="row">
					<div class="field">
						<label class="label" for="organization"
							>Company <span class="optional">(optional)</span></label
						>
						<input
							class="input"
							id="organization"
							name="organization"
							autocomplete="organization"
							enterkeyhint="next"
							placeholder=" "
							bind:value={values.company}
						/>
					</div>
					<div class="field">
						<label class="label" for="jobTitle"
							>Job title <span class="optional">(optional)</span></label
						>
						<input
							class="input"
							id="jobTitle"
							name="jobTitle"
							autocomplete="organization-title"
							enterkeyhint="done"
							placeholder=" "
							bind:value={values.jobTitle}
						/>
					</div>
				</div>
			</div>

			<div class="consent">
				<ConsentBoxes
					language="en"
					org={data.org.name}
					coHosts={data.event.coHosts}
					privacyUrl={data.org.privacyUrl}
					error={errors.consent}
				/>
				<label class="check">
					<input type="checkbox" name="remember" checked />
					<span>Remember me on this phone for one-tap check-in next time</span>
				</label>
			</div>

			{#if failure === 'busy'}
				<p class="banner banner-warn" role="alert">
					Lots of people are checking in on this network right now. Please try again in a moment.
				</p>
			{/if}

			<button class="btn btn-primary btn-lg btn-block submit" disabled={submitting}>
				{#if submitting}
					<span class="spinner" aria-hidden="true"></span> Checking you in…
				{:else}
					{me && !editing ? `Check in as ${firstName(values.name)}` : 'Check in'}
					<ArrowRight size={20} />
				{/if}
			</button>

			{#if me && !editing}
				<button type="submit" formaction="?/forget" class="btn btn-ghost btn-sm not-me">
					Not {firstName(values.name)}? Use different details
				</button>
			{/if}
		</form>
	{/if}

	<footer class="muted">Your details go only to {data.org.name}. Never shared or sold.</footer>
</main>

<style>
	.glow {
		position: fixed;
		inset: -30vh -20vw auto;
		height: 70vh;
		z-index: -1;
		background:
			radial-gradient(
				50% 55% at 25% 35%,
				color-mix(in oklab, var(--aurora-1) 30%, transparent),
				transparent 70%
			),
			radial-gradient(
				40% 50% at 80% 25%,
				color-mix(in oklab, var(--aurora-2) 22%, transparent),
				transparent 70%
			);
		filter: blur(10px);
	}

	main {
		max-width: 480px;
		margin: 0 auto;
		padding: max(20px, env(safe-area-inset-top)) 16px max(28px, env(safe-area-inset-bottom));
		display: grid;
		/* minmax(0, …) so long unbroken text (emails) can't push the page wider than the phone. */
		grid-template-columns: minmax(0, 1fr);
		gap: 20px;
	}

	header {
		display: grid;
		gap: 10px;
		padding: 8px 4px 0;
	}

	header :global(.logo) {
		margin-bottom: 10px;
	}

	h1 {
		font-size: clamp(28px, 8vw, 36px);
		font-weight: 800;
		letter-spacing: -0.035em;
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 16px;
		color: var(--text-2);
		font-size: 15px;
		font-weight: 550;
	}

	.meta span {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}

	.checkin {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 18px;
		padding: 22px 18px;
	}

	.intro h2 {
		font-size: 21px;
	}

	.intro p {
		font-size: 15px;
		margin-top: 2px;
	}

	.or {
		display: flex;
		align-items: center;
		gap: 12px;
		font-size: 13px;
		font-weight: 600;
		color: var(--muted);
		margin: -4px 0;
	}

	.or::before,
	.or::after {
		content: '';
		flex: 1;
		height: 1px;
		background: var(--border);
	}

	.tip {
		display: flex;
		gap: 10px;
		align-items: flex-start;
		padding: 12px 14px;
		border-radius: var(--radius);
		background: var(--brand-soft);
		color: var(--brand-text);
		font-size: 14.5px;
		line-height: 1.45;
	}

	.tip :global(svg) {
		flex: none;
		margin-top: 2px;
	}

	.tip p {
		color: var(--text-2);
	}

	.tip strong {
		color: var(--text);
	}

	.fields {
		display: grid;
		gap: 14px;
	}

	.fields[hidden] {
		display: none;
	}

	.row {
		display: grid;
		gap: 14px;
		grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
	}

	.consent {
		display: grid;
		gap: 14px;
		padding-top: 4px;
	}

	.submit {
		margin-top: 2px;
	}

	.not-me {
		justify-self: center;
		margin-top: -6px;
	}

	.me {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 14px;
		border-radius: var(--radius);
		background: var(--surface-2);
	}

	.avatar {
		flex: none;
		display: grid;
		place-items: center;
		width: 52px;
		height: 52px;
		border-radius: 50%;
		background: var(--grad);
		color: #fff;
		font-weight: 750;
		font-size: 18px;
		letter-spacing: 0.02em;
	}

	.me-text {
		min-width: 0;
		flex: 1;
	}

	.me-text .small {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.eyebrow {
		font-size: 12.5px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--brand-text);
	}

	.me-name {
		font-size: 18px;
		font-weight: 750;
		line-height: 1.25;
		overflow-wrap: anywhere;
	}

	.small {
		font-size: 14px;
	}

	.notice {
		display: grid;
		justify-items: center;
		text-align: center;
		gap: 12px;
		padding: 32px 22px;
	}

	.notice h2 {
		font-size: 22px;
	}

	.notice-icon {
		display: grid;
		place-items: center;
		width: 64px;
		height: 64px;
		border-radius: 20px;
		background: var(--brand-soft);
		color: var(--brand-text);
		margin-bottom: 4px;
	}

	/* ── Success ── */

	.done {
		display: grid;
		justify-items: center;
		text-align: center;
		gap: 12px;
		padding-top: 8px;
	}

	.done h2 {
		font-size: 28px;
		font-weight: 800;
		animation: rise 0.5s 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) both;
	}

	.done > p {
		max-width: 380px;
		animation: rise 0.5s 0.45s cubic-bezier(0.2, 0.8, 0.2, 1) both;
	}

	.tick {
		width: 92px;
		height: 92px;
		border-radius: 50%;
		background: var(--grad);
		display: grid;
		place-items: center;
		box-shadow:
			var(--glow),
			0 0 0 10px color-mix(in oklab, var(--brand) 12%, transparent);
		animation: pop 0.55s cubic-bezier(0.2, 1.4, 0.4, 1) both;
	}

	.tick svg {
		width: 56px;
		height: 56px;
		fill: none;
		stroke: #fff;
		stroke-width: 4;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.tick circle {
		stroke: rgb(255 255 255 / 0.35);
		stroke-width: 2;
	}

	.tick path {
		stroke-dasharray: 40;
		stroke-dashoffset: 40;
		animation: draw 0.45s 0.3s ease-out forwards;
	}

	.pass {
		width: 100%;
		margin-top: 10px;
		padding: 2px;
		border-radius: var(--radius-xl);
		background: conic-gradient(
			from var(--angle, 0deg),
			var(--aurora-1),
			var(--aurora-2),
			var(--aurora-3),
			var(--aurora-1)
		);
		animation:
			rise 0.6s 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) both,
			spin-border 6s linear infinite;
		box-shadow: var(--shadow-lg);
	}

	.pass-inner {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		overflow-wrap: anywhere;
		gap: 4px;
		text-align: left;
		padding: 20px;
		border-radius: calc(var(--radius-xl) - 2px);
		background: var(--surface);
	}

	.pass-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 10px;
	}

	.number {
		font-size: 30px;
		font-weight: 800;
		letter-spacing: -0.03em;
		color: var(--brand-text);
	}

	.pass-name {
		font-size: 22px;
		font-weight: 800;
		letter-spacing: -0.02em;
	}

	.pass hr {
		width: 100%;
		border: 0;
		border-top: 1.5px dashed var(--border-strong);
		margin: 12px 0 10px;
	}

	.pass-event {
		font-weight: 700;
	}

	.live {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 12px;
		font-size: 13.5px;
		font-weight: 650;
		color: var(--good);
		font-variant-numeric: tabular-nums;
	}

	footer {
		text-align: center;
		font-size: 13px;
		padding: 4px 0 8px;
	}

	@property --angle {
		syntax: '<angle>';
		initial-value: 0deg;
		inherits: false;
	}

	@keyframes spin-border {
		to {
			--angle: 360deg;
		}
	}

	@keyframes pop {
		from {
			transform: scale(0.4);
			opacity: 0;
		}
		to {
			transform: none;
			opacity: 1;
		}
	}

	@keyframes draw {
		to {
			stroke-dashoffset: 0;
		}
	}
</style>
