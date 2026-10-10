<script lang="ts">
	import { page } from '$app/state';
	import { lh } from '$lib/i18n';
	import { authHref } from '$lib/authLinks';
	import { m } from '$lib/paraglide/messages';
</script>

<p class="signup-save-required">
	{m.carpool_save_required()}
	<a class="text-link" href={lh(authHref('register', page.url.pathname + page.url.search))}>{m.settings_create_account()}</a>
</p>

<style>
	.signup-save-required {
		margin: 0;
		font-size: 0.8125rem;
		color: var(--text-muted);
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
</style>
