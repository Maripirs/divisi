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
					{@const claim = post.claims[i]}
					<div class="carpool-seat carpool-seat--occupied">
						<p class="carpool-seat-line">{m.carpool_seat_occupied({ number: i + 1, name: claim.display_name })}</p>
						<!-- B34: only present when the Backend decided this viewer may
						     see it (the driver post's own owner, a group admin, or the
						     claimant themselves) -- see `CarpoolSeatClaimOut`'s doc
						     comment, no extra client-side gating needed here. -->
						{#if claim.contact_phone}
							<a class="carpool-contact-link" href={`tel:${claim.contact_phone.replace(/[^\d+]/g, '')}`}>
								{m.carpool_contact_phone_label({ phone: formatContactPhone(claim.contact_phone) })}
							</a>
						{/if}
						{#if claim.contact_email}
							<a class="carpool-contact-link" href={`mailto:${claim.contact_email}`}>
								{m.carpool_contact_email_label({ email: claim.contact_email })}
							</a>
						{/if}
					</div>
				{:else}
					<p class="carpool-seat carpool-seat--empty">{m.carpool_seat_empty({ number: i + 1 })}</p>
				{/if}
			{/each}
		</div>
	{:else if post.interests.length > 0}
		<div class="carpool-interests">
			{#each post.interests as interest (interest.id)}
				<div class="carpool-interest">
					<p class="card-meta carpool-post-status">{interest.display_name}</p>
					<!-- B34: same gated, render-as-is contact info as the seat claims
					     above. -->
					{#if interest.contact_phone}
						<a class="carpool-contact-link" href={`tel:${interest.contact_phone.replace(/[^\d+]/g, '')}`}>
							{m.carpool_contact_phone_label({ phone: formatContactPhone(interest.contact_phone) })}
						</a>
					{/if}
					{#if interest.contact_email}
						<a class="carpool-contact-link" href={`mailto:${interest.contact_email}`}>
							{m.carpool_contact_email_label({ email: interest.contact_email })}
						</a>
					{/if}
				</div>
			{/each}
		</div>
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
		font-size: 0.8125rem;
	}

	/* B34: the empty seat's own `<p>` and an occupied seat's first line
	 * (`.carpool-seat-line`) share the same bullet+text row layout; an
	 * occupied seat's contact links (if any) stack below that line inside
	 * `.carpool-seat--occupied`'s own flex column. */
	.carpool-seat--empty,
	.carpool-seat-line {
		display: flex;
		align-items: center;
		gap: 0.45rem;
	}

	.carpool-seat--empty::before,
	.carpool-seat-line::before {
		content: '';
		flex: 0 0 auto;
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
	}

	.carpool-seat--occupied {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.carpool-seat-line {
		margin: 0;
		color: var(--text);
		font-weight: 600;
	}

	.carpool-seat-line::before {
		background: var(--accent);
	}

	.carpool-seat--empty {
		color: var(--text-muted);
	}

	.carpool-seat--empty::before {
		background: transparent;
		border: 1px solid var(--border);
	}

	.carpool-interests {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.carpool-interest {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.carpool-seat--occupied .carpool-contact-link,
	.carpool-interest .carpool-contact-link {
		/* Lines up under the name text, past the bullet in `.carpool-seat-line`. */
		margin-left: 0.95rem;
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
