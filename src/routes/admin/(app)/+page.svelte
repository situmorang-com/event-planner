<script lang="ts">
	import { formatDateTime, timeAgo } from '$lib/time';
	import Plus from '@lucide/svelte/icons/plus';
	import Monitor from '@lucide/svelte/icons/monitor';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import Calendar from '@lucide/svelte/icons/calendar';
	import ScanLine from '@lucide/svelte/icons/scan-line';
	import MailCheck from '@lucide/svelte/icons/mail-check';
	import CalendarClock from '@lucide/svelte/icons/calendar-clock';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Events · Event Planner</title>
</svelte:head>

<div class="head">
	<div>
		<h1>Events</h1>
		<p class="muted">
			{data.contacts.toLocaleString()} contacts in your database · {data.checkins.toLocaleString()} check-ins
			so far
		</p>
	</div>
	<a class="btn btn-primary" href="/admin/events/new"><Plus size={18} /> New event</a>
</div>

{#if data.events.length === 0}
	<section class="empty card rise">
		<div class="empty-icon"><ScanLine size={30} /></div>
		<h2>Create your first event</h2>
		<p class="muted">
			You’ll get a live QR code for the entrance screen (or a printable one), and every attendee who
			scans it lands in your contact database.
		</p>
		<a class="btn btn-primary btn-lg" href="/admin/events/new"><Plus size={20} /> New event</a>
	</section>
{:else}
	<ul class="grid">
		{#each data.events as event, i (event.id)}
			<li class="card rise" style="animation-delay: {Math.min(i, 8) * 40}ms">
				<a class="cover" href="/admin/events/{event.id}" aria-label="Open {event.name}"></a>
				<div class="top">
					{#if event.is_open}
						<span class="pill pill-good"><span class="dot dot-live"></span> Check-in open</span>
					{:else}
						<span class="pill">Closed</span>
					{/if}
					<a
						class="btn btn-ghost btn-icon btn-sm"
						href="/admin/events/{event.id}/display"
						title="Entrance screen"
					>
						<Monitor size={18} /><span class="sr-only">Open entrance screen for {event.name}</span>
					</a>
				</div>
				<h2>{event.name}</h2>
				<p class="meta">
					{#if event.starts_at}
						<span><Calendar size={14} />{formatDateTime(event.starts_at, event.timezone)}</span>
					{/if}
					{#if event.venue}<span><MapPin size={14} />{event.venue}</span>{/if}
				</p>
				<div class="count">
					<strong>{event.checkins.toLocaleString()}</strong>
					<span class="muted">
						checked in{#if event.last_checkin_at}&nbsp;· latest {timeAgo(
								event.last_checkin_at,
								data.now
							)}{/if}
					</span>
				</div>
				{#if event.invited || event.target_count}
					<a class="rsvp" href="/admin/events/{event.id}/people">
						<MailCheck size={15} />
						Yes {event.attending.toLocaleString()}{#if event.target_count}
							/ {event.target_count.toLocaleString()} target{/if}
						<span class="muted">· Confirmed {event.confirmed.toLocaleString()}</span>
					</a>
				{/if}
				{#if event.due}
					<a class="rsvp due" href="/admin/events/{event.id}/people">
						<CalendarClock size={15} />
						Due today {event.due.toLocaleString()}
					</a>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

<style>
	.head {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 16px;
		flex-wrap: wrap;
		margin-bottom: 24px;
	}

	h1 {
		font-size: 32px;
		margin-bottom: 4px;
	}

	.grid {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 16px;
	}

	.grid li {
		position: relative;
		display: grid;
		gap: 10px;
		align-content: start;
		padding: 18px 20px 20px;
		transition:
			transform 0.2s ease,
			box-shadow 0.2s ease,
			border-color 0.2s ease;
	}

	.grid li:hover {
		transform: translateY(-2px);
		border-color: color-mix(in oklab, var(--brand) 35%, var(--border));
		box-shadow: var(--shadow-lg);
	}

	.cover {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		z-index: 0;
	}

	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.top a {
		position: relative;
		z-index: 1;
	}

	h2 {
		font-size: 20px;
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 14px;
		font-size: 14px;
		color: var(--text-2);
	}

	.meta span {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}

	.count {
		display: flex;
		align-items: baseline;
		gap: 8px;
		margin-top: 6px;
		font-size: 14px;
	}

	.rsvp {
		position: relative;
		z-index: 1;
		justify-self: start;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 14px;
		font-weight: 600;
		color: var(--text-2);
		text-decoration: none;
	}

	.rsvp:hover {
		color: var(--brand-text);
	}

	.rsvp.due {
		color: var(--brand-text);
	}

	.count strong {
		font-size: 34px;
		font-weight: 800;
		letter-spacing: -0.03em;
		line-height: 1;
	}

	.empty {
		display: grid;
		justify-items: center;
		text-align: center;
		gap: 12px;
		padding: 56px 24px;
		max-width: 620px;
		margin: 40px auto 0;
	}

	.empty h2 {
		font-size: 24px;
	}

	.empty p {
		max-width: 440px;
		margin-bottom: 8px;
	}

	.empty-icon {
		display: grid;
		place-items: center;
		width: 72px;
		height: 72px;
		border-radius: 22px;
		background: var(--grad);
		color: #fff;
		box-shadow: var(--glow);
		margin-bottom: 6px;
	}
</style>
