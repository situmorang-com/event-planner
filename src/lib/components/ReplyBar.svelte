<script lang="ts">
	import { t } from '$lib/i18n/t.svelte';
	import { REPLIES, REPLY_LABEL, type Reply } from '$lib/invitations';

	interface Props {
		counts: Record<Reply, number>;
	}

	let { counts }: Props = $props();

	const total = $derived(REPLIES.reduce((n, r) => n + counts[r], 0));
	// Fixed slot order: a colour follows its reply, never its size.
	const shown = $derived(REPLIES.filter((r) => counts[r] > 0));
</script>

{#if total > 0}
	<div
		class="bar"
		role="img"
		aria-label={REPLIES.map((r) => `${t(REPLY_LABEL[r])} ${counts[r]}`).join(', ')}
	>
		{#each shown as reply (reply)}
			<span
				class="seg {reply}"
				style="flex-grow: {counts[reply]}"
				title={t('{reply}: {n} of {total}', {
					reply: t(REPLY_LABEL[reply]),
					n: counts[reply],
					total
				})}
			></span>
		{/each}
	</div>
{/if}

<style>
	.bar {
		display: flex;
		gap: 2px;
		height: 12px;
	}

	.seg {
		flex-basis: 0;
		min-width: 6px;
		height: 100%;
		transition: flex-grow 0.35s cubic-bezier(0.2, 0.8, 0.2, 1);
	}

	.seg:hover {
		filter: brightness(1.08);
	}

	/* Rounded data-ends on the outside of the stack only. */
	.seg:first-child {
		border-radius: 4px 0 0 4px;
	}

	.seg:last-child {
		border-radius: 0 4px 4px 0;
	}

	.seg:only-child {
		border-radius: 4px;
	}

	.yes {
		background: var(--status-good);
	}

	.maybe {
		background: var(--status-warn);
	}

	.no {
		background: var(--status-bad);
	}

	/* Still to reply: the unfilled track. */
	.pending {
		background: var(--border-strong);
	}
</style>
