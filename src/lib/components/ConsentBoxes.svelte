<script lang="ts">
	// The three consent boxes (§8, D15), shared by the check-in page and the registration pages.
	// Box 1 is required and names the event; box 2 sticks to the person; box 3 only exists when
	// the event has co-hosts to share with.
	import { CONSENT_TEXT, fill, type Language } from '$lib/consent';

	interface Props {
		language: Language;
		org: string;
		/** events.co_hosts; empty hides the third box. */
		coHosts: string;
		privacyUrl: string;
		/** The box-1 error after a failed submit. */
		error?: string;
	}

	let { language, org, coHosts, privacyUrl, error = '' }: Props = $props();

	const t = $derived(CONSENT_TEXT[language]);
</script>

<label class="check">
	<input
		type="checkbox"
		name="consent"
		aria-invalid={error ? 'true' : undefined}
		aria-describedby={error ? 'consent-error' : undefined}
	/>
	<span>
		{fill(t.event, { org })}
		{#if privacyUrl}<a href={privacyUrl} target="_blank" rel="noreferrer">{t.privacy}</a>{/if}
	</span>
</label>
{#if error}<p class="error-text" id="consent-error">{error}</p>{/if}
<label class="check">
	<input type="checkbox" name="consentFuture" />
	<span>{fill(t.future, { org })}</span>
</label>
{#if coHosts.trim()}
	<label class="check">
		<input type="checkbox" name="consentShare" />
		<span>{fill(t.share, { co_hosts: coHosts.trim() })}</span>
	</label>
{/if}
