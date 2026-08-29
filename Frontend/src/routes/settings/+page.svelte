<script lang="ts">
	import { page } from '$app/state';
	import { themeMode, setThemeMode, type ThemeMode } from '$lib/theme';
	import { playerDefaults, setPlayerDefaults, VIEW_MODES, type PlayerDefaults, type ViewMode } from '$lib/playerDefaults';
	import { VOICE_PARTS as PLAYER_VOICE_PARTS, type DisplayMode, type MixMode, type VoicePart } from '$lib/midi/types';
	import { DEFAULT_SETTINGS } from '$lib/fixtures/appData';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import '$lib/styles/shell.css';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Present when reached from a specific group's join link
	// (`routes/join/[code]`'s gear icon carries it along) rather than the
	// logged-in dashboard's own Settings link — lets a guest get back to
	// their group instead of the bottom nav's login-gated Home tab.
	let guestJoinCode = $derived(page.url.searchParams.get('code'));

	// This is the "applies to the whole account" screen (see
	// UX_WIREFRAME.md's Track Settings vs App Settings section). Every field
	// in "Practice defaults" is real and persisted — they seed a piece the
	// first time it's opened, via `$lib/playerDefaults` (see
	// `routes/piece/[id]`'s per-section "Make this my default"). Sound
	// mixing only offers the three presets, same as the player's own Mix
	// segmented control — a raw per-part balance/visibility mix is
	// promotable the same way from the player, but isn't a dropdown-shaped
	// value, so it isn't exposed here. The toggles below it are still
	// fixture-only UI, not backed by an implemented feature yet.
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
	// Same labels/pattern as the player's own Mix segmented control
	// (`routes/piece/[id]`'s `MIX_MODE_LABELS`) — "Custom" isn't offered here
	// for the same reason "Custom" display isn't: a raw slider mix isn't
	// representable by a dropdown option, only promotable from the player
	// itself via "Make this my default".
	const MIX_MODE_LABELS: Record<Exclude<MixMode, 'custom'>, string> = {
		everyone: 'Everyone',
		minusMe: 'Minus Me',
		mostlyMe: 'Mostly Me'
	};
	const DEFAULT_MIX_MODES = Object.keys(MIX_MODE_LABELS) as Array<keyof typeof MIX_MODE_LABELS>;

	// Plain desk numbers, not piece-specific ids — a real octavo splitting a
	// voice into more than this is vanishingly rare, and nothing stops
	// picking a number here that a given piece doesn't happen to use (it's
	// just ignored then, same as any other default a piece doesn't match).
	const DESK_OPTIONS = [1, 2, 3, 4];
	const DESK_LABELS: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th' };

	function updatePlayerDefaults(next: Partial<PlayerDefaults>) {
		setPlayerDefaults({ ...$playerDefaults, ...next });
	}

	let keepScreenAwake = $state(DEFAULT_SETTINGS.keepScreenAwake);
	let countIn = $state(DEFAULT_SETTINGS.countIn);
	let backgroundAudio = $state(DEFAULT_SETTINGS.backgroundAudio);
</script>

<main class="shell">
	<AppHeader
		title="Settings"
		homeHref={guestJoinCode ? `/join/${guestJoinCode}` : '/home'}
	/>

	<section class="card">
		<p class="card-eyebrow">Account</p>
		{#if data.user}
			<div class="list-row"><span>Name</span><span class="dim">{data.user.name}</span></div>
			<div class="list-row"><span>Email</span><span class="dim">{data.user.email}</span></div>
		{:else}
			<p class="card-meta">
				You're browsing as a guest — nothing here leaves this device. Create an account (or log
				in to one) to keep it and your groups everywhere you sign in.
			</p>
			<div class="btn-row">
				<a class="btn btn-primary" href="/login?mode=register">Create an account</a>
				<a class="btn btn-outline" href="/login">Log in</a>
			</div>
		{/if}
	</section>

	<section class="card">
		<p class="card-eyebrow">Theme</p>
		<label class="field">
			<span>Appearance</span>
			<select value={$themeMode} onchange={(e) => setThemeMode((e.currentTarget as HTMLSelectElement).value as ThemeMode)}>
				<option value="system">System</option>
				<option value="light">Light</option>
				<option value="dark">Dark</option>
			</select>
		</label>
	</section>

	<section class="card">
		<p class="card-eyebrow">Practice defaults</p>
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

	<section class="card">
		<p class="card-eyebrow">Playback</p>
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

	<section class="card">
		<a class="list-row-link" href="/settings/more">
			<span>More</span>
			<span class="dim">About Divisi, portfolio</span>
		</a>
	</section>

	{#if data.user}
		<form method="POST" action="/logout">
			<button class="btn btn-danger btn-block" type="submit">Log out</button>
		</form>
	{/if}
</main>

{#if guestJoinCode}
	<!-- A code-guest has no dashboard `BottomNav`'s Home tab would resolve
	     to (it's login-gated) — send them back where they came from instead. -->
	<nav class="bottom-nav">
		<a href="/join/{guestJoinCode}">Back to your choir</a>
	</nav>
{:else}
	<BottomNav />
{/if}

<style>
	/* Reads as a sub-choice of "Voice" right above it, not a peer field —
	   left border + indent are the same "nested under" language used
	   elsewhere (e.g. the player's own desk picker hangs off its Display
	   section the same visual way). */
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
