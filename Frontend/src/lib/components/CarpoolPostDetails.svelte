<script lang="ts">
	import { formatContactPhone } from '$lib/utils/carpool';
	import { m } from '$lib/paraglide/messages';
	import type { CarpoolPostOut } from '$lib/server/backendTypes';

	let { post }: { post: CarpoolPostOut } = $props();
</script>

<div class="carpool-post-main">
	<p class="card-title">
		{post.display_name}
		{#if post.status === 'hidden'}<span class="dim">· {m.carpool_hidden_badge()}</span>{/if}
	</p>
	<p class="card-meta">{m.carpool_origin_label({ origin: post.origin_label })}</p>
	{#if post.kind === 'driver'}
		{#if post.leave_time_text}
			<p class="card-meta">{m.carpool_leaving_at({ time: post.leave_time_text })}</p>
		{/if}
		<div class="carpool-seats">
			{#each Array.from({ length: post.seats_total ?? 0 }) as _, i (i)}
				{#if post.claims[i]}
					<p class="carpool-seat carpool-seat--occupied">
						{m.carpool_seat_occupied({ number: i + 1, name: post.claims[i].display_name })}
					</p>
				{:else}
					<p class="carpool-seat carpool-seat--empty">{m.carpool_seat_empty({ number: i + 1 })}</p>
				{/if}
			{/each}
		</div>
	{:else if post.interests.length > 0}
		<p class="card-meta carpool-post-status">
			{m.carpool_interested_by({ names: post.interests.map((i) => i.display_name).join(', ') })}
		</p>
	{/if}
	{#if post.notes}<p class="card-note">{post.notes}</p>{/if}
	{#if post.contact_phone}
		<a class="carpool-contact-link" href={`tel:${post.contact_phone.replace(/[^\d+]/g, '')}`}>
			{m.carpool_contact_phone_label({ phone: formatContactPhone(post.contact_phone) })}
		</a>
	{/if}
	{#if post.contact_email}
		<a class="carpool-contact-link" href={`mailto:${post.contact_email}`}>
			{m.carpool_contact_email_label({ email: post.contact_email })}
		</a>
	{/if}
</div>

<style>
	.carpool-post-main {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.carpool-post-status {
		color: var(--text);
		font-weight: 600;
	}

	.carpool-seats {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.carpool-seat {
		margin: 0;
		display: flex;
		align-items: center;
		gap: 0.45rem;
		font-size: 0.8125rem;
	}

	.carpool-seat::before {
		content: '';
		flex: 0 0 auto;
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
	}

	.carpool-seat--occupied {
		color: var(--text);
		font-weight: 600;
	}

	.carpool-seat--occupied::before {
		background: var(--accent);
	}

	.carpool-seat--empty {
		color: var(--text-muted);
	}

	.carpool-seat--empty::before {
		background: transparent;
		border: 1px solid var(--border);
	}

	.carpool-contact-link {
		align-self: flex-start;
		color: var(--accent);
		font-weight: 600;
		font-size: 0.8125rem;
		text-decoration: none;
	}

	.carpool-contact-link:hover,
	.carpool-contact-link:focus-visible {
		text-decoration: underline;
	}
</style>
