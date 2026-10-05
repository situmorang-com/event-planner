<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from '$lib/i18n/t.svelte';
	import Monitor from '@lucide/svelte/icons/monitor';
	import Printer from '@lucide/svelte/icons/printer';

	interface Props {
		values: {
			name: string;
			venue: string;
			startsAt: string;
			timezone: string;
			qrMode: string;
			targetCount: string;
			phoneCountry: string;
			endsAt: string;
			language: string;
			coHosts: string;
		};
		errors?: Record<string, string | undefined>;
	}

	let { values, errors = {} }: Props = $props();

	// Starting values only; after that the inputs own their state.
	// svelte-ignore state_referenced_locally
	let timezone = $state(values.timezone);
	// svelte-ignore state_referenced_locally
	let qrMode = $state(values.qrMode || 'rotating');

	onMount(() => {
		if (!timezone) timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	});
</script>

<div class="fields">
	<div class="field">
		<label class="label" for="name">{t('Event name')}</label>
		<input
			class="input"
			id="name"
			name="name"
			value={values.name}
			placeholder="Partner Summit 2026"
			required
			aria-invalid={errors.name ? 'true' : undefined}
		/>
		{#if errors.name}<p class="error-text">{t(errors.name)}</p>{/if}
	</div>

	<div class="row">
		<div class="field">
			<label class="label" for="startsAt"
				>{t('Starts')} <span class="optional">{t('(optional)')}</span></label
			>
			<input
				class="input"
				id="startsAt"
				name="startsAt"
				type="datetime-local"
				value={values.startsAt}
				aria-invalid={errors.startsAt ? 'true' : undefined}
			/>
			{#if errors.startsAt}<p class="error-text">{t(errors.startsAt)}</p>{:else if timezone}<p
					class="hint"
				>
					{t('Time zone: {zone}', { zone: timezone.replace(/_/g, ' ') })}
				</p>{/if}
		</div>
		<div class="field">
			<label class="label" for="endsAt"
				>{t('Ends')} <span class="optional">{t('(optional)')}</span></label
			>
			<input
				class="input"
				id="endsAt"
				name="endsAt"
				type="datetime-local"
				value={values.endsAt}
				aria-invalid={errors.endsAt ? 'true' : undefined}
			/>
			{#if errors.endsAt}<p class="error-text">{t(errors.endsAt)}</p>{:else}<p class="hint">
					{t('Registration links stop working then. Blank means six hours after the start.')}
				</p>{/if}
		</div>
	</div>
	<input type="hidden" name="timezone" value={timezone} />

	<div class="field">
		<label class="label" for="venue"
			>{t('Venue')} <span class="optional">{t('(optional)')}</span></label
		>
		<input
			class="input"
			id="venue"
			name="venue"
			value={values.venue}
			placeholder={t('Grand Ballroom, Jakarta')}
		/>
	</div>

	<div class="row">
		<div class="field">
			<label class="label" for="targetCount"
				>{t('Target')} <span class="optional">{t('(optional)')}</span></label
			>
			<input
				class="input"
				id="targetCount"
				name="targetCount"
				type="number"
				min="0"
				step="1"
				inputmode="numeric"
				value={values.targetCount}
				placeholder="40"
				aria-invalid={errors.targetCount ? 'true' : undefined}
			/>
			{#if errors.targetCount}<p class="error-text">{t(errors.targetCount)}</p>{:else}<p
					class="hint"
				>
					{t('How many Yes replies you’re aiming for. The People tab counts up to it.')}
				</p>{/if}
		</div>
		<div class="field">
			<label class="label" for="phoneCountry">{t('Phone country')}</label>
			<select class="input" id="phoneCountry" name="phoneCountry" value={values.phoneCountry}>
				<option value="ID">Indonesia (+62)</option>
				<option value="MY">Malaysia (+60)</option>
			</select>
			<p class="hint">
				{t(
					'Reads local numbers like 0812… and picks the language of messages. A company can choose its own on the People tab.'
				)}
			</p>
		</div>
	</div>

	<div class="row">
		<div class="field">
			<label class="label" for="language">{t('Message language')}</label>
			<select class="input" id="language" name="language" value={values.language}>
				<option value="">{t('From the phone country')}</option>
				<option value="id">{t('Indonesian')}</option>
				<option value="en">{t('English')}</option>
				<option value="ms">{t('Malay')}</option>
			</select>
			<p class="hint">
				{t('Invitations, reminders and the registration page for everyone on the list.')}
			</p>
		</div>
		<div class="field">
			<label class="label" for="coHosts"
				>{t('Co-hosts')} <span class="optional">{t('(optional)')}</span></label
			>
			<input
				class="input"
				id="coHosts"
				name="coHosts"
				value={values.coHosts}
				placeholder="Microsoft Indonesia"
			/>
			<p class="hint">
				{t(
					'Names the partner in the “share my name, company and title with…” consent box. Leave blank and the box isn’t shown.'
				)}
			</p>
		</div>
	</div>

	<fieldset>
		<legend class="label">{t('How will people scan?')}</legend>
		<div class="modes">
			<label class="mode" class:selected={qrMode === 'rotating'}>
				<input type="radio" name="qrMode" value="rotating" bind:group={qrMode} />
				<span class="mode-icon"><Monitor size={20} /></span>
				<span class="mode-title"
					>{t('Live screen')} <span class="pill pill-brand">{t('Recommended')}</span></span
				>
				<span class="mode-text">
					{t(
						'A screen or tablet at the entrance shows a QR code that changes every 20 seconds. Photos of it stop working, so only people in the room can check in.'
					)}
				</span>
			</label>
			<label class="mode" class:selected={qrMode === 'static'}>
				<input type="radio" name="qrMode" value="static" bind:group={qrMode} />
				<span class="mode-icon"><Printer size={20} /></span>
				<span class="mode-title">{t('Printed QR')}</span>
				<span class="mode-text">
					{t(
						'One fixed code for posters, table cards and badges. Anyone with the link can check in, so close check-in when the event ends.'
					)}
				</span>
			</label>
		</div>
	</fieldset>
</div>

<style>
	.fields {
		display: grid;
		gap: 18px;
	}

	.row {
		display: grid;
		gap: 18px;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
	}

	fieldset {
		border: 0;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 10px;
	}

	.modes {
		display: grid;
		gap: 12px;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
	}

	.mode {
		position: relative;
		display: grid;
		gap: 6px;
		align-content: start;
		padding: 16px;
		border-radius: var(--radius);
		border: 1.5px solid var(--border-strong);
		background: var(--surface);
		cursor: pointer;
		transition:
			border-color 0.15s ease,
			box-shadow 0.15s ease;
	}

	.mode:hover {
		border-color: color-mix(in oklab, var(--brand) 45%, var(--border-strong));
	}

	.mode.selected {
		border-color: var(--brand);
		box-shadow: var(--ring);
	}

	.mode input {
		position: absolute;
		top: 16px;
		right: 16px;
		width: 20px;
		height: 20px;
		margin: 0;
		accent-color: var(--brand);
	}

	.mode-icon {
		display: grid;
		place-items: center;
		width: 38px;
		height: 38px;
		border-radius: 12px;
		background: var(--brand-soft);
		color: var(--brand-text);
		margin-bottom: 4px;
	}

	.mode-title {
		display: flex;
		align-items: center;
		gap: 8px;
		font-weight: 750;
	}

	.mode-title .pill {
		font-size: 11.5px;
		padding: 2px 8px;
	}

	.mode-text {
		font-size: 14px;
		color: var(--text-2);
		line-height: 1.45;
	}
</style>
