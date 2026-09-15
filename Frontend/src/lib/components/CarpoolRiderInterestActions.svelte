<script lang="ts">
	import { enhance } from '$app/forms';
	import { m } from '$lib/paraglide/messages';
	import type { CarpoolPostOut, CarpoolRiderInterestOut } from '$lib/server/backendTypes';
	import CarpoolGuestNamePrompt from './CarpoolGuestNamePrompt.svelte';
	import CarpoolSaveRequiredNotice from './CarpoolSaveRequiredNotice.svelte';

	let {
		post,
		isOwner,
		canPost,
		isGuest,
		myInterest,
		guestNamePromptActive,
		guestNameDraft,
		interestActionBusyId,
		interestActionErrorFor,
		interestActionSaveRequired,
		interestActionError,
		form,
		onGuestNameInput,
		onGuestNameCancel,
		onGuestNameConfirm,
		onStartInterest,
		onReleaseGuestInterest
	}: {
		post: CarpoolPostOut;
		isOwner: boolean;
		canPost: boolean;
		isGuest: boolean;
		myInterest: CarpoolRiderInterestOut | undefined;
		guestNamePromptActive: boolean;
		guestNameDraft: string;
		interestActionBusyId: string | null;
		interestActionErrorFor: string | null;
		interestActionSaveRequired: boolean;
		interestActionError: string;
		form: { form?: string; error?: string } | null;
		onGuestNameInput: (value: string) => void;
		onGuestNameCancel: () => void;
		onGuestNameConfirm: () => void;
		onStartInterest: (postId: string) => void;
		onReleaseGuestInterest: (postId: string, interestId: string) => void;
	} = $props();
</script>

<div class="btn-row">
	{#if myInterest}
		{#if isGuest}
			<button
				type="button"
				class="btn btn-outline"
				disabled={interestActionBusyId === myInterest.id}
				onclick={() => onReleaseGuestInterest(post.id, myInterest.id)}
			>
				{interestActionBusyId === myInterest.id ? m.carpool_releasing() : m.carpool_withdraw_interest()}
			</button>
		{:else}
			<form method="POST" action="?/releaseInterest" use:enhance>
				<input type="hidden" name="interestId" value={myInterest.id} />
				<button type="submit" class="btn btn-outline">{m.carpool_withdraw_interest()}</button>
			</form>
		{/if}
	{:else if !isOwner && canPost && isGuest && guestNamePromptActive}
		<CarpoolGuestNamePrompt
			value={guestNameDraft}
			confirmLabel={m.carpool_im_interested()}
			onInput={onGuestNameInput}
			onCancel={onGuestNameCancel}
			onConfirm={onGuestNameConfirm}
		/>
	{:else if !isOwner && canPost}
		{#if isGuest}
			<button
				type="button"
				class="btn btn-outline"
				disabled={interestActionBusyId === post.id}
				onclick={() => onStartInterest(post.id)}
			>
				{interestActionBusyId === post.id ? m.carpool_expressing_interest() : m.carpool_im_interested()}
			</button>
		{:else}
			<form method="POST" action="?/expressInterest" use:enhance>
				<input type="hidden" name="riderPostId" value={post.id} />
				<button type="submit" class="btn btn-outline">{m.carpool_im_interested()}</button>
			</form>
		{/if}
	{/if}
</div>
{#if isGuest}
	{#if interestActionErrorFor === post.id && interestActionSaveRequired}
		<CarpoolSaveRequiredNotice />
	{:else if interestActionErrorFor === post.id && interestActionError}
		<p class="error">{interestActionError}</p>
	{/if}
{:else if form?.form === `expressInterest:${post.id}` && form?.error}
	<p class="error">{form.error}</p>
{:else if myInterest && form?.form === `releaseInterest:${myInterest.id}` && form?.error}
	<p class="error">{form.error}</p>
{/if}
