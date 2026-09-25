<script lang="ts">
	import { enhance } from '$app/forms';
	import { m } from '$lib/paraglide/messages';
	import type { CarpoolPostOut, CarpoolPostStatus } from '$lib/server/backendTypes';
	import ConfirmButton from './ConfirmButton.svelte';

	let {
		post,
		isOwner,
		isAdmin,
		form,
		onEdit,
		onOptimisticDelete,
		onOptimisticRestore,
		onOptimisticStatus
	}: {
		post: CarpoolPostOut;
		isOwner: boolean;
		isAdmin: boolean;
		form: { form?: string; error?: string } | null;
		onEdit: (post: CarpoolPostOut) => void;
		/** Mutates `CarpoolBoard`'s shared `posts` state immediately, before
		 * `deleteCarpoolPost`/`moderateCarpoolPost`'s round trip resolves.
		 * `onOptimisticRestore` re-adds the whole post back on a failed
		 * delete (there's no partial-delete state to revert instead). */
		onOptimisticDelete: (postId: string) => void;
		onOptimisticRestore: (post: CarpoolPostOut) => void;
		onOptimisticStatus: (postId: string, status: CarpoolPostStatus) => void;
	} = $props();
</script>

{#if isOwner || isAdmin}
	<div class="btn-row">
		{#if isOwner}
			<button type="button" class="text-link" onclick={() => onEdit(post)}>{m.drawer_edit()}</button>
		{:else if isAdmin}
			<form
				method="POST"
				action="?/moderateCarpoolPost"
				use:enhance={() => {
					const nextStatus: CarpoolPostStatus = post.status === 'hidden' ? 'open' : 'hidden';
					const previousStatus = post.status;
					onOptimisticStatus(post.id, nextStatus);
					return async ({ result, update }) => {
						if (result.type !== 'success') onOptimisticStatus(post.id, previousStatus);
						await update();
					};
				}}
			>
				<input type="hidden" name="postId" value={post.id} />
				<input type="hidden" name="status" value={post.status === 'hidden' ? 'open' : 'hidden'} />
				<button type="submit" class="text-link">
					{post.status === 'hidden' ? m.carpool_unhide_post() : m.carpool_hide_post()}
				</button>
			</form>
			<ConfirmButton>
				{#snippet trigger(start)}
					<button type="button" class="text-link text-link--danger" onclick={start}>{m.carpool_delete_post()}</button>
				{/snippet}
				{#snippet confirm(cancel)}
					<p class="card-note">{m.carpool_delete_post_confirm()}</p>
					<div class="btn-row">
						<button type="button" class="btn btn-outline" onclick={cancel}>{m.action_cancel()}</button>
						<form
							method="POST"
							action="?/deleteCarpoolPost"
							use:enhance={() => {
								onOptimisticDelete(post.id);
								return async ({ result, update }) => {
									if (result.type !== 'success') onOptimisticRestore(post);
									await update();
								};
							}}
						>
							<input type="hidden" name="postId" value={post.id} />
							<button type="submit" class="btn btn-danger">{m.carpool_delete_post()}</button>
						</form>
					</div>
				{/snippet}
			</ConfirmButton>
		{/if}
	</div>
{/if}
{#if (isOwner || isAdmin) && form?.form === 'editPost' && form?.error}
	<p class="error">{form.error}</p>
{/if}
