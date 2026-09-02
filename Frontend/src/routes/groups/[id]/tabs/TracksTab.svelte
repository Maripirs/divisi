<script lang="ts">
	import { enhance } from '$app/forms';
	import FileSlot from '$lib/components/FileSlot.svelte';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import Disclosure from '$lib/components/Disclosure.svelte';
	import PieceNotesPanel from '$lib/components/PieceNotesPanel.svelte';
	import { getPieceByTitle } from '$lib/pieces/registry';
	import { withSubmitting } from '$lib/utils/enhance';
	import { m } from '$lib/paraglide/messages';
	import { lh } from '$lib/i18n';
	import type { PageData, ActionData } from '../$types';

	let { data, form, mode }: { data: PageData; form: ActionData; mode: 'member' | 'admin' } = $props();

	// Tracks tab (admin only): which track's row (by piece id) has its
	// title/composer/YouTube link/default-tempo/files swapped for the
	// inline edit form — one panel for the whole track, same
	// click-to-reveal pattern as the Members tab's title editor.
	let editingDetailsPieceId = $state<string | null>(null);
	// F20: which track cards have their "Piece Notes" disclosure open, so the
	// notes panel (and its list fetch) only mounts once a card is expanded.
	let notesExpanded = $state<Record<string, boolean>>({});
	let titleEditDraft = $state('');
	let composerEditDraft = $state('');
	let youtubeEditDraft = $state('');
	let tempoEditDraft = $state('');
	let savingDetails = $state(false);
	// F5: Tracks tab (admin only) upload form — click-to-reveal, same pattern
	// as the other create forms on this page.
	let showUploadForm = $state(false);
	let uploadingTrack = $state(false);
	// Client-side mirror of the Backend's "at least one of music/PDF"
	// validation — real enforcement stays server-side (`form?.error`
	// below), this just keeps the submit button honest before that round
	// trip.
	let uploadMusicFiles = $state<FileList | null>(null);
	let uploadPdfFiles = $state<FileList | null>(null);
	let canSubmitUpload = $derived(!!uploadMusicFiles?.length || !!uploadPdfFiles?.length);
	// Tracks tab (admin only): a whole track (every version, distribution,
	// annotation, markup mark on it) is a lot more to lose than one file
	// slot, so unlike the file Remove buttons inside the edit panel (which
	// only take effect on Save), deleting a track is its own explicit
	// click-to-confirm step (see the `ConfirmButton` in the edit panel).
	let deletingTrack = $state(false);

	// Admin sees every distributed track, including ones with no practice
	// file wired up yet (so they know what still needs fixing) — a member
	// just gets nothing to look at for those, since there's nothing they
	// could do about it anyway. F5: a track is practicable either by
	// title-matching a bundled fixture (the old path) or, now, by being a
	// real Backend piece with its own music file/PDF — either is enough.
	let visibleTracks = $derived(
		mode === 'admin'
			? data.tracks
			: data.tracks.filter((track) => getPieceByTitle(track.title) || track.has_music || track.has_pdf)
	);
</script>

