<script lang="ts">
	import Logo from './Logo.svelte';

	// Shell chrome for the main app screens (Home/Library/Groups/a group's
	// own page/Settings) per UX_WIREFRAME.md's "Navigation And Brand"
	// direction: Divisi is persistent app chrome (top-left), not a
	// per-page title, and account/settings access lives top-right as a
	// gear button. The page's own title (Home, Library, SFCC Chamber
	// Choir, ...) renders below as the actual heading.
	//
	// `homeHref`/`settingsHref` default to the logged-in dashboard routes,
	// but a guest reached via a join code (`routes/join/[code]`) has no
	// dashboard to go to — those pages override both so the brand and gear
	// stay useful instead of bouncing a guest to a login-gated `/home`.
	let { title, homeHref = '/home', settingsHref = '/settings' }: { title: string; homeHref?: string; settingsHref?: string } =
		$props();
</script>

<header class="app-shell-header">
	<div class="app-shell-header-inner">
		<div class="brand-row">
			<a class="brand" href={homeHref} aria-label="Divisi home">
				<Logo size={22} />
				<span>Divisi</span>
			</a>
			<a class="settings-link" href={settingsHref} aria-label="Settings">
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<circle cx="12" cy="12" r="3" />
					<path
						d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82A1.65 1.65 0 0 0 3 13.09H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
					/>
				</svg>
			</a>
		</div>
		<h1 class="page-title">{title}</h1>
	</div>
</header>
