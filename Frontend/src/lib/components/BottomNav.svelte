<script lang="ts">
	import { page } from '$app/state';

	// Home | Library only — per UX_WIREFRAME.md's "Navigation And
	// Brand" direction, "Me" is gone from here; its contents (account,
	// defaults, logout) live under the global Settings, reached via the
	// gear button in AppHeader instead. Groups has no standalone list page
	// of its own — "My groups" lives on Home, and a group's own page is
	// reached from there.
	//
	// Library's href carries `?guest=1` when logged out, so a guest browsing
	// the demo library can move around via this tab without bouncing back to
	// `/welcome` (root `+page.server.ts` otherwise redirects any logged-out,
	// non-guest hit on `/` there). No query param needed once logged in — a
	// bare `/` always reaches the library directly.
	const items = $derived([
		{ href: '/home', label: 'Home', icon: 'home' },
		{ href: page.data.user ? '/' : '/?guest=1', label: 'Library', icon: 'library' }
	] as const);

	function isActive(href: string): boolean {
		const path = page.url.pathname;
		if (href === '/' || href === '/?guest=1') return path === '/';
		return path === href || path.startsWith(href + '/');
	}
</script>

<nav class="bottom-nav" aria-label="Primary">
	{#each items as item (item.href)}
		<a href={item.href} class:active={isActive(item.href)} aria-current={isActive(item.href) ? 'page' : undefined}>
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
