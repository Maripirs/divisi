<script lang="ts">
	import '$lib/styles/shell.css';
	import { m } from '$lib/paraglide/messages';
	import { lh } from '$lib/i18n';
	import type { Snippet } from 'svelte';

	/** A4: the outer chrome shared by the unauthenticated form pages
	 * (`/login`, `/forgot-password`, `/reset-password`) — `.shell` main +
	 * `.shell-header` heading + a centered footer link back into the auth
	 * flow. Each page previously hand-rolled this skeleton plus an identical
	 * local `.error` / `.note` / `.success` `<style>` block (those classes now
	 * live in shell.css).
	 *
	 * `children` is everything between the header and the footer — the tabs,
	 * the `<form class="card">`, any success/else branches. `footer` overrides
	 * the default "Back to login" link (login points at `/welcome` instead and
	 * puts its OAuth row just above it). */
	let {
		title,
		children,
		footer
	}: {
		title: string;
		children: Snippet;
		footer?: Snippet;
	} = $props();
</script>

<main class="shell">
	<header class="shell-header">
		<h1>{title}</h1>
	</header>

	{@render children()}

	{#if footer}
		{@render footer()}
	{:else}
		<p class="note"><a href={lh('/login')}>{m.forgot_password_back_to_login()}</a></p>
	{/if}
</main>
