import { writable } from 'svelte/store';

/** F24 "Preview Admin" entry point (Backend B20).
 *
 * Tracks whether the guest group currently being viewed at `/join/[code]`
 * offers a read-only "Preview Admin" session (true only for the one
 * group the Backend's `Settings.demo_join_code` names, see
 * `GuestGroupOut.admin_preview_available`, threaded through by
 * `$lib/api/guest.ts`'s `resolveJoinCode`). The globally-mounted
 * `SettingsDrawer` reads this store to decide whether to show its
 * "Preview Admin" block, without needing its own copy of the join code or
 * a route-data prop threaded down from wherever it happens to be opened.
 *
 * Set by `join/[code]/+page.svelte` once its guest data resolves; cleared
 * on navigating away from that page (an `$effect` cleanup) so the drawer
 * never offers preview for a group the visitor isn't even looking at.
 *
 * Same choice as `theme.ts`/`localProfile.ts`: a plain `svelte/store`
 * writable, so this stays plain `.ts` and unit-testable without the
 * Svelte compiler. */

export interface DemoPreviewGuestState {
	/** The join code of the guest group currently being viewed (already
	 * uppercased, matching every other guest route's convention). */
	joinCode: string;
	adminPreviewAvailable: boolean;
}

export const demoPreviewGuest = writable<DemoPreviewGuestState | null>(null);

export function setDemoPreviewGuest(state: DemoPreviewGuestState): void {
	demoPreviewGuest.set(state);
}

export function clearDemoPreviewGuest(): void {
	demoPreviewGuest.set(null);
}

/** Pure gating logic, pulled out for direct unit testing: should the
 * Settings drawer show the "Preview Admin" block for the given guest
 * state? `null` means "not currently viewing a guest join page at all". */
export function shouldShowAdminPreview(state: DemoPreviewGuestState | null): boolean {
	return state !== null && state.adminPreviewAvailable && state.joinCode.trim().length > 0;
}
