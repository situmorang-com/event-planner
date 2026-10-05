<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { LANG_COOKIE, THEME_COOKIE, type Lang, type Theme } from '$lib/i18n';
	import { lang, t } from '$lib/i18n/t.svelte';
	import Monitor from '@lucide/svelte/icons/monitor';
	import Moon from '@lucide/svelte/icons/moon';
	import Sun from '@lucide/svelte/icons/sun';

	// Per browser, a year: the theme and the language are this person's, not the team's.
	const remember = (name: string, value: string) => {
		document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
	};

	// The page data says what the server rendered; a change shows at once and sticks.
	let picked = $state<Theme | null>(null);
	const theme = $derived<Theme>(picked ?? (page.data?.theme as Theme) ?? 'system');
	const NEXT: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };
	const NAME: Record<Theme, string> = {
		system: 'Theme: same as this device',
		light: 'Theme: light',
		dark: 'Theme: dark'
	};

	function cycleTheme() {
		const next = NEXT[theme];
		picked = next;
		document.documentElement.dataset.theme = next;
		remember(THEME_COOKIE, next);
	}

	async function setLang(next: Lang) {
		if (next === lang()) return;
		remember(LANG_COOKIE, next);
		document.documentElement.lang = next;
		// Some text comes from the server (dates, refusals): load the page again in the new language.
		await invalidateAll();
	}
</script>

<div class="toggles">
	<button
		type="button"
		class="btn btn-ghost btn-icon btn-sm"
		title="{t(NAME[theme])} · {t('click to change')}"
		onclick={cycleTheme}
	>
		{#if theme === 'light'}<Sun size={17} />{:else if theme === 'dark'}<Moon
				size={17}
			/>{:else}<Monitor size={17} />{/if}
		<span class="sr-only">{t(NAME[theme])}</span>
	</button>
	<div class="lang" role="group" aria-label={t('Language')}>
		{#each ['en', 'id'] as const as l (l)}
			<button
				type="button"
				aria-pressed={lang() === l}
				title={l === 'en' ? 'English' : 'Bahasa Indonesia'}
				onclick={() => setLang(l)}>{l.toUpperCase()}</button
			>
		{/each}
	</div>
</div>

<style>
	.toggles {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.lang {
		display: inline-flex;
		padding: 2px;
		border-radius: 999px;
		border: 1px solid var(--border-strong);
		background: var(--surface);
	}

	.lang button {
		min-width: 34px;
		height: 26px;
		padding: 0 8px;
		border: 0;
		border-radius: 999px;
		background: transparent;
		color: var(--muted);
		font: inherit;
		font-size: 12px;
		font-weight: 750;
		letter-spacing: 0.03em;
		cursor: pointer;
	}

	.lang button[aria-pressed='true'] {
		background: var(--brand-soft);
		color: var(--brand-text);
	}
</style>
