<script lang="ts">
	import { onMount } from 'svelte';
	import { m } from '$lib/paraglide/messages';
	import { renderNoteMarkdown } from '$lib/utils/noteMarkdown';
	import { formatDateTime } from '$lib/utils/dates';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import Disclosure from '$lib/components/Disclosure.svelte';
	import {
		createGroupNote,
		createPersonalNote,
		deleteGroupNote,
		deletePersonalNote,
		listGroupNotes,
		listPersonalNotes,
		updateGroupNote,
		updatePersonalNote,
		PieceNoteApiError,
		type PieceNote,
		type PieceNoteSource
	} from '$lib/api/pieceNotes';

	/** F20: the "Piece Notes" panel — short text notes pinned to a piece,
	 * shown on the piece page and inside an expanded track card on a group's
	 * Rehearsal Tracks tab. Two sources, kept visually distinct:
	 *
	 *  - **From the director** — group-wide, admin-authored (Backend B16).
	 *    Members read-only; solid accent left-edge.
	 *  - **My notes** — the signed-in member's own private note (Backend B5
	 *    annotation, position-less). Always editable by its owner; dashed
	 *    muted left-edge.
	 *
	 * `canManage` = this caller can write the *group's* notes (a group
	 * admin). `chrome`: `'details'` (default) wraps the content in its own
	 * collapsible `<details>`, starting collapsed and height-capped so it
	 * never crowds the player; `'bare'` renders just the content, for a
	 * caller that already owns the disclosure.
	 *
	 * All classes are `pn-`-prefixed: a bare `.note` collides with a
	 * centered global in `shell.css`. */
	let {
		pieceId,
		groupId,
		canManage = false,
		chrome = 'details'
	}: {
		pieceId: string;
		groupId: string;
		canManage?: boolean;
		chrome?: 'details' | 'bare';
	} = $props();

	let groupNotes = $state<PieceNote[]>([]);
	let personalNotes = $state<PieceNote[]>([]);
	let loaded = $state(false);
	/** 403/404 on the group list — the group's Weekly Notes page is disabled
	 * for members. Hide just the director section, not the whole panel
	 * (personal notes don't depend on it). */
	let groupUnavailable = $state(false);
	let groupFailed = $state(false);
	let personalFailed = $state(false);

	/** `null` = not editing; otherwise which section + which note (`'new'`
	 * for the add form). */
	let editing = $state<{ scope: PieceNoteSource; id: string | 'new' } | null>(null);
	let draft = $state('');
	let saving = $state(false);
	let saveError = $state<string | null>(null);

	/** Note ids whose body the reader has expanded past the 4-line clamp. A
	 * long note would otherwise stretch its grid row and strand the short
	 * notes beside it above a wall of whitespace. */
	let expanded = $state<Record<string, boolean>>({});

	function isLong(body: string): boolean {
		return body.length > 140 || body.split('\n').length > 3;
	}

	onMount(async () => {
		await Promise.all([loadGroup(), loadPersonal()]);
		loaded = true;
	});

	async function loadGroup() {
		try {
			groupNotes = await listGroupNotes(pieceId, groupId);
		} catch (err) {
			if (err instanceof PieceNoteApiError && (err.status === 403 || err.status === 404)) {
				groupUnavailable = true;
			} else {
				groupFailed = true;
			}
		}
	}

	async function loadPersonal() {
		try {
			personalNotes = await listPersonalNotes(pieceId);
		} catch {
			personalFailed = true;
		}
	}

	function isEditing(scope: PieceNoteSource, id: string | 'new'): boolean {
		return editing?.scope === scope && editing.id === id;
	}

	function startEdit(scope: PieceNoteSource, note: PieceNote) {
		draft = note.body;
		saveError = null;
		editing = { scope, id: note.id };
	}

	function startAdd(scope: PieceNoteSource) {
		draft = '';
		saveError = null;
		editing = { scope, id: 'new' };
	}

	function cancel() {
		editing = null;
		saveError = null;
	}

	async function save() {
		if (!editing || saving) return;
		const text = draft.trim();
		if (text === '') {
			saveError = m.piece_notes_body_required();
			return;
		}
		const { scope, id } = editing;
		saving = true;
		saveError = null;
		try {
			if (scope === 'group') {
				if (id === 'new') groupNotes = [...groupNotes, await createGroupNote(pieceId, groupId, text)];
				else {
					const u = await updateGroupNote(pieceId, id, text);
					groupNotes = groupNotes.map((n) => (n.id === u.id ? u : n));
				}
			} else {
				if (id === 'new') personalNotes = [...personalNotes, await createPersonalNote(pieceId, text)];
				else {
					const u = await updatePersonalNote(pieceId, id, text);
					personalNotes = personalNotes.map((n) => (n.id === u.id ? u : n));
				}
			}
			editing = null;
		} catch (err) {
			saveError = err instanceof PieceNoteApiError ? err.message : m.errors_could_not_reach_server();
		} finally {
			saving = false;
		}
	}

	async function remove(scope: PieceNoteSource, id: string) {
		try {
			if (scope === 'group') {
				await deleteGroupNote(pieceId, id);
				groupNotes = groupNotes.filter((n) => n.id !== id);
			} else {
				await deletePersonalNote(pieceId, id);
				personalNotes = personalNotes.filter((n) => n.id !== id);
			}
			if (editing?.scope === scope && editing.id === id) editing = null;
		} catch (err) {
			saveError = err instanceof PieceNoteApiError ? err.message : m.errors_could_not_reach_server();
		}
	}

	const total = $derived(groupNotes.length + personalNotes.length);