{#if mode === 'admin'}
	<p class="tab-meta">{m.groups_shared_count({ count: data.tracks.length })}</p>
{/if}
{#if visibleTracks.length === 0}
	<p class="empty">{m.library_no_tracks()}</p>
{:else}
	{#each visibleTracks as track (track.piece_id)}
		<!-- The bundled-registry title match is only a fallback for a
		     track with nothing of its own wired up yet — once an admin
		     uploads a real music file/PDF/reference link for it (even
		     one that happens to share a bundled piece's title, e.g.
		     "Lacrymosa"), that real content has to win, or every admin
		     edit to it would silently keep playing/showing the bundled
		     fixture instead. Real bug this fixed: the reference-audio
		     picker (F13) always showed disabled for such a track, no
		     matter what the admin set its YouTube link to. -->
		{@const bundled = track.has_music || track.has_pdf ? undefined : getPieceByTitle(track.title)}
		{@const tempoQuery = track.default_tempo_bpm ? `?defaultTempo=${track.default_tempo_bpm}` : ''}
		{@const practiceHref = bundled
			? lh(`/piece/${bundled.id}${tempoQuery}`)
			: track.has_music || track.has_pdf
				? lh(`/piece/${track.piece_id}${tempoQuery}`)
				: null}
		<section class="card track-card">
			<div class="track-card-row">
			<div class="track-info">
				{#if mode === 'admin' && editingDetailsPieceId === track.piece_id}
					<form
						method="POST"
						action="?/updatePieceDetails"
						enctype="multipart/form-data"
						use:enhance={withSubmitting((v) => (savingDetails = v), () => (editingDetailsPieceId = null))}
					>
						<input type="hidden" name="pieceId" value={track.piece_id} />
						<label class="field">
							<span>{m.groups_upload_name()}</span>
							<input name="title" required bind:value={titleEditDraft} />
						</label>
						<label class="field">
							<span>{m.groups_upload_author()}</span>
							<input name="composer" bind:value={composerEditDraft} placeholder={m.groups_optional()} />
						</label>
						<label class="field">
							<span>{m.groups_upload_youtube()}</span>
							<input
								name="youtube_url"
								type="url"
								bind:value={youtubeEditDraft}
								placeholder={m.groups_optional()}
							/>
						</label>
						<label class="field">
							<span>{m.groups_upload_default_tempo()}</span>
							<input name="defaultTempoBpm" type="number" min="1" bind:value={tempoEditDraft} placeholder="e.g. 96" />
						</label>

						<p class="card-eyebrow">{m.groups_edit_attachments()}</p>

						<FileSlot
							label={m.groups_edit_music_file_label()}
							hasCurrent={track.has_music}
							currentName={track.music_file_name ?? m.groups_edit_unnamed_file()}
							currentCaption={m.groups_edit_current_music_file()}
							emptyTitle={m.groups_edit_no_music_added()}
							emptyHint={m.groups_edit_music_hint()}
							addLabel={m.groups_edit_add_music_file_button()}
							inputName="file"
							accept=".mid,.midi,.musicxml,.xml,.mxl"
							removeInputName="remove_file"
						/>

						<FileSlot
							label={m.groups_edit_pdf_file_label()}
							hasCurrent={track.has_pdf}
							currentName={track.pdf_file_name ?? m.groups_edit_unnamed_file()}
							currentCaption={m.groups_edit_current_pdf()}
							emptyTitle={m.groups_edit_no_pdf_added()}
							emptyHint={m.groups_edit_pdf_hint()}
							addLabel={m.groups_edit_add_pdf_button()}
							inputName="pdf_file"
							accept="application/pdf"
							removeInputName="remove_pdf_file"
						/>

						{#if form?.form === 'pieceDetails' && form?.error}
							<p class="error">{form.error}</p>
						{/if}
						<div class="btn-row">
							<button type="submit" class="btn btn-outline" disabled={savingDetails}>
								{savingDetails ? m.groups_uploading() : m.action_save()}
							</button>
							<button
								type="button"
								class="text-link"
								onclick={() => (editingDetailsPieceId = null)}
								disabled={savingDetails}
							>
								{m.action_cancel()}
							</button>
						</div>
					</form>

					<!-- Delete-the-whole-track: a minimal trash icon pinned to the
					     card's top-right corner rather than a button sitting next to
					     Save — those two are one click apart and this is a much more
					     destructive action, so it shouldn't share their weight or
					     row. Its own `<form>` (can't nest inside the one above), and
					     still gated behind a click-to-confirm — the icon alone isn't
					     enough friction for something this hard to undo. Only shown
					     in edit mode, same as the rest of this panel. -->
					<div class="track-delete-corner">
						<ConfirmButton>
							{#snippet trigger(start)}
								<button
									type="button"
									class="piece-action piece-action--sm piece-action--danger"
									onclick={start}
									aria-label={m.groups_delete_track()}
									title={m.groups_delete_track()}
								>
									<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
										<path d="M3 6h18" />
										<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
										<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
										<line x1="10" y1="11" x2="10" y2="17" />
										<line x1="14" y1="11" x2="14" y2="17" />
									</svg>
								</button>
							{/snippet}
							{#snippet confirm(cancel)}
								<form
									method="POST"
									action="?/deleteTrack"
									use:enhance={withSubmitting((v) => (deletingTrack = v), () => (editingDetailsPieceId = null))}
									class="track-delete-corner-form"
								>
									<input type="hidden" name="pieceId" value={track.piece_id} />
									<button
										type="submit"
										class="piece-action piece-action--sm piece-action--danger"
										disabled={deletingTrack}
										aria-label={m.groups_delete()}
										title={m.groups_delete_track_confirm()}
									>
										<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
											<polyline points="20 6 9 17 4 12" />
										</svg>
									</button>
									<button
										type="button"
										class="piece-action piece-action--sm"
										onclick={cancel}
										disabled={deletingTrack}
										aria-label={m.action_cancel()}
										title={m.action_cancel()}
									>
										<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
											<line x1="18" y1="6" x2="6" y2="18" />
											<line x1="6" y1="6" x2="18" y2="18" />
										</svg>
									</button>
								</form>
							{/snippet}
						</ConfirmButton>
					</div>
				{:else}
					<p class="card-title">{track.title}</p>
					{#if track.composer}
						<p class="card-meta">{track.composer}</p>
					{/if}
					{#if mode === 'admin'}
						<p class="card-meta">{m.groups_status({ status: track.version_status })}</p>
						<p class="card-meta track-contents">
							<span class:present={track.has_music}>{track.has_music ? '✓' : '–'} {m.groups_track_has_music()}</span>
							<span class:present={track.has_pdf}>{track.has_pdf ? '✓' : '–'} {m.groups_track_has_pdf()}</span>
							<span class:present={!!track.youtube_url}>
								{track.youtube_url ? '✓' : '–'} {m.groups_track_has_reference()}
							</span>
						</p>
						<p class="card-meta">
							{track.default_tempo_bpm ? m.groups_default_tempo({ bpm: track.default_tempo_bpm }) : m.groups_default_tempo_midi()}
						</p>
						<button
							type="button"
							class="text-link"
							onclick={() => {
								titleEditDraft = track.title;
								composerEditDraft = track.composer ?? '';
								youtubeEditDraft = track.youtube_url ?? '';
								tempoEditDraft = track.default_tempo_bpm ? String(track.default_tempo_bpm) : '';
								editingDetailsPieceId = track.piece_id;
							}}
						>
							{m.groups_edit_details()}
						</button>
					{/if}
				{/if}
				{#if !practiceHref}
					<p class="card-note">
						{m.groups_practice_not_wired_up()}
					</p>
				{/if}
			</div>
			{#if practiceHref}
				<a class="piece-action piece-action--primary" href={practiceHref} aria-label={m.join_open_player()}>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
						<path d="M8 5v14l11-7z" />
					</svg>
				</a>
			{/if}
			</div>
			<!-- F20: expand a track to read/manage this piece's notes without
			     opening the player. -->
			<Disclosure
				variant="inline"
				bind:open={
					() => notesExpanded[track.piece_id] ?? false,
					(v) => (notesExpanded[track.piece_id] = v)
				}
			>
				{#snippet summary()}{m.piece_notes_title()}{/snippet}
				{#snippet children()}
					{#if notesExpanded[track.piece_id]}
						<PieceNotesPanel
							pieceId={track.piece_id}
							groupId={data.group.id}
							canManage={mode === 'admin'}
							chrome="bare"
						/>
					{/if}
				{/snippet}
			</Disclosure>
		</section>
	{/each}
{/if}
{#if mode === 'admin'}
	{#if showUploadForm}
		<section class="card">
			<p class="card-eyebrow">{m.groups_upload_track()}</p>
			<form
				method="POST"
				action="?/uploadTrack"
				enctype="multipart/form-data"
				use:enhance={withSubmitting((v) => (uploadingTrack = v), () => (showUploadForm = false))}
			>
				<label class="field">
					<span>{m.groups_upload_name()}</span>
					<input name="title" required />
				</label>
				<label class="field">
					<span>{m.groups_upload_author()}</span>
					<input name="composer" placeholder={m.groups_optional()} />
				</label>
				<FileSlot
					label={m.groups_edit_music_file_label()}
					hasCurrent={false}
					currentName={null}
					currentCaption={m.groups_edit_current_music_file()}
					emptyTitle={m.groups_edit_no_music_added()}
					emptyHint={m.groups_edit_music_hint()}
					addLabel={m.groups_edit_add_music_file_button()}
					inputName="file"
					accept=".mid,.midi,.musicxml,.xml,.mxl"
					bind:files={uploadMusicFiles}
				/>
				<FileSlot
					label={m.groups_edit_pdf_file_label()}
					hasCurrent={false}
					currentName={null}
					currentCaption={m.groups_edit_current_pdf()}
					emptyTitle={m.groups_edit_no_pdf_added()}
					emptyHint={m.groups_edit_pdf_hint()}
					addLabel={m.groups_edit_add_pdf_button()}
					inputName="pdf_file"
					accept="application/pdf"
					bind:files={uploadPdfFiles}
				/>
				{#if !canSubmitUpload}
					<p class="card-note">{m.upload_provide_file_or_pdf()}</p>
				{/if}
				<label class="field">
					<span>{m.groups_upload_default_tempo()}</span>
					<input name="default_tempo_bpm" type="number" min="1" placeholder="e.g. 96" />
				</label>
				<label class="field">
					<span>{m.groups_upload_youtube()}</span>
					<input name="youtube_url" type="url" placeholder={m.groups_optional()} />
				</label>
				{#if form?.form === 'uploadTrack' && form?.error}
					<p class="error">{form.error}</p>
				{/if}
				<div class="btn-row">
					<button class="btn btn-primary" type="submit" disabled={uploadingTrack || !canSubmitUpload}>
						{uploadingTrack ? m.groups_uploading() : m.groups_upload_and_share()}
					</button>
					<button
						type="button"
						class="text-link"
						onclick={() => (showUploadForm = false)}
						disabled={uploadingTrack}
					>
						{m.action_cancel()}
					</button>
				</div>
			</form>
		</section>
	{:else}
		<div class="btn-row">
			<button type="button" class="btn btn-outline" onclick={() => (showUploadForm = true)}>
				{m.groups_upload_track_button()}
			</button>
		</div>
	{/if}
{/if}

<style>
	.tab-meta {
		margin: -0.4rem 0 0;
		font-size: 0.8125rem;
		color: var(--text-muted);
	}

	.track-contents {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
	}

	.track-contents span {
		color: var(--text-muted);
	}

	.track-contents span.present {
		color: var(--text);
	}

	/* Base `.track-card` layout + `.track-info` + `.piece-action*` live in
	   shell.css as a flex row. F20 made the card a column — the original
	   info+play row (`.track-card-row`), then an optional "Piece Notes"
	   disclosure below it — so these override shell's row rules. */
	.track-card {
		position: relative;
		flex-direction: column;
		align-items: stretch;
	}

	.track-card-row {
		display: flex;
		flex-direction: row;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	/* The track-card "Piece Notes" disclosure is `Disclosure.svelte`
	   (`variant="inline"`) — divider, chevron, and marker reset all live
	   there now. */

	.track-delete-corner {
		position: absolute;
		top: 0.6rem;
		right: 0.6rem;
		display: flex;
		gap: 0.35rem;
	}

	.track-delete-corner-form {
		display: flex;
		gap: 0.35rem;
	}
</style>
