<script lang="ts">
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import Logo from '$lib/components/Logo.svelte';
	import LogOut from '@lucide/svelte/icons/log-out';
	import UserRound from '@lucide/svelte/icons/user-round';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	const links = [
		{
			href: '/admin',
			label: 'Events',
			active: (p: string) => p === '/admin' || p.startsWith('/admin/events')
		},
		{
			href: '/admin/contacts',
			label: 'Contacts',
			active: (p: string) => p.startsWith('/admin/contacts')
		},
		{
			href: '/admin/settings',
			label: 'Settings',
			active: (p: string) => p.startsWith('/admin/settings')
		}
	];
</script>

<div class="shell">
	<header>
		<div class="bar">
			<a href="/admin" class="home" aria-label="Event Planner home"><Logo size={30} /></a>
			<nav>
				{#each links as link (link.href)}
					<a href={link.href} aria-current={link.active(page.url.pathname) ? 'page' : undefined}>
						{link.label}
					</a>
				{/each}
			</nav>
			<!-- "Me": picked once per browser, stamped on everything this person does (D1). -->
			{#if data.team.length}
				<form method="POST" action="/admin/who" class="who" use:enhance>
					<input type="hidden" name="next" value={page.url.pathname + page.url.search} />
					<UserRound size={17} aria-hidden="true" />
					<label class="sr-only" for="who">Who are you?</label>
					<select
						id="who"
						name="who"
						class:unset={!data.who}
						onchange={(e) => e.currentTarget.form?.requestSubmit()}
					>
						<option value="" selected={!data.who}>Who are you?</option>
						{#each data.team as name (name)}
							<option value={name} selected={name === data.who}>{name}</option>
						{/each}
					</select>
					<noscript><button class="btn btn-ghost btn-sm">Set</button></noscript>
				</form>
			{:else}
				<a class="who-link" href="/admin/settings#team" title="Add team names in Settings">
					<UserRound size={17} aria-hidden="true" /><span class="label-text">Add your team</span>
				</a>
			{/if}
			<form method="POST" action="/admin/logout">
				<button class="btn btn-ghost btn-sm" aria-label="Sign out"
					><LogOut size={17} /><span class="label-text">Sign out</span></button
				>
			</form>
		</div>
	</header>

	<main>
		{@render children()}
	</main>
</div>

<style>
	.shell {
		min-height: 100dvh;
	}

	header {
		position: sticky;
		top: 0;
		z-index: 20;
		background: color-mix(in oklab, var(--bg) 82%, transparent);
		backdrop-filter: saturate(1.4) blur(14px);
		-webkit-backdrop-filter: saturate(1.4) blur(14px);
		border-bottom: 1px solid var(--border);
	}

	.bar {
		max-width: 1200px;
		margin: 0 auto;
		height: 64px;
		padding: 0 16px;
		display: flex;
		align-items: center;
		gap: 20px;
	}

	.home {
		text-decoration: none;
	}

	nav {
		display: flex;
		gap: 4px;
		flex: 1;
	}

	nav a {
		padding: 8px 12px;
		border-radius: 10px;
		font-weight: 650;
		font-size: 15px;
		color: var(--text-2);
		text-decoration: none;
		transition: background-color 0.15s ease;
	}

	nav a:hover {
		background: var(--surface-2);
		color: var(--text);
	}

	nav a[aria-current='page'] {
		background: var(--surface);
		color: var(--text);
		box-shadow: var(--shadow-sm);
		border: 1px solid var(--border);
		padding: 7px 11px;
	}

	.who,
	.who-link {
		display: flex;
		align-items: center;
		gap: 6px;
		height: 36px;
		padding: 0 10px;
		border-radius: 10px;
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text-2);
		font-size: 14px;
		font-weight: 600;
		text-decoration: none;
	}

	.who select {
		border: 0;
		background: transparent;
		color: var(--text);
		font: inherit;
		font-weight: 650;
		max-width: 160px;
		cursor: pointer;
	}

	.who select:focus-visible {
		outline: none;
		box-shadow: var(--ring);
		border-radius: 6px;
	}

	.who select.unset {
		color: var(--brand-text);
	}

	main {
		max-width: 1200px;
		margin: 0 auto;
		padding: 28px 16px 80px;
	}

	@media (max-width: 560px) {
		.home :global(.word),
		.label-text {
			display: none;
		}

		.bar {
			gap: 10px;
		}

		.who select {
			max-width: 110px;
		}
	}
</style>
