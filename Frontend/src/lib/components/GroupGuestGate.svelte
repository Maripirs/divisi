<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { lh } from '$lib/i18n';

	/** The whole page for a logged-out visitor on a member link
	 * (`/groups/{id}` or `/groups/{id}/pages/{slug}`) whose owning group has
	 * a guest password: `+layout.server.ts`'s `resolveGroupGuestGate`
	 * resolved the group down the load chain instead of the group's real
	 * data. Group-id counterpart to `piece/[id]/+page.svelte`'s own
	 * `data.guestGate` card; this is that same shape pulled out into its own
	 * component since two separate leaf routes (`+page.svelte` here and
	 * `pages/[slug]/+page.svelte`) both need to render it identically. */
	let {
		groupName,
		code,
		targetSuffix,
		redirectTo
	}: { groupName: string; code: string; targetSuffix: string; redirectTo: string } = $props();

	let password = $state('');
	let passwordWrong = $state(false);
	let submitting = $state(false);

	/** Same shape as the piece gate's `submitGuestGatePassword`: POST the
	 * entered password to `/join/{code}/auth` (mints the per-group guest-token
	 * cookie on success), then a full-document navigation into the guest view
	 * with the resolved `targetSuffix`: a hard nav, not `goto()`, since the
	 * destination is a whole separate route tree (`/join/...`) this component
	 * has nothing to hand off to client-side. */
	async function submit(event: SubmitEvent) {
		event.preventDefault();
		submitting = true;
		passwordWrong = false;
		try {
			const res = await fetch(`/join/${code}/auth`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password })
			});
			const body = (await res.json()) as { ok: boolean };
			if (body.ok) {
				password = '';
				window.location.href = lh(`/join/${code}${targetSuffix}`);
			} else {
				passwordWrong = true;
			}
		} catch {
			passwordWrong = true;
		} finally {
			submitting = false;
		}
	}
</script>

<main class="gate-shell">
	<div class="status-card">
		<p>{m.group_password_gate_title({ group: groupName })}</p>
		<p class="status-detail-text">{m.group_password_gate_body()}</p>
		<form class="gate-form" onsubmit={submit}>
			<input
				type="password"
				bind:value={password}
				placeholder={m.login_password()}
				aria-label={m.login_password()}
				required
				autocomplete="current-password"
			/>
			{#if passwordWrong}
				<p class="status-note status-note--error">{m.join_password_wrong()}</p>
			{/if}
			<button class="gate-submit" type="submit" disabled={submitting}>
				{m.group_password_gate_submit()}
			</button>
		</form>
		<a class="text-link" href={lh(`/login?redirectTo=${encodeURIComponent(redirectTo)}`)}>
			{m.group_password_gate_login()}
		</a>
	</div>
</main>

<style>
	/* Copied from `piece/[id]/+page.svelte`'s own `.status-card`/`.gate-form`/
	   `.gate-submit`/`.text-link` rather than shared: that file's versions are
	   scoped to its own component and this gate needs to render identically
	   from two different leaf routes, so it carries its own copy. */
	.gate-shell {
		min-height: 100vh;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding: 1.5rem;
		background: var(--bg);
	}

	.status-card {
		max-width: 520px;
		width: 100%;
		margin: 2.5rem auto 0;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow);
		padding: 2.5rem 1.5rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		color: var(--text-muted);
		text-align: center;
	}

	.status-detail-text {
		font-size: 0.8125rem;
	}

	.status-note {
		margin: 0.5rem 0 0;
		font-size: 0.8125rem;
		color: var(--text-muted);
	}

	.status-note--error {
		color: var(--danger);
	}

	.gate-form {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		width: 100%;
		max-width: 260px;
	}

	.gate-form input {
		width: 100%;
		padding: 0.5rem 0.625rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface);
		color: var(--text);
		font-size: 0.875rem;
	}

	.gate-submit {
		width: 100%;
		padding: 0.5rem 0.75rem;
		border: none;
		border-radius: var(--radius-md);
		background: var(--accent);
		color: var(--accent-contrast);
		font-size: 0.875rem;
		font-weight: 650;
		cursor: pointer;
	}

	.gate-submit:disabled {
		opacity: 0.6;
		cursor: default;
	}

	.text-link {
		border: none;
		background: none;
		color: var(--accent);
		font-size: 0.8125rem;
		font-weight: 650;
		cursor: pointer;
		padding: 0;
	}
</style>
