<script lang="ts">
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { settingsDrawer } from '$lib/stores/settingsDrawer.svelte';
	import { themeMode, setThemeMode, type ThemeMode } from '$lib/theme';
	import { playerDefaults, setPlayerDefaults, VIEW_MODES, type PlayerDefaults, type ViewMode } from '$lib/playerDefaults';
	import { VOICE_PARTS as PLAYER_VOICE_PARTS, type DisplayMode, type MixMode, type VoicePart } from '$lib/midi/types';
	import { DEFAULT_SETTINGS } from '$lib/fixtures/appData';
	// Mounted once in the root layout, so it can be opened from any page
	// (including one that doesn't otherwise import this) — imported here
	// directly rather than relying on the current page to have brought it in.
	import '$lib/styles/shell.css';

	// Same account-wide screen `/settings` used to be as its own page — now a
	// slide-in drawer over whatever page it was opened from (triggered by
	// `AppHeader`'s gear icon everywhere), so closing it just removes the
	// overlay instead of navigating anywhere. See `settingsDrawer.svelte.ts`
	// for why the open/closed state lives in its own module rather than a
	// prop passed down from each route.

	function close() {
		settingsDrawer.open = false;
	}

	const user = $derived(page.data.user as { name: string; email: string } | null | undefined);

	const VOICE_PART_LABELS: Record<VoicePart, string> = {
		soprano: 'Soprano',
		alto: 'Alto',
		tenor: 'Tenor',
		bass: 'Bass'
	};
	const DISPLAY_MODE_LABELS: Record<Exclude<DisplayMode, 'custom'>, string> = {
		flat: 'Everyone',
		highlighted: 'My part + others',
		solo: 'My part'
	};
	const DEFAULT_DISPLAY_MODES = Object.keys(DISPLAY_MODE_LABELS) as Array<keyof typeof DISPLAY_MODE_LABELS>;
	const VIEW_MODE_LABELS: Record<ViewMode, string> = {
		player: 'Score',
		pdf: 'PDF'
	};
	const MIX_MODE_LABELS: Record<Exclude<MixMode, 'custom'>, string> = {
		everyone: 'Everyone',
		minusMe: 'Minus Me',
		myPart: 'My Part'
	};
	const DEFAULT_MIX_MODES = Object.keys(MIX_MODE_LABELS) as Array<keyof typeof MIX_MODE_LABELS>;

	const DESK_OPTIONS = [1, 2, 3, 4];
	const DESK_LABELS: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th' };

	function updatePlayerDefaults(next: Partial<PlayerDefaults>) {
		setPlayerDefaults({ ...$playerDefaults, ...next });
	}

	let keepScreenAwake = $state(DEFAULT_SETTINGS.keepScreenAwake);
	let countIn = $state(DEFAULT_SETTINGS.countIn);
	let backgroundAudio = $state(DEFAULT_SETTINGS.backgroundAudio);

	// Account section: "Edit name" click-to-edit, same inline-form pattern
	// as a group's member-title editor (`groups/[id]/+page.svelte`). Posts
	// to `/settings`'s actions rather than this route's own — this drawer
	// is mounted once in the root layout and can be open over any page, so
	// there's no local `+page.server.ts` for it to target.
	let editingName = $state(false);
	let nameDraft = $state('');
	let savingName = $state(false);
	let nameError = $state<string | null>(null);

	// Account section: "Change password" click-to-edit, same pattern as
	// "Edit name" above — requires the current password (see the Backend's
	// `change_password` route), distinct from `/forgot-password`'s
	// token-based flow for someone who's locked out entirely.
	let changingPassword = $state(false);
	let currentPasswordDraft = $state('');
	let newPasswordDraft = $state('');
	let confirmNewPasswordDraft = $state('');
	let savingPassword = $state(false);
	let passwordError = $state<string | null>(null);
	let passwordChanged = $state(false);
	const passwordMismatch = $derived(
		newPasswordDraft.length > 0 && confirmNewPasswordDraft.length > 0 && newPasswordDraft !== confirmNewPasswordDraft
	);

	// Account section: "Delete account" click-to-confirm, same pattern as a
	// group's "Leave group".
	let confirmingDelete = $state(false);
	let deletingAccount = $state(false);
	let deleteError = $state<string | null>(null);
