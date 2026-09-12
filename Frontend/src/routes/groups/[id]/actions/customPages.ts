import { fail } from '@sveltejs/kit';
import { backendFetch } from '$lib/server/backend';
import { m } from '$lib/paraglide/messages';
import type { PageAudience, PageMinIdentity } from '$lib/server/backendTypes';
import type { Actions } from '../$types';
import { runAction } from './_shared';

function readVisibility(form: FormData): { audience: PageAudience; min_identity: PageMinIdentity } {
	return {
		audience: form.get('audience') === 'everyone' ? 'everyone' : 'members',
		min_identity: form.get('minIdentity') === 'saved' ? 'saved' : 'anyone'
	};
}

export const customPageActions = {
	// Admin-only. `template_key` is always `carpool_board` today (the one
	// value `GroupCustomPageTemplate` has), but still read from the form
	// rather than hardcoded here, since the create form is where a second
	// template's choice would show up first.
	createCustomPage: async ({ request, locals, fetch, params }) => {
		const form = await request.formData();
		const title = String(form.get('title') ?? '').trim();
		const templateKey = String(form.get('templateKey') ?? 'carpool_board');
		if (!title) return fail(400, { error: m.pages_enter_title(), form: 'createPage' });

		return runAction('createPage', () =>
			backendFetch(
				locals.token,
				`/groups/${params.id}/custom-pages`,
				{ method: 'POST', body: JSON.stringify({ title, template_key: templateKey, ...readVisibility(form) }) },
				fetch
			)
		);
	},

	// Title + visibility, same partial-patch shape as `updatePageSettings`'s
	// per-page rows but for one page at a time (`GroupCustomPageUpdate`
	// accepts a `status` too, but that only ever comes from the dedicated
	// publish/unpublish/archive actions below, not this edit form).
	updateCustomPage: async ({ request, locals, fetch, params }) => {
		const form = await request.formData();
		const pageId = String(form.get('pageId') ?? '');
		const title = String(form.get('title') ?? '').trim();
		if (!pageId || !title) return fail(400, { error: m.pages_enter_title(), form: 'editPage' });

		return runAction('editPage', () =>
			backendFetch(
				locals.token,
				`/groups/${params.id}/custom-pages/${pageId}`,
				{ method: 'PATCH', body: JSON.stringify({ title, ...readVisibility(form) }) },
				fetch
			)
		);
	},

	publishCustomPage: async ({ request, locals, fetch, params }) => {
		const form = await request.formData();
		const pageId = String(form.get('pageId') ?? '');
		if (!pageId) return fail(400, { error: m.pages_missing_page(), form: 'pageStatus' });

		return runAction('pageStatus', () =>
			backendFetch(locals.token, `/groups/${params.id}/custom-pages/${pageId}/publish`, { method: 'POST' }, fetch)
		);
	},

	// No dedicated `/unpublish` route on the Backend (see B23's own design
	// note): moving a page back to draft is just a `PATCH` with
	// `status: "draft"`, same generic partial-update route `updateCustomPage`
	// uses above.
	unpublishCustomPage: async ({ request, locals, fetch, params }) => {
		const form = await request.formData();
		const pageId = String(form.get('pageId') ?? '');
		if (!pageId) return fail(400, { error: m.pages_missing_page(), form: 'pageStatus' });

		return runAction('pageStatus', () =>
			backendFetch(
				locals.token,
				`/groups/${params.id}/custom-pages/${pageId}`,
				{ method: 'PATCH', body: JSON.stringify({ status: 'draft' }) },
				fetch
			)
		);
	},

	archiveCustomPage: async ({ request, locals, fetch, params }) => {
		const form = await request.formData();
		const pageId = String(form.get('pageId') ?? '');
		if (!pageId) return fail(400, { error: m.pages_missing_page(), form: 'pageStatus' });

		return runAction('pageStatus', () =>
			backendFetch(locals.token, `/groups/${params.id}/custom-pages/${pageId}/archive`, { method: 'POST' }, fetch)
		);
	},

	deleteCustomPage: async ({ request, locals, fetch, params }) => {
		const form = await request.formData();
		const pageId = String(form.get('pageId') ?? '');
		if (!pageId) return fail(400, { error: m.pages_missing_page(), form: 'editPage' });

		return runAction('editPage', () =>
			backendFetch(locals.token, `/groups/${params.id}/custom-pages/${pageId}`, { method: 'DELETE' }, fetch)
		);
	}
} satisfies Actions;
