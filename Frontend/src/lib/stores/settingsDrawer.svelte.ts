/** Shared open/closed state for the account-wide Settings drawer
 * (`$lib/components/SettingsDrawer.svelte`), triggered from `AppHeader`'s
 * gear icon on every page. A plain reactive object rather than a
 * `svelte/store` — importing this module gives every caller the same
 * underlying `$state` object, so opening it from `AppHeader` (rendered
 * per-page) and reading it from the one `SettingsDrawer` instance mounted
 * once in the root layout stay in sync with no prop drilling or context
 * needed. Needs the `.svelte.ts` extension for runes to work outside a
 * component. */
export const settingsDrawer = $state({ open: false });
