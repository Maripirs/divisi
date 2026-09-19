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
		guestInterestContactActive,
		guestInterestContactPhone,
		guestInterestContactEmail,
		interestActionBusyId,
		interestActionErrorFor,
		interestActionSaveRequired,
		interestActionError,
		form,
		onGuestNameInput,
		onGuestNameCancel,
		onGuestNameConfirm,
		onStartInterest,
		onGuestInterestContactPhoneInput,
		onGuestInterestContactEmailInput,
		onGuestInterestContactCancel,
		onGuestInterestContactConfirm,
		onReleaseGuestInterest
	}: {
		post: CarpoolPostOut;
		isOwner: boolean;
		canPost: boolean;
		isGuest: boolean;
		myInterest: CarpoolRiderInterestOut | undefined;
		guestNamePromptActive: boolean;
		guestNameDraft: string;
		/** B34: whether the guest's optional contact-info step is currently
		 * expanded for this specific post, the rider-post mirror of
		 * `CarpoolDriverClaimActions`'s `guestClaimContactActive`. */
		guestInterestContactActive: boolean;
		guestInterestContactPhone: string;
		guestInterestContactEmail: string;
		interestActionBusyId: string | null;
		interestActionErrorFor: string | null;
		interestActionSaveRequired: boolean;
		interestActionError: string;
		form: { form?: string; error?: string } | null;
		onGuestNameInput: (value: string) => void;
		onGuestNameCancel: () => void;
		onGuestNameConfirm: () => void;
		onStartInterest: (postId: string) => void;
		onGuestInterestContactPhoneInput: (value: string) => void;
		onGuestInterestContactEmailInput: (value: string) => void;
		onGuestInterestContactCancel: () => void;
		onGuestInterestContactConfirm: (postId: string) => void;
		onReleaseGuestInterest: (postId: string, interestId: string) => void;
	} = $props();

	// B34: the member (non-guest) path's own optional contact-info step,
	// same locally-expanded shape as `CarpoolDriverClaimActions`'s `claiming`.
	let expressingInterest = $state(false);
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
	{:else if !isOwner && canPost && isGuest && guestInterestContactActive}
		<form
			class="carpool-claim-contact-form"
			onsubmit={(e) => {
				e.preventDefault();
				onGuestInterestContactConfirm(post.id);
			}}
		>
			<label class="field">
				<span>{m.carpool_contact_phone_field()}</span>
				<input
					type="tel"
					value={guestInterestContactPhone}
					oninput={(e) => onGuestInterestContactPhoneInput(e.currentTarget.value)}
					placeholder={m.groups_optional()}
				/>
			</label>
			<label class="field">
				<span>{m.carpool_contact_email_field()}</span>
				<input
					type="email"
					value={guestInterestContactEmail}
					oninput={(e) => onGuestInterestContactEmailInput(e.currentTarget.value)}
					placeholder={m.groups_optional()}
				/>
			</label>
			<p class="card-note">{m.carpool_claim_contact_hint()}</p>
			<div class="btn-row">
				<button type="submit" class="btn btn-outline" disabled={interestActionBusyId === post.id}>
					{interestActionBusyId === post.id ? m.carpool_expressing_interest() : m.carpool_im_interested()}
				</button>
				<button type="button" class="text-link" onclick={onGuestInterestContactCancel}>{m.action_cancel()}</button>
			</div>
		</form>
	{:else if !isOwner && canPost}
		{#if isGuest}
			<button type="button" class="btn btn-outline" onclick={() => onStartInterest(post.id)}>
				{m.carpool_im_interested()}
			</button>
		{:else if expressingInterest}
			<form
				class="carpool-claim-contact-form"
				method="POST"
				action="?/expressInterest"
				use:enhance={() => {
					return async ({ result, update }) => {
						if (result.type === 'success') expressingInterest = false;
						await update();
					};
				}}
			>
				<input type="hidden" name="riderPostId" value={post.id} />
				<label class="field">
					<span>{m.carpool_contact_phone_field()}</span>
					<input name="contactPhone" type="tel" placeholder={m.groups_optional()} />
				</label>
				<label class="field">
					<span>{m.carpool_contact_email_field()}</span>
					<input name="contactEmail" type="email" placeholder={m.groups_optional()} />
				</label>
				<p class="card-note">{m.carpool_claim_contact_hint()}</p>
				<div class="btn-row">
					<button type="submit" class="btn btn-outline">{m.carpool_im_interested()}</button>
					<button type="button" class="text-link" onclick={() => (expressingInterest = false)}>{m.action_cancel()}</button>
				</div>
			</form>
		{:else}
			<button type="button" class="btn btn-outline" onclick={() => (expressingInterest = true)}>
				{m.carpool_im_interested()}
			</button>
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
