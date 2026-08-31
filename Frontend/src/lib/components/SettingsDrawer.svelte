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
	import { m } from '$lib/paraglide/messages';
	import { lh } from '$lib/i18n';

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

	const VOICE_PART_LABELS: Record<VoicePart, () => string> = {
		soprano: m.voice_soprano,
		alto: m.voice_alto,
		tenor: m.voice_tenor,
		bass: m.voice_bass
	};
	const DISPLAY_MODE_LABELS: Record<Exclude<DisplayMode, 'custom'>, () => string> = {
		flat: m.display_mode_everyone,
		highlighted: m.display_mode_highlighted,
		solo: m.display_mode_solo
	};
	const DEFAULT_DISPLAY_MODES = Object.keys(DISPLAY_MODE_LABELS) as Array<keyof typeof DISPLAY_MODE_LABELS>;
	const VIEW_MODE_LABELS: Record<ViewMode, () => string> = {
		player: m.settings_view_score,
		pdf: m.settings_view_pdf
	};
	const MIX_MODE_LABELS: Record<Exclude<MixMode, 'custom'>, () => string> = {
		everyone: m.mix_mode_everyone,
		minusMe: m.mix_mode_minus_me,
		mostlyMe: m.mix_mode_mostly_me
	};
	const DEFAULT_MIX_MODES = Object.keys(MIX_MODE_LABELS) as Array<keyof typeof MIX_MODE_LABELS>;

	const DESK_OPTIONS = [1, 2, 3, 4];
	const DESK_LABELS: Record<number, () => string> = {
		1: m.desk_1st,
		2: m.desk_2nd,
		3: m.desk_3rd,
		4: m.desk_4th
	};

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
	<button class="menu-backdrop" onclick={close} aria-label={m.settings_close()}></button>
	<aside class="menu-drawer" aria-label={m.settings_title()}>
		<header class="menu-header">
			<h2>{m.settings_title()}</h2>
			<button class="icon-btn" onclick={close} aria-label={m.settings_close()}>
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path d="M18 6 6 18M6 6l12 12" />
				</svg>
			</button>
		</header>

		<section class="menu-section">
			<h3>{m.settings_account()}</h3>
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
									nameError = (result.data as { error?: string } | undefined)?.error ?? m.drawer_could_not_update_name();
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
							{savingName ? m.reset_password_saving() : m.action_save()}
						</button>
						<button type="button" class="text-link" onclick={() => (editingName = false)} disabled={savingName}>
							{m.action_cancel()}
						</button>
					</form>
					{#if nameError}<p class="error">{nameError}</p>{/if}
				{:else}
					<div class="list-row">
						<span>{m.login_name()}</span>
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
								{m.drawer_edit()}
							</button>
						</span>
					</div>
				{/if}
				<div class="list-row"><span>{m.login_email()}</span><span class="dim">{user.email}</span></div>

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
										(result.data as { error?: string } | undefined)?.error ?? m.drawer_could_not_change_password();
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
							<span>{m.drawer_current_password()}</span>
							<input type="password" name="currentPassword" bind:value={currentPasswordDraft} required autocomplete="current-password" />
						</label>
						<label class="field">
							<span>{m.reset_password_new_password()}</span>
							<input type="password" name="newPassword" bind:value={newPasswordDraft} required minlength="8" autocomplete="new-password" />
						</label>
						<label class="field">
							<span>{m.reset_password_confirm_new_password()}</span>
							<input type="password" bind:value={confirmNewPasswordDraft} required minlength="8" autocomplete="new-password" />
						</label>
						{#if passwordMismatch}<p class="error">{m.login_passwords_dont_match()}</p>{/if}
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
								{m.action_cancel()}
							</button>
							<button
								type="submit"
								class="btn btn-outline"
								disabled={savingPassword || passwordMismatch || newPasswordDraft.length < 8}
							>
								{savingPassword ? m.reset_password_saving() : m.action_save()}
							</button>
						</div>
					</form>
				{:else}
					<div class="list-row">
						<span>{m.login_password()}</span>
						<span class="value-with-action">
							{#if passwordChanged}<span class="dim">{m.drawer_changed()}</span>{/if}
							<button
								type="button"
								class="text-link"
								onclick={() => {
									passwordChanged = false;
									changingPassword = true;
								}}
							>
								{m.drawer_change()}
							</button>
						</span>
					</div>
				{/if}
			{:else}
				<p class="card-meta">
					{m.settings_guest_note()}
				</p>
				<div class="btn-row">
					<a class="btn btn-primary" href={lh('/login?mode=register')} onclick={close}>{m.settings_create_account()}</a>
					<a class="btn btn-outline" href={lh('/login')} onclick={close}>{m.login_title()}</a>
				</div>
			{/if}
		</section>

		<section class="menu-section">
			<h3>{m.settings_theme()}</h3>
			<label class="field">
				<span>{m.settings_appearance()}</span>
				<select value={$themeMode} onchange={(e) => setThemeMode((e.currentTarget as HTMLSelectElement).value as ThemeMode)}>
					<option value="system">{m.settings_theme_system()}</option>
					<option value="light">{m.settings_theme_light()}</option>
					<option value="dark">{m.settings_theme_dark()}</option>
					<option value="classic">{m.settings_theme_classic()}</option>
				</select>
			</label>
		</section>

		<section class="menu-section">
			<h3>{m.settings_practice_defaults()}</h3>
			<label class="field">
				<span>{m.settings_voice()}</span>
				<select
					value={$playerDefaults.voicePart}
					onchange={(e) => updatePlayerDefaults({ voicePart: (e.currentTarget as HTMLSelectElement).value as VoicePart })}
				>
					{#each PLAYER_VOICE_PARTS as part (part)}
						<option value={part}>{VOICE_PART_LABELS[part]()}</option>
					{/each}
				</select>
			</label>
			<label class="field field--sub">
				<span>{m.settings_split_part()}</span>
				<select
					value={$playerDefaults.voiceDesk ?? ''}
					onchange={(e) => {
						const raw = (e.currentTarget as HTMLSelectElement).value;
						updatePlayerDefaults({ voiceDesk: raw === '' ? null : Number(raw) });
					}}
				>
					<option value="">{m.settings_whole_section()}</option>
					{#each DESK_OPTIONS as desk (desk)}
						<option value={desk}>{DESK_LABELS[desk]()}</option>
					{/each}
				</select>
			</label>
			<label class="field">
				<span>{m.settings_display()}</span>
				<select
					value={$playerDefaults.displayMode}
					onchange={(e) =>
						updatePlayerDefaults({
							displayMode: (e.currentTarget as HTMLSelectElement).value as PlayerDefaults['displayMode']
						})}
				>
					{#each DEFAULT_DISPLAY_MODES as mode (mode)}
						<option value={mode}>{DISPLAY_MODE_LABELS[mode]()}</option>
					{/each}
				</select>
			</label>
			<label class="field">
				<span>{m.settings_sound_mixing()}</span>
				<select
					value={$playerDefaults.mixMode}
					onchange={(e) =>
						updatePlayerDefaults({
							mixMode: (e.currentTarget as HTMLSelectElement).value as PlayerDefaults['mixMode']
						})}
				>
					{#each DEFAULT_MIX_MODES as mode (mode)}
						<option value={mode}>{MIX_MODE_LABELS[mode]()}</option>
					{/each}
				</select>
			</label>
			<label class="field">
				<span>{m.settings_view()}</span>
				<select
					value={$playerDefaults.viewMode}
					onchange={(e) => updatePlayerDefaults({ viewMode: (e.currentTarget as HTMLSelectElement).value as ViewMode })}
				>
					{#each VIEW_MODES as mode (mode)}
						<option value={mode}>{VIEW_MODE_LABELS[mode]()}</option>
					{/each}
				</select>
			</label>
		</section>

		<section class="menu-section">
			<h3>{m.settings_playback()}</h3>
			<label class="toggle-row">
				<span>{m.settings_keep_screen_awake()}</span>
				<input type="checkbox" bind:checked={keepScreenAwake} />
			</label>
			<label class="toggle-row">
				<span>{m.settings_count_in()}</span>
				<input type="checkbox" bind:checked={countIn} />
			</label>
			<label class="toggle-row">
				<span>{m.settings_background_audio()}</span>
				<input type="checkbox" bind:checked={backgroundAudio} />
			</label>
		</section>

		<section class="menu-section">
			<a class="list-row-link" href={lh('/settings/more')} onclick={close}>
				<span>{m.settings_more()}</span>
				<span class="dim">{m.settings_more_note()}</span>
			</a>
		</section>

		{#if user}
			<form method="POST" action="/logout">
				<button class="btn btn-danger btn-block" type="submit">{m.settings_log_out()}</button>
			</form>

			{#if confirmingDelete}
				<p class="card-note">
					{m.drawer_delete_account_warning()}
				</p>
				{#if deleteError}<p class="error">{deleteError}</p>{/if}
				<div class="btn-row">
					<button
						type="button"
						class="btn btn-outline"
						onclick={() => (confirmingDelete = false)}
						disabled={deletingAccount}
					>
						{m.action_cancel()}
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
										(result.data as { error?: string } | undefined)?.error ?? m.drawer_could_not_delete_account();
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
							{deletingAccount ? m.drawer_deleting() : m.drawer_yes_delete_account()}
						</button>
					</form>
				</div>
			{:else}
				<button
					type="button"
					class="text-link text-link--danger delete-account-link"
					onclick={() => (confirmingDelete = true)}
				>
					{m.drawer_delete_account()}
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
