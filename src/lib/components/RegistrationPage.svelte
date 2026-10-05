<script lang="ts">
	// The public registration pages (§4.6): the personal link, the generic link and the one-tap
	// reconfirm page share this one view, in the language the server picked for the row.
	import { applyAction, enhance } from '$app/forms';
	import { tick } from 'svelte';
	import type { SubmitFunction } from '@sveltejs/kit';
	import ConsentBoxes from '$lib/components/ConsentBoxes.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import { fill } from '$lib/consent';
	import { firstName } from '$lib/names';
	import type {
		RegistrationFormResult,
		RegistrationPageData,
		RegistrationValues
	} from '$lib/registration-page';
	import { REGISTRATION_TEXT } from '$lib/registration-text';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import Calendar from '@lucide/svelte/icons/calendar';
	import Check from '@lucide/svelte/icons/check';
	import CircleQuestionMark from '@lucide/svelte/icons/circle-question-mark';
	import Clock from '@lucide/svelte/icons/clock';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import X from '@lucide/svelte/icons/x';

	interface Props {
		data: RegistrationPageData;
		form: RegistrationFormResult;
	}

	let { data, form }: Props = $props();

	const t = $derived(REGISTRATION_TEXT[data.language]);
	const org = $derived(data.org.name);
	const done = $derived(form && 'done' in form ? form.done : null);
	const reason = $derived(form && 'reason' in form ? form.reason : null);
	const errors = $derived(form && 'errors' in form ? form.errors : {});
	const typed = $derived<RegistrationValues | null>(
		form && 'values' in form && form.values ? form.values : null
	);
	const values = $derived<RegistrationValues>(
		typed ?? {
			rsvp: '',
			name: data.prefill?.name ?? '',
			company: data.prefill?.company ?? '',
			jobTitle: '',
			email: '',
			phone: '',
			note: '',
			salutation: data.prefill?.salutation ?? ''
		}
	);

	const CHOICES = [
		{ rsvp: 'yes', icon: Check },
		{ rsvp: 'maybe', icon: CircleQuestionMark },
		{ rsvp: 'no', icon: X }
	] as const;

	let submitting = $state(false);
	let formEl = $state<HTMLFormElement>();

	const submit: SubmitFunction = ({ action }) => {
		submitting = true;
		// "Not me" and "Remove me" make this link stop answering, so re-running the page's load
		// would replace the confirmation with "Link not found": show the result as it is.
		const final = /\/(notMe|removeMe)$/.test(action.search);
		return async ({ result, update }) => {
			if (final) await applyAction(result);
			else await update({ reset: false });
			submitting = false;
			if (result.type === 'success') window.scrollTo({ top: 0, behavior: 'smooth' });
			else if (result.type === 'failure') {
				await tick();
				formEl?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
			}
		};
	};

	// Box 3 offers to share with the co-hosts, so the footer's promise names them too (§8).
	const coHosts = $derived(data.event.coHosts.trim());
	const footer = $derived(
		coHosts ? fill(t.footerShared, { org, co_hosts: coHosts }) : fill(t.footer, { org })
	);

	const doneText = $derived.by(() => {
		if (!done) return '';
		const name = firstName(done.name) || done.name;
		switch (done.kind) {
			case 'yes':
			case 'reconfirm':
				return fill(t.doneYes, { name, event: data.event.name });
			case 'maybe':
				return fill(t.doneMaybe, { name, event: data.event.name });
			case 'no':
				return fill(t.doneNo, { name, event: data.event.name });
			case 'notMe':
				return t.doneNotMe;
			case 'removeMe':
				return t.doneRemoveMe;
		}
	});
</script>

<svelte:head>
	<title>{fill(t.title, { event: data.event.name })}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="glow" aria-hidden="true"></div>