</script>

{#if chrome === 'details'}
	<Disclosure variant="panel">
		{#snippet summary()}
			{m.piece_notes_title()}
			{#if loaded}<span class="pn-count">{total}</span>{/if}
		{/snippet}
		{#snippet children()}{@render content(true)}{/snippet}
	</Disclosure>
{:else}
	<div class="pn-bare">{@render content(false)}</div>
{/if}

{#snippet content(capped: boolean)}
	<div class="pn-body" class:pn-body--capped={capped}>
		{#if !loaded}
			<p class="pn-muted">{m.piece_notes_loading()}</p>
		{:else}
			{#if !groupUnavailable}
				{@render section('group', m.piece_notes_from_director(), groupNotes, groupFailed, canManage)}
			{/if}
			{@render section('personal', m.piece_notes_mine(), personalNotes, personalFailed, true)}
		{/if}
	</div>
{/snippet}

{#snippet section(
	scope: PieceNoteSource,
	label: string,
	list: PieceNote[],
	failed: boolean,
	canWrite: boolean
)}
	<section class="pn-section pn-section--{scope}">
		<div class="pn-section-head">
			<p class="pn-label">{label}</p>
			{#if canWrite && !isEditing(scope, 'new')}
				<button
					type="button"
					class="pn-add"
					onclick={() => startAdd(scope)}
					aria-label={m.piece_notes_add()}
					title={m.piece_notes_add()}>+</button
				>
			{/if}
		</div>

		{#if isEditing(scope, 'new')}
			{@render editor()}
		{/if}

		{#if failed}
			<p class="pn-muted">{m.piece_notes_load_error()}</p>
		{:else if list.length === 0 && !isEditing(scope, 'new')}
			<p class="pn-muted">{m.piece_notes_empty()}</p>
		{/if}

		{#if list.length > 0}
			<ul class="pn-notes">
				{#each list as note (note.id)}
					{@const long = isLong(note.body)}
					<li
						class="pn-note pn-note--{scope}"
						class:pn-note--wide={isEditing(scope, note.id) || (long && expanded[note.id])}
					>
						{#if isEditing(scope, note.id)}
							{@render editor()}
						{:else}
							<div class="pn-md" class:pn-md--clamp={long && !expanded[note.id]}>
								{@html renderNoteMarkdown(note.body)}
							</div>
							{#if long}
								<button
									type="button"
									class="pn-link pn-more"
									onclick={() => (expanded[note.id] = !expanded[note.id])}
								>
									{expanded[note.id] ? m.piece_notes_less() : m.piece_notes_more()}
								</button>
							{/if}
							<div class="pn-foot">
								<time class="pn-time" datetime={note.createdAt}>{formatDateTime(note.createdAt)}</time>
								{#if canWrite}
									<span class="pn-acts">
										<button type="button" class="pn-link" onclick={() => startEdit(scope, note)}
											>{m.piece_notes_edit()}</button
										>
										<ConfirmButton>
											{#snippet trigger(start)}
												<button type="button" class="pn-link danger" onclick={start}
													>{m.piece_notes_delete()}</button
												>
											{/snippet}
											{#snippet confirm(dismiss)}
												<span class="pn-confirm">
													<button type="button" class="pn-link" onclick={dismiss}
														>{m.piece_notes_cancel()}</button
													>
													<button type="button" class="pn-link danger" onclick={() => remove(scope, note.id)}
														>{m.piece_notes_delete()}</button
													>
												</span>
											{/snippet}
										</ConfirmButton>
									</span>
								{/if}
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>
{/snippet}

{#snippet editor()}
	<form
		class="pn-form"
		onsubmit={(e) => {
			e.preventDefault();
			void save();
		}}
	>
		<textarea
			rows="2"
			bind:value={draft}
			placeholder={m.piece_notes_placeholder()}
			aria-label={m.piece_notes_title()}
		></textarea>
		{#if saveError}<p class="pn-err">{saveError}</p>{/if}
		<div class="pn-form-acts">
			<button type="button" class="pn-link" onclick={cancel}>{m.piece_notes_cancel()}</button>
			<button type="submit" class="pn-save" disabled={saving}>
				{saving ? m.piece_notes_saving() : m.piece_notes_save()}
			</button>
		</div>
	</form>
{/snippet}

<style>
	/* The `details` chrome (border, padding, chevron, marker reset) is
	   `Disclosure.svelte` (`variant="panel"`). This file styles only the
	   panel body and its notes. */

	.pn-bare {
		text-align: left;
	}

	.pn-count {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 1.35rem;
		height: 1.35rem;
		padding: 0 0.4rem;
		border-radius: var(--radius-full);
		background: var(--surface-2);
		color: var(--text-muted);
		font-size: 0.76rem;
	}

	.pn-body {
		padding: 0 0.8rem 0.7rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		text-align: left;
	}

	/* On the piece player the panel shares the screen with the score/PDF:
	   keep it a short strip that scrolls, never a wall that shoves the music
	   down. The bare variant (a group's Tracks card) has room to grow. */
	.pn-body--capped {
		max-height: min(45vh, 14rem);
		overflow-y: auto;
	}

	.pn-bare .pn-body {
		padding: 0;
	}

	.pn-section {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.pn-section-head {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.pn-label {
		margin: 0;
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-weight: 700;
	}

	.pn-section--group .pn-label {
		color: var(--accent);
	}

	.pn-section--personal .pn-label {
		color: var(--text-muted);
	}

	.pn-add {
		flex: 0 0 auto;
		width: 1.2rem;
		height: 1.2rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--border);
		border-radius: 5px;
		background: var(--surface);
		color: var(--accent);
		font-size: 0.95rem;
		line-height: 1;
		cursor: pointer;
	}

	.pn-muted {
		margin: 0;
		color: var(--text-muted);
		font-size: 0.82rem;
	}

	.pn-notes {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 15rem), 1fr));
		gap: 0.4rem;
		align-items: start;
	}

	.pn-note {
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: 0.4rem 0.55rem;
		background: var(--surface-2);
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	/* An in-place editor, or a note expanded past the clamp, needs the full
	   width rather than a 15rem grid cell. */
	.pn-note--wide {
		grid-column: 1 / -1;
	}

	.pn-note--group {
		border-left: 3px solid var(--accent);
	}

	.pn-note--personal {
		border-left: 3px dashed var(--text-muted);
	}

	.pn-md {
		font-size: 0.86rem;
		line-height: 1.4;
		overflow-wrap: anywhere;
	}

	.pn-md--clamp {
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 4;
		line-clamp: 4;
		overflow: hidden;
	}

	.pn-more {
		align-self: flex-start;
	}

	.pn-md :global(p) {
		margin: 0 0 0.3rem;
	}

	.pn-md :global(p:last-child) {
		margin-bottom: 0;
	}

	.pn-md :global(ul) {
		margin: 0;
		padding-left: 1.05rem;
	}

	.pn-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.pn-time {
		font-size: 0.7rem;
		color: var(--text-muted);
	}

	.pn-acts,
	.pn-confirm {
		display: inline-flex;
		align-items: center;
		gap: 0.6rem;
	}

	.pn-link {
		background: none;
		border: none;
		padding: 0;
		font: inherit;
		font-size: 0.78rem;
		color: var(--accent);
		cursor: pointer;
	}

	.pn-link.danger {
		color: var(--danger);
	}

	.pn-form {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.pn-form textarea {
		font: inherit;
		font-size: 0.86rem;
		color: var(--text);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: 0.35rem 0.45rem;
		resize: vertical;
	}

	.pn-err {
		margin: 0;
		color: var(--danger);
		font-size: 0.78rem;
	}

	.pn-form-acts {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.pn-save {
		border: none;
		background: var(--accent);
		color: var(--accent-contrast);
		border-radius: var(--radius-md);
		padding: 0.35rem 0.8rem;
		font-size: 0.8rem;
		cursor: pointer;
	}

	.pn-save:disabled {
		opacity: 0.6;
		cursor: default;
	}
</style>
