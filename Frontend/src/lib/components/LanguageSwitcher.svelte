<script lang="ts">
	import { page } from '$app/state';
	import { locales, localizeHref, getLocale, type Locale } from '$lib/paraglide/runtime';

	// Human-readable names, each written in its OWN language (not translated
	// per-viewer) — the usual convention for a language picker, so "Español"
	// is legible to a Spanish speaker even while the rest of the page is
	// still in English.
	const LOCALE_LABELS: Record<Locale, string> = {
		en: 'English',
		es: 'Español'
	};

	let current = $derived(getLocale());
</script>

<nav class="language-switcher" aria-label="Language">
	{#each locales as locale (locale)}
		<a
			href={localizeHref(page.url.pathname + page.url.search, { locale })}
			data-sveltekit-reload
			class:active={locale === current}
			aria-current={locale === current ? 'true' : undefined}
		>
			{LOCALE_LABELS[locale]}
		</a>
	{/each}
</nav>

<style>
	.language-switcher {
		position: absolute;
		top: calc(0.75rem + env(safe-area-inset-top, 0px));
		right: 0.75rem;
		display: flex;
		gap: 0.5rem;
		font-size: 0.75rem;
		z-index: 1;
	}

	.language-switcher a {
		color: var(--text-muted);
		text-decoration: none;
		padding: 0.15rem 0.4rem;
		border-radius: 0.35rem;
	}

	.language-switcher a.active {
		color: var(--accent);
		font-weight: 700;
	}
</style>