<main>
	<header class="rise">
		<Logo size={28} />
		<h1>{data.event.name}</h1>
		<p class="meta">
			{#if data.event.when}<span><Calendar size={15} />{data.event.when}</span>{/if}
			{#if data.event.venue}<span><MapPin size={15} />{data.event.venue}</span>{/if}
		</p>
	</header>

	{#if done}
		<section class="card done rise" aria-live="polite">
			<div class="tick" aria-hidden="true"><Check size={30} strokeWidth={3} /></div>
			<h2>{doneText}</h2>
			{#if done.contact && (done.kind === 'yes' || done.kind === 'maybe' || done.kind === 'no')}
				<p class="muted">{fill(t.reachYou, { contact: done.contact })}</p>
			{/if}
		</section>
	{:else if data.state === 'expired'}
		<section class="card notice rise">
			<div class="notice-icon"><Clock size={26} /></div>
			<h2>{t.expired}</h2>
			<p class="muted">{t.expiredBody}</p>
		</section>
	{:else if data.mode === 'reconfirm'}
		<section class="card reconfirm rise">
			<h2>{fill(t.reconfirmTitle, { event: data.event.name })}</h2>
			{#if data.prefill}<p class="muted">{data.prefill.name}</p>{/if}
			<form method="POST" action="?/reconfirm" use:enhance={submit}>
				<button class="btn btn-primary btn-lg btn-block" disabled={submitting}>
					{#if submitting}<span class="spinner" aria-hidden="true"></span>{:else}<Check
							size={20}
						/>{/if}
					{t.reconfirm}
				</button>
			</form>
			{#if data.token}
				<a class="btn btn-ghost btn-sm" href="/r/{data.token}">{t.changeReply}</a>
			{/if}
			{#if reason === 'busy'}<p class="banner banner-warn" role="alert">{t.errors.busy}</p>{/if}
		</section>
	{:else}
		<form
			class="card register rise"
			style="animation-delay: 60ms"
			method="POST"
			action="?/submit"
			novalidate
			bind:this={formEl}
			use:enhance={submit}
		>
			{#if data.mode === 'personal' && data.prefill}
				<div class="who">
					<p class="who-name">{data.prefill.name}</p>
					{#if data.prefill.company}<p class="muted">{data.prefill.company}</p>{/if}
					<p class="notice-line muted">
						{fill(t.notice, { org })}
						<button
							type="submit"
							class="link-btn"
							formaction="?/notMe"
							formnovalidate
							onclick={(e) => {
								if (!confirm(fill(t.notMeConfirm, { org }))) e.preventDefault();
							}}>{t.notMe}</button
						>
						·
						<button
							type="submit"
							class="link-btn"
							formaction="?/removeMe"
							formnovalidate
							onclick={(e) => {
								if (!confirm(fill(t.removeMeConfirm, { org }))) e.preventDefault();
							}}>{t.removeMe}</button
						>
					</p>
				</div>

				<fieldset class="rsvp" aria-describedby={errors.rsvp ? 'rsvp-error' : undefined}>
					<legend class="label">{t.rsvp}</legend>
					<div class="choices">
						{#each CHOICES as choice (choice.rsvp)}
							<label class="choice {choice.rsvp}">
								<input
									type="radio"
									name="rsvp"
									value={choice.rsvp}
									checked={values.rsvp === choice.rsvp}
								/>
								<choice.icon size={17} />
								<span>{t[choice.rsvp]}</span>
							</label>
						{/each}
					</div>
					{#if errors.rsvp}<p class="error-text" id="rsvp-error">{errors.rsvp}</p>{/if}
				</fieldset>
			{:else}
				<div class="intro">
					<h2>{fill(t.title, { event: data.event.name })}</h2>
				</div>
				<div class="field">
					<label class="label" for="name">{t.name}</label>
					<input
						class="input"
						id="name"
						name="name"
						autocomplete="name"
						autocapitalize="words"
						value={values.name}
						aria-invalid={errors.name ? 'true' : undefined}
						aria-describedby={errors.name ? 'name-error' : undefined}
					/>
					{#if errors.name}<p class="error-text" id="name-error">{errors.name}</p>{/if}
				</div>
				<div class="row">
					<div class="field">
						<label class="label" for="company">{t.company}</label>
						<input
							class="input"
							id="company"
							name="company"
							autocomplete="organization"
							value={values.company}
						/>
					</div>
					<div class="field">
						<label class="label" for="jobTitle"
							>{t.jobTitle} <span class="optional">{t.optional}</span></label
						>
						<input
							class="input"
							id="jobTitle"
							name="jobTitle"
							autocomplete="organization-title"
							value={values.jobTitle}
						/>
					</div>
				</div>
			{/if}

			<!-- How we greet them (D27): their own answer beats anything the team guessed. -->
			<fieldset class="field address">
				<legend class="label">{t.address} <span class="optional">{t.optional}</span></legend>
				<div class="address-choices">
					<label class="address-choice">
						<input
							type="radio"
							name="salutation"
							value="pak"
							checked={values.salutation === 'pak'}
						/>
						{t.addressPak}
					</label>
					<label class="address-choice">
						<input type="radio" name="salutation" value="bu" checked={values.salutation === 'bu'} />
						{t.addressBu}
					</label>
				</div>
			</fieldset>

			<div class="row">
				<div class="field">
					<label class="label" for="email">{t.email}</label>
					<input
						class="input"
						id="email"
						name="email"
						type="email"
						inputmode="email"
						autocomplete="email"
						autocapitalize="off"
						spellcheck="false"
						value={values.email}
						aria-invalid={errors.email || errors.contact ? 'true' : undefined}
						aria-describedby={errors.email || errors.contact ? 'contact-error' : undefined}
					/>
				</div>
				<div class="field">
					<label class="label" for="phone">{t.mobile}</label>
					<input
						class="input"
						id="phone"
						name="phone"
						type="tel"
						inputmode="tel"
						autocomplete="tel"
						value={values.phone}
						aria-invalid={errors.contact ? 'true' : undefined}
					/>
				</div>
			</div>
			{#if errors.email || errors.contact}
				<p class="error-text" id="contact-error">{errors.email ?? errors.contact}</p>
			{/if}

			<div class="field">
				<label class="label" for="note">{t.note} <span class="optional">{t.optional}</span></label>
				<input class="input" id="note" name="note" maxlength="300" value={values.note} />
			</div>

			<div class="consent">
				<ConsentBoxes
					language={data.language}
					{org}
					coHosts={data.event.coHosts}
					privacyUrl={data.org.privacyUrl}
					error={errors.consent}
				/>
			</div>

			{#if reason === 'busy' || reason === 'refused'}
				<p class="banner banner-warn" role="alert">
					{fill(t.errors[reason], { org })}
				</p>
			{/if}

			<button class="btn btn-primary btn-lg btn-block" disabled={submitting}>
				{#if submitting}
					<span class="spinner" aria-hidden="true"></span>
				{:else}
					{data.mode === 'generic' ? t.register : t.send}
					<ArrowRight size={20} />
				{/if}
			</button>
		</form>
	{/if}

	<footer class="muted">{footer}</footer>
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
		font-size: clamp(26px, 7vw, 34px);
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

	.register,
	.reconfirm {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 18px;
		padding: 22px 18px;
	}

	.intro h2,
	.reconfirm h2 {
		font-size: 21px;
	}

	.who {
		display: grid;
		gap: 2px;
		padding: 14px;
		border-radius: var(--radius);
		background: var(--surface-2);
	}

	.who-name {
		font-size: 18px;
		font-weight: 750;
		line-height: 1.25;
		overflow-wrap: anywhere;
	}

	.notice-line {
		margin-top: 8px;
		font-size: 13.5px;
		line-height: 1.5;
	}

	.link-btn {
		padding: 0;
		border: 0;
		background: none;
		color: var(--brand-text);
		font: inherit;
		font-weight: 650;
		text-decoration: underline;
		cursor: pointer;
	}

	.rsvp {
		display: grid;
		gap: 8px;
		border: 0;
		padding: 0;
		margin: 0;
		min-width: 0;
	}

	.choices {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 6px;
		padding: 4px;
		border-radius: 14px;
		background: var(--surface-2);
	}

	.choice {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 4px;
		min-height: 60px;
		padding: 8px 6px;
		border-radius: 11px;
		color: var(--text-2);
		font-size: 13.5px;
		font-weight: 650;
		text-align: center;
		line-height: 1.2;
		cursor: pointer;
		transition:
			background-color 0.15s ease,
			color 0.15s ease,
			box-shadow 0.15s ease;
	}

	.choice input {
		position: absolute;
		inset: 0;
		opacity: 0;
		margin: 0;
		cursor: pointer;
	}

	.choice:has(input:focus-visible) {
		outline: 2px solid var(--brand);
		outline-offset: 2px;
	}

	.choice.yes:has(input:checked) {
		background: var(--good-soft);
		color: var(--good);
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--good) 35%, transparent);
	}

	.choice.maybe:has(input:checked) {
		background: var(--warn-soft);
		color: var(--warn);
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--warn) 35%, transparent);
	}

	.choice.no:has(input:checked) {
		background: var(--bad-soft);
		color: var(--bad);
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--bad) 35%, transparent);
	}

	.row {
		display: grid;
		gap: 14px;
		grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
	}

	.address {
		margin: 0;
		padding: 0;
		border: 0;
	}

	.address-choices {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.address-choice {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 44px;
		padding: 0 16px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border-strong);
		background: var(--surface);
		font-weight: 650;
		cursor: pointer;
	}

	.address-choice:has(input:checked) {
		border-color: var(--brand);
		background: var(--brand-soft);
		color: var(--brand-text);
	}

	.address-choice input {
		margin: 0;
		accent-color: var(--brand);
	}

	.consent {
		display: grid;
		gap: 14px;
		padding-top: 4px;
	}

	.reconfirm form {
		display: grid;
	}

	.reconfirm .btn-ghost {
		justify-self: center;
	}

	.notice,
	.done {
		display: grid;
		justify-items: center;
		text-align: center;
		gap: 12px;
		padding: 32px 22px;
	}

	.notice h2,
	.done h2 {
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

	.tick {
		display: grid;
		place-items: center;
		width: 72px;
		height: 72px;
		border-radius: 50%;
		background: var(--grad);
		color: #fff;
		box-shadow: var(--glow);
		margin-bottom: 4px;
	}

	footer {
		text-align: center;
		font-size: 13px;
		padding: 4px 0 8px;
	}
</style>
