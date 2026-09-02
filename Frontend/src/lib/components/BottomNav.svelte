<script lang="ts">
	import { page } from '$app/state';
	import { m } from '$lib/paraglide/messages';
	import { lh } from '$lib/i18n';
	import { deLocalizeUrl } from '$lib/paraglide/runtime';

	// Home | Library only — per UX_WIREFRAME.md's "Navigation And
	// Brand" direction, "Me" is gone from here; its contents (account,
	// defaults, logout) live under the global Settings, reached via the
	// gear button in AppHeader instead. Groups has no standalone list page
	// of its own — "My groups" lives on Home, and a group's own page is
	// reached from there.
	//
	// Library's href always carries `?lib=1`: root `+page.server.ts` redirects
	// a bare `/` to `/welcome` (logged out) or `/home` (logged in), so the tab
	// needs the explicit opt-in to actually land on the library either way.
	const items = $derived([
		{ href: lh('/home'), rawHref: '/home', label: m.bottom_nav_home(), icon: 'home' },
		{
			href: lh('/?lib=1'),
			rawHref: '/',
			label: m.bottom_nav_library(),
			icon: 'library'
		}
	] as const);

	// Compares against the *canonical* (de-localized) path — `page.url` is
	// the raw request URL and DOES carry `/es`, but `reroute` (see
	// `src/hooks.ts`) means the same route also matches with no prefix
	// depending on how it was reached, so comparing the localized `href`
	// directly would miss a match half the time. `deLocalizeUrl` collapses
	// both to the same canonical form first.
	function isActive(rawHref: string): boolean {
		const path = deLocalizeUrl(page.url).pathname;
		if (rawHref === '/') return path === '/';
		return path === rawHref || path.startsWith(rawHref + '/');
	}
</script>

<nav class="bottom-nav" aria-label={m.bottom_nav_primary()}>
	{#each items as item (item.rawHref)}
		<a href={item.href} class:active={isActive(item.rawHref)} aria-current={isActive(item.rawHref) ? 'page' : undefined}>
			{#if item.icon === 'home'}
				<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></svg>
			{:else if item.icon === 'library'}
				<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h4v16H4z" /><path d="M10 4h4v16h-4z" /><path d="M16.5 5l3.5 15.5-4 .9L12.5 6z" /></svg>
			{:else}
				<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" /></svg>
			{/if}
			<span>{item.label}</span>
		</a>
	{/each}
</nav>
