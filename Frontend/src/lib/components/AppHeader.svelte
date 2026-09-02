<script lang="ts">
	import Logo from './Logo.svelte';
	import OmrJobAlerts from './OmrJobAlerts.svelte';
	import { settingsDrawer } from '$lib/stores/settingsDrawer.svelte';
	import { m } from '$lib/paraglide/messages';
	import { lh } from '$lib/i18n';

	// Shell chrome for the main app screens (Home/Library/Groups/a group's
	// own page/Settings) per UX_WIREFRAME.md's "Navigation And Brand"
	// direction: Divisi is persistent app chrome (top-left), not a
	// per-page title, and account/settings access lives top-right as a
	// gear button. The page's own title (Home, Library, SFCC Chamber
	// Choir, ...) renders below as the actual heading.
	//
	// `homeHref` defaults to the logged-in dashboard route, but a guest
	// reached via a join code (`routes/join/[code]`) has no dashboard to go
	// to — that page overrides it so the brand stays useful instead of
	// bouncing a guest to a login-gated `/home`. The gear button opens the
	// Settings drawer (`SettingsDrawer.svelte`, mounted once in the root
	// layout) in place, rather than navigating to a `/settings` page — same
	// button everywhere, no per-page href needed for it anymore.
	let { title, homeHref }: { title: string; homeHref?: string } = $props();
	let resolvedHomeHref = $derived(homeHref ?? lh('/home'));
</script>

<header class="app-shell-header">
	<div class="app-shell-header-inner">
		<div class="brand-row">
			<a class="brand" href={resolvedHomeHref} aria-label={m.app_header_home_label()}>
				<Logo size={22} />
				<span>Divisi</span>
			</a>
			<div class="brand-row-actions">
				<!-- Self-contained (reads its own store, no props) so it rides
				     along on every screen that mounts `AppHeader`: an admin
				     hears a "Generate music from PDF" job they started has
				     finished no matter where they've navigated since. -->
				<OmrJobAlerts />
				<button class="settings-link" onclick={() => (settingsDrawer.open = true)} aria-label={m.settings_title()}>
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<circle cx="12" cy="12" r="3" />
					<path
						d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82A1.65 1.65 0 0 0 3 13.09H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
					/>
				</svg>
				</button>
			</div>
		</div>
		<h1 class="page-title">{title}</h1>
	</div>
</header>