</script>

{#if settingsDrawer.open}
	<button class="menu-backdrop" onclick={close} aria-label="Close Settings"></button>
	<aside class="menu-drawer" aria-label="Settings">
		<header class="menu-header">
			<h2>Settings</h2>
			<button class="icon-btn" onclick={close} aria-label="Close Settings">
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path d="M18 6 6 18M6 6l12 12" />
				</svg>
			</button>
		</header>

		<section class="menu-section">
			<h3>Account</h3>
			{#if user}
				{#if editingName}
					<form
						method="POST"
						action="/settings?/updateName"
						class="inline-edit-row"
						use:enhance={() => {
							savingName = true;
							nameError = null;
							return async ({ result }) => {
								savingName = false;
								if (result.type === 'failure') {
									nameError = (result.data as { error?: string } | undefined)?.error ?? 'Could not update name';
									return;
								}
								if (result.type === 'success') {
									editingName = false;
									await invalidateAll();
								}
							};
						}}
					>
						<input name="name" bind:value={nameDraft} required />
						<button type="submit" class="btn btn-outline" disabled={savingName}>
							{savingName ? 'Saving…' : 'Save'}
						</button>
						<button type="button" class="text-link" onclick={() => (editingName = false)} disabled={savingName}>
							Cancel
						</button>
					</form>
					{#if nameError}<p class="error">{nameError}</p>{/if}
				{:else}
					<div class="list-row">
						<span>Name</span>
						<span class="value-with-action">
							<span class="dim">{user.name}</span>
							<button
								type="button"
								class="text-link"
								onclick={() => {
									nameDraft = user.name;
									editingName = true;
								}}
							>
								Edit
							</button>
						</span>
					</div>
				{/if}
				<div class="list-row"><span>Email</span><span class="dim">{user.email}</span></div>

				{#if changingPassword}
					<form
						method="POST"
						action="/settings?/changePassword"
						class="inline-edit-row"
						use:enhance={() => {
							savingPassword = true;
							passwordError = null;
							return async ({ result, update }) => {
								savingPassword = false;
								if (result.type === 'failure') {
									passwordError =
										(result.data as { error?: string } | undefined)?.error ?? 'Could not change password';
									return;
								}
								if (result.type === 'success') {
									changingPassword = false;
									currentPasswordDraft = '';
									newPasswordDraft = '';
									confirmNewPasswordDraft = '';
									passwordChanged = true;
									// This form doesn't stay visible after success (it
									// collapses back to the summary row above), so the
									// native `form.reset()` SvelteKit's default `update()`
									// runs here is harmless — unlike the group page's
									// page-visibility toggles, nothing here needs to
									// survive it.
									await update();
								}
							};
						}}
					>
						<label class="field">
							<span>Current password</span>
							<input type="password" name="currentPassword" bind:value={currentPasswordDraft} required autocomplete="current-password" />
						</label>
						<label class="field">
							<span>New password</span>
							<input type="password" name="newPassword" bind:value={newPasswordDraft} required minlength="8" autocomplete="new-password" />
						</label>
						<label class="field">
							<span>Confirm new password</span>
							<input type="password" bind:value={confirmNewPasswordDraft} required minlength="8" autocomplete="new-password" />
						</label>
						{#if passwordMismatch}<p class="error">Passwords don't match</p>{/if}
						{#if passwordError}<p class="error">{passwordError}</p>{/if}
						<div class="btn-row">
							<button
								type="button"
								class="text-link"
								onclick={() => {
									changingPassword = false;
									currentPasswordDraft = '';
									newPasswordDraft = '';
									confirmNewPasswordDraft = '';
									passwordError = null;
								}}
								disabled={savingPassword}
							>
								Cancel
							</button>
							<button
								type="submit"
								class="btn btn-outline"
								disabled={savingPassword || passwordMismatch || newPasswordDraft.length < 8}
							>
								{savingPassword ? 'Saving…' : 'Save'}
							</button>
						</div>
					</form>
				{:else}
					<div class="list-row">
						<span>Password</span>
						<span class="value-with-action">
							{#if passwordChanged}<span class="dim">Changed</span>{/if}
							<button
								type="button"
								class="text-link"
								onclick={() => {
									passwordChanged = false;
									changingPassword = true;
								}}
							>
								Change
							</button>
						</span>
					</div>
				{/if}
			{:else}
				<p class="card-meta">
					You're browsing as a guest — nothing here leaves this device. Create an account (or
					log in to one) to keep it and your groups everywhere you sign in.
				</p>
				<div class="btn-row">
					<a class="btn btn-primary" href="/login?mode=register" onclick={close}>Create an account</a>
					<a class="btn btn-outline" href="/login" onclick={close}>Log in</a>
				</div>
			{/if}
		</section>

		<section class="menu-section">
			<h3>Theme</h3>
			<label class="field">
				<span>Appearance</span>
				<select value={$themeMode} onchange={(e) => setThemeMode((e.currentTarget as HTMLSelectElement).value as ThemeMode)}>
					<option value="system">System</option>
					<option value="light">Light</option>
					<option value="dark">Dark</option>
				</select>
			</label>
		</section>

		<section class="menu-section">
			<h3>Practice defaults</h3>
			<label class="field">
				<span>Voice</span>
				<select
					value={$playerDefaults.voicePart}
					onchange={(e) => updatePlayerDefaults({ voicePart: (e.currentTarget as HTMLSelectElement).value as VoicePart })}
				>
					{#each PLAYER_VOICE_PARTS as part (part)}
						<option value={part}>{VOICE_PART_LABELS[part]}</option>
					{/each}
				</select>
			</label>
			<label class="field field--sub">
				<span>Split part</span>
				<select
					value={$playerDefaults.voiceDesk ?? ''}
					onchange={(e) => {
						const raw = (e.currentTarget as HTMLSelectElement).value;
						updatePlayerDefaults({ voiceDesk: raw === '' ? null : Number(raw) });
					}}
				>
					<option value="">Whole section</option>
					{#each DESK_OPTIONS as desk (desk)}
						<option value={desk}>{DESK_LABELS[desk]}</option>
					{/each}
				</select>
			</label>
			<label class="field">
				<span>Display</span>
				<select
					value={$playerDefaults.displayMode}
					onchange={(e) =>
						updatePlayerDefaults({
							displayMode: (e.currentTarget as HTMLSelectElement).value as PlayerDefaults['displayMode']
						})}
				>
					{#each DEFAULT_DISPLAY_MODES as mode (mode)}
						<option value={mode}>{DISPLAY_MODE_LABELS[mode]}</option>
					{/each}
				</select>
			</label>
			<label class="field">
				<span>Sound mixing</span>
				<select
					value={$playerDefaults.mixMode}
					onchange={(e) =>
						updatePlayerDefaults({
							mixMode: (e.currentTarget as HTMLSelectElement).value as PlayerDefaults['mixMode']
						})}
				>
					{#each DEFAULT_MIX_MODES as mode (mode)}
						<option value={mode}>{MIX_MODE_LABELS[mode]}</option>
					{/each}
				</select>
			</label>
			<label class="field">
				<span>View</span>
				<select
					value={$playerDefaults.viewMode}
					onchange={(e) => updatePlayerDefaults({ viewMode: (e.currentTarget as HTMLSelectElement).value as ViewMode })}
				>
					{#each VIEW_MODES as mode (mode)}
						<option value={mode}>{VIEW_MODE_LABELS[mode]}</option>
					{/each}
				</select>
			</label>
		</section>

		<section class="menu-section">
			<h3>Playback</h3>
			<label class="toggle-row">
				<span>Keep screen awake while practicing</span>
				<input type="checkbox" bind:checked={keepScreenAwake} />
			</label>
			<label class="toggle-row">
				<span>Count-in before playback</span>
				<input type="checkbox" bind:checked={countIn} />
			</label>
			<label class="toggle-row">
				<span>Background audio</span>
				<input type="checkbox" bind:checked={backgroundAudio} />
			</label>
		</section>

		<section class="menu-section">
			<a class="list-row-link" href="/settings/more" onclick={close}>
				<span>More</span>
				<span class="dim">About Divisi, portfolio</span>
			</a>
		</section>

		{#if user}
			<form method="POST" action="/logout">
				<button class="btn btn-danger btn-block" type="submit">Log out</button>
			</form>

			{#if confirmingDelete}
				<p class="card-note">
					This permanently deletes your account and anything genuinely yours (private notes,
					personal pieces). Content you created for a group — homework, responsibility
					schedules — stays for the group, just no longer attributed to you.
				</p>
				{#if deleteError}<p class="error">{deleteError}</p>{/if}
				<div class="btn-row">
					<button
						type="button"
						class="btn btn-outline"
						onclick={() => (confirmingDelete = false)}
						disabled={deletingAccount}
					>
						Cancel
					</button>
					<form
						method="POST"
						action="/settings?/deleteAccount"
						use:enhance={() => {
							deletingAccount = true;
							deleteError = null;
							return async ({ result }) => {
								if (result.type === 'failure') {
									deletingAccount = false;
									deleteError =
										(result.data as { error?: string } | undefined)?.error ?? 'Could not delete account';
									return;
								}
								if (result.type === 'redirect') {
									close();
									window.location.href = result.location;
								}
							};
						}}
					>
						<button type="submit" class="btn btn-danger" disabled={deletingAccount}>
							{deletingAccount ? 'Deleting…' : 'Yes, delete account'}
						</button>
					</form>
				</div>
			{:else}
				<button
					type="button"
					class="text-link text-link--danger delete-account-link"
					onclick={() => (confirmingDelete = true)}
				>
					Delete account
				</button>
			{/if}
		{/if}
	</aside>
{/if}

<style>
	.menu-backdrop {
		position: fixed;
		inset: 0;
		border: none;
		background: rgba(10, 10, 20, 0.35);
		z-index: 20;
		cursor: default;
	}

	.menu-drawer {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		width: min(360px, 100vw);
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		overflow-y: auto;
		padding: calc(1rem + env(safe-area-inset-top, 0px)) 1.25rem
			calc(1.5rem + env(safe-area-inset-bottom, 0px));
		border-left: 1px solid var(--border);
		background: var(--surface);
		box-shadow: var(--shadow);
		z-index: 21;
		animation: slide-in 0.18s ease-out;
	}

	@keyframes slide-in {
		from {
			transform: translateX(100%);
		}

		to {
			transform: translateX(0);
		}
	}

	.menu-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.menu-header h2 {
		margin: 0;
		color: var(--text);
		font-size: 1.0625rem;
		font-weight: 800;
	}

	.menu-section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.menu-section h3 {
		margin: 0 0 0.5rem;
		color: var(--text-muted);
		font-size: 0.8125rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.icon-btn {
		flex-shrink: 0;
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--text);
		cursor: pointer;
	}

	.icon-btn:hover {
		background: var(--surface-2);
	}

	.icon-btn svg {
		width: 21px;
		height: 21px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	/* Reads as a sub-choice of "Voice" right above it, not a peer field —
	   same "nested under" language as `/settings`'s original page version. */
	.field--sub {
		margin-left: 1rem;
		padding-left: 0.75rem;
		border-left: 2px solid var(--border);
	}

	.toggle-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.875rem;
		color: var(--text);
		padding: 0.2rem 0;
	}

	.toggle-row input {
		width: 2.2rem;
		height: 1.3rem;
		accent-color: var(--accent);
	}

	.value-with-action {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}

	.text-link {
		flex: 0 0 auto;
		background: none;
		border: none;
		padding: 0;
		font: inherit;
		font-size: 0.8125rem;
		font-weight: 700;
		color: var(--accent);
		cursor: pointer;
		white-space: nowrap;
	}

	.text-link--danger {
		color: var(--danger);
	}

	/* `.text-link` is a flex child of the drawer's own column layout, which
	   stretches it full-width by default — centered and unpadded is what
	   actually reads as "small", sitting quietly under the much louder
	   Log out button rather than matching its width. */
	.delete-account-link {
		align-self: center;
		font-size: 0.75rem;
		font-weight: 400;
		text-decoration: underline;
	}

	.inline-edit-row {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}

	.inline-edit-row input:not([type]) {
		flex: 1 1 auto;
		min-width: 0;
		font: inherit;
		font-size: 0.875rem;
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text);
		border-radius: var(--radius-md);
		padding: 0.5rem 0.6rem;
	}

	.error {
		margin: 0.4rem 0 0;
		font-size: 0.8125rem;
		color: var(--danger);
	}
</style>
