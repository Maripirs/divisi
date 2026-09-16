import { fail } from '@sveltejs/kit';
import { PUBLIC_API_BASE_URL } from '$env/static/public';
import { backendFetch, BackendApiError } from '$lib/server/backend';
import { m } from '$lib/paraglide/messages';
import type { Actions } from '../$types';
import { runAction } from './_shared';

export const trackActions = {
	// Admin-only. One panel, one action, for everything the Tracks tab used
	// to split across a title/composer/YouTube editor and a separate
	// default-tempo editor: title/composer/youtube_url/default_tempo_bpm go
	// to `PATCH /library/pieces/{id}` as a full replace (blank
	// composer/youtube_url/tempo clears them — same "Reset to default"
	// tempo the player uses, see `piece/[id]/+page.svelte`). A newly chosen
	// music file and/or PDF go through the same
	// upload → submit → approve → distribute chain as `uploadTrack` below,
	// so picking just one of the two file inputs replaces only that file —
	// the Backend's `upload_version` carries the untouched slot forward.
	updatePieceDetails: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const pieceId = String(form.get('pieceId') ?? '');
		const title = String(form.get('title') ?? '').trim();
		const composer = String(form.get('composer') ?? '').trim();
		const youtubeUrl = String(form.get('youtube_url') ?? '').trim();
		const tempoRaw = String(form.get('defaultTempoBpm') ?? '').trim();
		const presentation = String(form.get('presentation') ?? '').trim();
		if (!pieceId) return fail(400, { error: m.groups_missing_track(), form: 'pieceDetails' });
		if (!title) return fail(400, { error: m.groups_upload_name_required(), form: 'pieceDetails' });
		const defaultTempoBpm = tempoRaw ? Number(tempoRaw) : null;
		if (tempoRaw && (!Number.isFinite(defaultTempoBpm) || defaultTempoBpm! <= 0)) {
			return fail(400, { error: m.groups_enter_valid_tempo(), form: 'pieceDetails' });
		}
		if (presentation && presentation !== 'score_reference' && presentation !== 'play_along') {
			return fail(400, { error: m.groups_invalid_presentation(), form: 'pieceDetails' });
		}

		const musicFile = form.get('file');
		const pdfFile = form.get('pdf_file');
		const hasMusic = musicFile instanceof File && musicFile.size > 0;
		const hasPdf = pdfFile instanceof File && pdfFile.size > 0;
		// The edit panel's file cards' "Remove" — a hidden `'1'`/`''` field per
		// slot, set only when that slot's Remove button was actually clicked
		// (see `+page.svelte`'s file-slot markup). Ignored for a slot that
		// also got a new file this same submit — picking a replacement always
		// wins over an earlier Remove click.
		const removeMusic = form.get('remove_file') === '1' && !hasMusic;
		const removePdf = form.get('remove_pdf_file') === '1' && !hasPdf;

		return runAction('pieceDetails', async () => {
			await backendFetch(
				locals.token,
				`/library/pieces/${pieceId}`,
				{
					method: 'PATCH',
					body: JSON.stringify({
						title,
						composer: composer || null,
						youtube_url: youtubeUrl || null,
						default_tempo_bpm: defaultTempoBpm,
						presentation: presentation || null
					})
				},
				fetch
			);

			if (hasMusic || hasPdf || removeMusic || removePdf) {
				const versionBody = new FormData();
				if (hasMusic) versionBody.set('file', musicFile);
				if (hasPdf) versionBody.set('pdf_file', pdfFile);
				if (removeMusic) versionBody.set('remove_file', 'true');
				if (removePdf) versionBody.set('remove_pdf_file', 'true');
				// Raw `fetch` (not `backendFetch`) for the multipart body — its
				// failures are re-thrown as `BackendApiError` so runAction's
				// catch turns them into the same `fail(status, …)` as before.
				let versionRes: Response;
				try {
					versionRes = await fetch(`${PUBLIC_API_BASE_URL}/library/pieces/${pieceId}/versions`, {
						method: 'POST',
						headers: { Authorization: `Bearer ${locals.token}` },
						body: versionBody
					});
				} catch {
					throw new BackendApiError(503, m.errors_could_not_reach_server());
				}
				if (!versionRes.ok) {
					const body = (await versionRes.json().catch(() => ({}))) as { detail?: string };
					throw new BackendApiError(versionRes.status, body.detail ?? m.upload_failed({ status: versionRes.status }));
				}
				const versionId = (await versionRes.json()).id as string;
				await backendFetch(locals.token, `/library/versions/${versionId}/submit`, { method: 'POST' }, fetch);
				await backendFetch(locals.token, `/library/versions/${versionId}/approve`, { method: 'POST' }, fetch);
				await backendFetch(
					locals.token,
					`/library/pieces/${pieceId}/versions/${versionId}/distribute`,
					{ method: 'POST' },
					fetch
				);
			}
		});
	},

	// Admin-only: generates sung-lyric data from the track's PDF text
	// layer and injects it into its music file's MusicXML, immediately
	// publishing the result as the track's new live version — same
	// submit -> approve -> distribute-in-one-step shape as the Backend's
	// other "admin clicks a button, gets an improved version" actions
	// above, since this only ever adds `<lyric>` elements on top of
	// already-approved note/rhythm data (see the Backend route's own doc
	// comment, `app/api/routes/library/lyrics.py`). MusicXML-sourced
	// pieces with a real PDF text layer only; the Backend 400s with a
	// specific message otherwise (MIDI-sourced, no PDF, scanned PDF, ...)
	// which surfaces here exactly like any other `form?.error`.
	generateLyrics: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const pieceId = String(form.get('pieceId') ?? '');
		if (!pieceId) return fail(400, { error: m.groups_missing_track(), form: 'generateLyrics' });

		return runAction('generateLyrics', () =>
			backendFetch(
				locals.token,
				`/library/pieces/${pieceId}/generate-lyrics`,
				{
					method: 'POST',
					// `backendFetch`'s default 20s timeout (right for every other
					// call in this file) is far too short here: the Backend
					// paces its Groq calls per page against the account's real
					// free-tier rate limit, which measured ~130s end to end for
					// a 15-page piece and scales with page count. Hit the
					// default timeout for real testing this against a real
					// multi-page piece ("Couldn't reach the server" even though
					// the Backend was still working) before adding this.
					// Widened from 5 to 7 minutes once the Backend grew an
					// NVIDIA fallback for when Groq's rate limit (or daily
					// quota) blocks it: NVIDIA's own per-request latency is
					// much higher (measured ~170s for a whole piece in one
					// call), so the worst case now stacks a Groq retry
					// (~35s) plus that NVIDIA call (up to 240s) on top of
					// this action's own baseline.
					signal: AbortSignal.timeout(7 * 60 * 1000)
				},
				fetch
			)
		);
	},

	// Admin-only, `DELETE /library/pieces/{id}` — the whole track, not just
	// one of its files (that's the `remove_file`/`remove_pdf_file` flags on
	// `updatePieceDetails` above). Every version, distribution, annotation,
	// and markup mark on it goes with it — see the Backend's `delete_piece`
	// for exactly what that cleans up.
	deleteTrack: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const pieceId = String(form.get('pieceId') ?? '');
		if (!pieceId) return fail(400, { error: m.groups_missing_track(), form: 'deleteTrack' });

		return runAction('deleteTrack', () =>
			backendFetch(locals.token, `/library/pieces/${pieceId}`, { method: 'DELETE' }, fetch)
		);
	},

	// F5, admin-only: uploads a real track (music file, PDF, or both) and
	// immediately makes it visible on this group's Tracks tab. Posts
	// straight to the Backend rather than through `backendFetch` — that
	// helper force-sets `Content-Type: application/json` whenever a body is
	// present, but a multipart body needs the browser/fetch's own generated
	// `multipart/form-data; boundary=...` header instead. Chains
	// submit → approve → distribute on the new version automatically: the
	// uploading admin already has review authority over their own group's
	// content, so this collapses what would otherwise be 4 manual calls
	// into "upload and it's on the Tracks tab".
	uploadTrack: async ({ request, locals, fetch, params }) => {
		const form = await request.formData();
		const musicFile = form.get('file');
		const pdfFile = form.get('pdf_file');
		const hasMusic = musicFile instanceof File && musicFile.size > 0;
		const hasPdf = pdfFile instanceof File && pdfFile.size > 0;
		if (!hasMusic && !hasPdf) {
			return fail(400, { error: m.upload_provide_file_or_pdf(), form: 'uploadTrack' });
		}

		const uploadBody = new FormData();
		uploadBody.set('title', String(form.get('title') ?? ''));
		uploadBody.set('owner_type', 'group');
		uploadBody.set('group_id', params.id);
		const composer = String(form.get('composer') ?? '').trim();
		if (composer) uploadBody.set('composer', composer);
		const youtubeUrl = String(form.get('youtube_url') ?? '').trim();
		if (youtubeUrl) uploadBody.set('youtube_url', youtubeUrl);
		const defaultTempoBpm = String(form.get('default_tempo_bpm') ?? '').trim();
		if (defaultTempoBpm) uploadBody.set('default_tempo_bpm', defaultTempoBpm);
		if (hasMusic) uploadBody.set('file', musicFile);
		if (hasPdf) uploadBody.set('pdf_file', pdfFile);

		return runAction('uploadTrack', async () => {
			// Raw `fetch` (not `backendFetch`) for the multipart body — its
			// failures are re-thrown as `BackendApiError` so runAction's catch
			// turns them into the same `fail(status, …)` as before.
			let uploadRes: Response;
			try {
				uploadRes = await fetch(`${PUBLIC_API_BASE_URL}/library/pieces`, {
					method: 'POST',
					headers: { Authorization: `Bearer ${locals.token}` },
					body: uploadBody
				});
			} catch {
				throw new BackendApiError(503, m.errors_could_not_reach_server());
			}
			if (!uploadRes.ok) {
				const body = (await uploadRes.json().catch(() => ({}))) as { detail?: string };
				throw new BackendApiError(uploadRes.status, body.detail ?? m.upload_failed({ status: uploadRes.status }));
			}
			const uploaded = (await uploadRes.json()) as { piece: { id: string }; version: { id: string } };
			const versionId = uploaded.version.id;

			await backendFetch(locals.token, `/library/versions/${versionId}/submit`, { method: 'POST' }, fetch);
			await backendFetch(locals.token, `/library/versions/${versionId}/approve`, { method: 'POST' }, fetch);
			await backendFetch(
				locals.token,
				`/library/pieces/${uploaded.piece.id}/versions/${versionId}/distribute`,
				{ method: 'POST' },
				fetch
			);
		});
	}
} satisfies Actions;
