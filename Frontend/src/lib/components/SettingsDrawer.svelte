<script lang="ts">
	import { page } from '$app/state';
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
				<div class="list-row"><span>Name</span><span class="dim">{user.name}</span></div>
				<div class="list-row"><span>Email</span><span class="dim">{user.email}</span></div>
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
			<p class="card-note field--sub">
				Only applies to a piece that actually splits your voice (e.g. Soprano 1/2) — everything
				else looks exactly the same either way.
			</p>
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
				<span class="dim">About Divisi, contact</span>
			</a>
		</section>

		{#if user}
			<form method="POST" action="/logout">
				<button class="btn btn-danger btn-block" type="submit">Log out</button>
			</form>
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
</style>
