<script lang="ts">
	import { enhance } from '$app/forms';
	import { m } from '$lib/paraglide/messages';
	import type { CarpoolPostOut, CarpoolSeatClaimOut } from '$lib/server/backendTypes';
	import CarpoolGuestNamePrompt from './CarpoolGuestNamePrompt.svelte';
	import CarpoolSaveRequiredNotice from './CarpoolSaveRequiredNotice.svelte';

	let {
		post,
		isOwner,
		canPost,
		isGuest,
		myClaim,
		guestNamePromptActive,
		guestNameDraft,
		claimActionBusyId,
		claimActionErrorFor,
		claimActionSaveRequired,
		claimActionError,
		form,
		onGuestNameInput,
		onGuestNameCancel,
		onGuestNameConfirm,
		onStartClaim,
		onReleaseGuestClaim
	}: {
		post: CarpoolPostOut;
		isOwner: boolean;
		canPost: boolean;
		isGuest: boolean;
		myClaim: CarpoolSeatClaimOut | undefined;
		guestNamePromptActive: boolean;
		guestNameDraft: string;
		claimActionBusyId: string | null;
		claimActionErrorFor: string | null;
		claimActionSaveRequired: boolean;
		claimActionError: string;
		form: { form?: string; error?: string } | null;
		onGuestNameInput: (value: string) => void;
		onGuestNameCancel: () => void;
		onGuestNameConfirm: () => void;
		onStartClaim: (postId: string) => void;
		onReleaseGuestClaim: (postId: string, claimId: string) => void;
	} = $props();
</script>

<div class="btn-row">
	{#if myClaim}
		{#if isGuest}
			<button
				type="button"
				class="btn btn-outline"
				disabled={claimActionBusyId === myClaim.id}
				onclick={() => onReleaseGuestClaim(post.id, myClaim.id)}
			>
				{claimActionBusyId === myClaim.id ? m.carpool_releasing() : m.carpool_release_seat()}
			</button>
		{:else}
			<form method="POST" action="?/releaseSeat" use:enhance>
				<input type="hidden" name="claimId" value={myClaim.id} />
				<button type="submit" class="btn btn-outline">{m.carpool_release_seat()}</button>
			</form>
		{/if}
	{:else if !isOwner && canPost && isGuest && guestNamePromptActive}
		<CarpoolGuestNamePrompt
			value={guestNameDraft}
			confirmLabel={m.carpool_claim_seat()}
			onInput={onGuestNameInput}
			onCancel={onGuestNameCancel}
			onConfirm={onGuestNameConfirm}
		/>
	{:else if !isOwner && canPost && (post.seats_available ?? 0) > 0}
		{#if isGuest}
			<button type="button" class="btn btn-outline" disabled={claimActionBusyId === post.id} onclick={() => onStartClaim(post.id)}>
				{claimActionBusyId === post.id ? m.carpool_claiming() : m.carpool_claim_seat()}
			</button>
		{:else}
			<form method="POST" action="?/claimSeat" use:enhance>
				<input type="hidden" name="driverPostId" value={post.id} />
				<button type="submit" class="btn btn-outline">{m.carpool_claim_seat()}</button>
			</form>
		{/if}
	{/if}
</div>
{#if isGuest}
	{#if claimActionErrorFor === post.id && claimActionSaveRequired}
		<CarpoolSaveRequiredNotice />
	{:else if claimActionErrorFor === post.id && claimActionError}
		<p class="error">{claimActionError}</p>
	{/if}
{:else if form?.form === `claimSeat:${post.id}` && form?.error}
	<p class="error">{form.error}</p>
{:else if myClaim && form?.form === `releaseSeat:${myClaim.id}` && form?.error}
	<p class="error">{form.error}</p>
{/if}
