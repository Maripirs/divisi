<script lang="ts">
	import { page } from '$app/state';
	import Logo from '$lib/components/Logo.svelte';
	import '$lib/styles/shell.css';
	import { m } from '$lib/paraglide/messages';
	import { lh } from '$lib/i18n';

	// Whatever threw (a route's own `error(status, message)`, a Backend call
	// that couldn't be reached — see `$lib/server/backend.ts`'s `backendFetch`
	// wrapping a network failure into a synthetic 503 — or a genuinely
	// unexpected exception) lands here, SvelteKit's nearest `+error.svelte`
	// up the route tree. This one's at the root, so it's the last line of
	// defense for the whole app rather than one section of it.
	let status = $derived(page.status);
	let title = $derived.by(() => {
		if (status === 404) return m.error_404_title();
		if (status === 403 || status === 401) return m.error_403_title();
		if (status === 503) return m.error_503_title();
		return m.error_generic_title();
	});
	// A route that threw via `error(status, message)` (including the
	// synthetic 503 from a Backend/network failure, which already carries a
	// translated, friendly message) has something specific to show; a truly
	// unexpected exception's raw `.message` isn't written for an end user,
	// so it falls back to a generic line instead of leaking internals.
	let body = $derived(page.error?.message && status !== 500 ? page.error.message : m.error_generic_body());
</script>

<main class="shell error-shell">
	<div class="error-card">
		<Logo size={40} />
		<p class="status-code">{status}</p>
		<h1>{title}</h1>
		<p class="body">{body}</p>
		<a class="btn btn-primary" href={lh('/')}>{m.error_back_home()}</a>
	</div>
</main>

<style>
	.error-shell {
		min-height: 100dvh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding-top: env(safe-area-inset-top, 0px);
		padding-bottom: env(safe-area-inset-bottom, 0px);
	}

	.error-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		text-align: center;
		max-width: 26rem;
		margin: 0 auto;
	}

	.status-code {
		margin: 0.5rem 0 0;
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
	}

	.error-card h1 {
		margin: 0;
		font-size: 1.375rem;
		font-weight: 800;
		color: var(--text);
	}

	.body {
		margin: 0 0 0.5rem;
		font-size: 0.9375rem;
		line-height: 1.5;
		color: var(--text-muted);
	}
</style>
