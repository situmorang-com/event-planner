<script lang="ts">
	import { enhance } from '$app/forms';
	import { t } from '$lib/i18n/t.svelte';
	import UserPlus from '@lucide/svelte/icons/user-plus';

	interface Props {
		company: string;
	}

	let { company }: Props = $props();

	let value = $state('');
	let note = $state('');
	const label = $derived(company ? t('Add someone from {company}', { company }) : t('Add someone'));
</script>

<!-- One more name for this company: "Rina Wijaya, CFO, rina@…" works here too. -->
<form
	class="quick"
	method="POST"
	action="?/add"
	use:enhance={() =>
		async ({ result, update }) => {
			await update({ reset: false });
			if (result.type === 'success') {
				const { added, found, duplicates, refused } = result.data as {
					added: number;
					found: number;
					duplicates: string[];
					refused: { name: string; reason: string }[];
				};
				if (added || found) {
					note = found ? t('Parked under To review.') : '';
					value = '';
				} else if (refused[0]) {
					note = t('{name}: {reason}.', { name: refused[0].name, reason: t(refused[0].reason) });
				} else {
					note = duplicates[0]
						? t('{name} is already on the list.', { name: duplicates[0] })
						: t('They are already on the list.');
				}
			} else if (result.type === 'failure') {
				note = String(result.data?.addError ?? '');
			}
		}}
>
	<input type="hidden" name="company" value={company} />
	<UserPlus size={16} />
	<input
		class="quick-input"
		name="names"
		placeholder={label}
		aria-label={label}
		autocomplete="off"
		bind:value
		oninput={() => (note = '')}
	/>
	{#if value.trim()}<button class="btn btn-soft btn-sm">{t('Add')}</button>{/if}
	{#if note}<p class="quick-note" role="status">{note}</p>{/if}
</form>

<style>
	.quick {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 10px;
		min-height: 52px;
		padding: 8px 16px 8px 28px;
		border-top: 1px solid var(--border);
		color: var(--muted);
	}

	.quick-input {
		flex: 1;
		min-width: 0;
		height: 36px;
		padding: 0 4px;
		border: 0;
		background: transparent;
		/* 16px or iOS Safari zooms the page on focus. */
		font-size: 16px;
		color: var(--text);
	}

	.quick-input::placeholder {
		color: var(--muted);
	}

	.quick-input:focus {
		outline: none;
	}

	.quick:focus-within {
		color: var(--brand-text);
		background: color-mix(in oklab, var(--brand-soft) 45%, transparent);
	}

	.quick-note {
		flex-basis: 100%;
		padding-left: 26px;
		font-size: 13.5px;
		color: var(--muted);
	}
</style>
