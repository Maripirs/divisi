<script lang="ts">
	import { onMount } from 'svelte';
	import { omrJobs } from '$lib/stores/omrJobs.svelte';
	import { m } from '$lib/paraglide/messages';
	import { lh } from '$lib/i18n';

	// `AppHeader` (and so this) remounts on every navigation — `ensureFresh`
	// only actually refetches when the cached list is stale, and (re)starts
	// the poll timer if a job is still running.
	onMount(() => omrJobs.ensureFresh());

	const unseen = $derived(omrJobs.unseen);
	const primary = $derived(unseen[0]);
	const many = $derived(unseen.length > 1);
	const failed = $derived(!many && primary?.status === 'failed');

	// F16: a single finished generate job the caller started points straight
	// at the editor on that track's working draft ("Review generated draft").
	// The multi-job and failed cases still point at the group's Tracks tab
	// (admin view) — or the library for a job with no group.
	const href = $derived(
		!many && primary?.status === 'done' && primary.piece_id
			? lh(`/piece/${primary.piece_id}/edit`)
			: primary?.group_id
				? lh(
						`/groups/${primary.group_id}?view=admin&tab=tracks` +
							(primary.piece_id ? `#track-${primary.piece_id}` : '')
					)
				: lh('/')
	);

	const label = $derived(
		many
			? m.omr_alert_many({ count: unseen.length })
			: failed
				? m.omr_alert_failed_one({ title: primary?.piece_title ?? m.omr_alert_untitled() })
				: m.omr_alert_done_one({ title: primary?.piece_title ?? m.omr_alert_untitled() })
	);

	// Clicking through clears the notification for that group's batch (all
	// of it, so acting on one draft doesn't leave stale siblings behind);
	// the × clears everything currently showing.
	function followThrough() {
		omrJobs.dismissGroup(primary?.group_id ?? null);
	}
</script>

{#if unseen.length > 0}
	<div class="omr-alert" class:omr-alert--failed={failed} role="status" aria-live="polite">
		<a class="omr-alert-link" href={href} onclick={followThrough}>
			<span class="omr-alert-dot" aria-hidden="true"></span>
			<span class="omr-alert-text">{label}</span>
		</a>
		<button
			type="button"
			class="omr-alert-x"
			onclick={() => omrJobs.dismissAll()}
			aria-label={m.omr_alert_dismiss()}
		>
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
		</button>
	</div>
{/if}

<style>
	.omr-alert {
		display: flex;
		align-items: center;
		gap: 0.15rem;
		min-width: 0;
		max-width: min(60vw, 20rem);
		padding: 0.2rem 0.2rem 0.2rem 0.55rem;
		border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--border) 55%);
		border-radius: var(--radius-full);
		background: color-mix(in srgb, var(--accent) 12%, var(--surface) 88%);
	}

	.omr-alert--failed {
		border-color: color-mix(in srgb, var(--danger) 50%, var(--border) 50%);
		background: color-mix(in srgb, var(--danger) 12%, var(--surface) 88%);
	}

	.omr-alert-link {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		min-width: 0;
		color: var(--text);
		text-decoration: none;
		font-size: 0.75rem;
		font-weight: 700;
	}

	.omr-alert-link:hover {
		color: var(--accent);
	}

	.omr-alert-dot {
		flex-shrink: 0;
		width: 0.45rem;
		height: 0.45rem;
		border-radius: 50%;
		background: var(--accent);
	}

	.omr-alert--failed .omr-alert-dot {
		background: var(--danger);
	}

	.omr-alert-text {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.omr-alert-x {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.4rem;
		height: 1.4rem;
		padding: 0;
		border: none;
		border-radius: 50%;
		background: none;
		color: var(--text-muted);
		cursor: pointer;
	}

	.omr-alert-x:hover {
		color: var(--text);
		background: color-mix(in srgb, var(--text) 10%, transparent);
	}

	.omr-alert-x svg {
		width: 13px;
		height: 13px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.2;
		stroke-linecap: round;
	}
</style>
