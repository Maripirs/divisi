<script lang="ts">
	import { page } from '$app/state';
	import { themeMode, setThemeMode, type ThemeMode } from '$lib/theme';
	import { playerDefaults, setPlayerDefaults, VIEW_MODES, type PlayerDefaults, type ViewMode } from '$lib/playerDefaults';
	import { VOICE_PARTS as PLAYER_VOICE_PARTS, type DisplayMode, type MixMode, type VoicePart } from '$lib/midi/types';
	import { DEFAULT_SETTINGS } from '$lib/fixtures/appData';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import '$lib/styles/shell.css';
	import { m } from '$lib/paraglide/messages';
	import { lh } from '$lib/i18n';
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
	// Same labels/pattern as the player's own Mix segmented control
	// (`routes/piece/[id]`'s `MIX_MODE_LABELS`) — "Custom" isn't offered here
	// for the same reason "Custom" display isn't: a raw slider mix isn't
	// representable by a dropdown option, only promotable from the player
	// itself via "Make this my default".
	const MIX_MODE_LABELS: Record<Exclude<MixMode, 'custom'>, () => string> = {
		everyone: m.mix_mode_everyone,
		minusMe: m.mix_mode_minus_me,
		mostlyMe: m.mix_mode_mostly_me
	};
	const DEFAULT_MIX_MODES = Object.keys(MIX_MODE_LABELS) as Array<keyof typeof MIX_MODE_LABELS>;

	// Plain desk numbers, not piece-specific ids — a real octavo splitting a
	// voice into more than this is vanishingly rare, and nothing stops
	// picking a number here that a given piece doesn't happen to use (it's
	// just ignored then, same as any other default a piece doesn't match).
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
</script>

<main class="shell">
	<AppHeader
		title={m.settings_title()}
		homeHref={guestJoinCode ? lh(`/join/${guestJoinCode}`) : lh('/home')}
	/>

	<section class="card">
		<p class="card-eyebrow">{m.settings_account()}</p>
		{#if data.user}
			<div class="list-row"><span>{m.login_name()}</span><span class="dim">{data.user.name}</span></div>
			<div class="list-row"><span>{m.login_email()}</span><span class="dim">{data.user.email}</span></div>
		{:else}
			<p class="card-meta">
				{m.settings_guest_note()}
			</p>
			<div class="btn-row">
				<a class="btn btn-primary" href={lh('/login?mode=register')}>{m.settings_create_account()}</a>
				<a class="btn btn-outline" href={lh('/login')}>{m.login_title()}</a>
			</div>
		{/if}
	</section>

	<section class="card">
		<p class="card-eyebrow">{m.settings_theme()}</p>
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

	<section class="card">
		<p class="card-eyebrow">{m.settings_practice_defaults()}</p>
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
		<p class="card-note field--sub">
			{m.settings_split_part_note()}
		</p>
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

	<section class="card">
		<p class="card-eyebrow">{m.settings_playback()}</p>
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

	<section class="card">
		<a class="list-row-link" href={lh('/settings/more')}>
			<span>{m.settings_more()}</span>
			<span class="dim">{m.settings_more_note()}</span>
		</a>
	</section>

	{#if data.user}
		<form method="POST" action="/logout">
			<button class="btn btn-danger btn-block" type="submit">{m.settings_log_out()}</button>
		</form>
	{/if}
</main>

{#if guestJoinCode}
	<!-- A code-guest has no dashboard `BottomNav`'s Home tab would resolve
	     to (it's login-gated) — send them back where they came from instead. -->
	<nav class="bottom-nav">
		<a href={lh(`/join/${guestJoinCode}`)}>{m.settings_back_to_choir()}</a>
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
