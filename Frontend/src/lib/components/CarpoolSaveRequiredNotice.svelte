<script lang="ts">
	import { lh } from '$lib/i18n';
	import { m } from '$lib/paraglide/messages';
</script>

<p class="signup-save-required">
	{m.carpool_save_required()}
	<a class="text-link" href={lh('/login?mode=register')}>{m.settings_create_account()}</a>
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
