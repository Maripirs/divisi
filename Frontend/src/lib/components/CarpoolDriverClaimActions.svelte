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
		guestClaimContactActive,
		guestClaimContactPhone,
		guestClaimContactEmail,
		claimActionBusyId,
		claimActionErrorFor,
		claimActionSaveRequired,
		claimActionError,
		form,
		onGuestNameInput,
		onGuestNameCancel,
		onGuestNameConfirm,
		onStartClaim,
		onGuestClaimContactPhoneInput,
		onGuestClaimContactEmailInput,
		onGuestClaimContactCancel,
		onGuestClaimContactConfirm,
		onReleaseGuestClaim
	}: {
		post: CarpoolPostOut;
		isOwner: boolean;
		canPost: boolean;
		isGuest: boolean;
		myClaim: CarpoolSeatClaimOut | undefined;
		guestNamePromptActive: boolean;
		guestNameDraft: string;
		/** B34: whether the guest's optional contact-info step is currently
		 * expanded for this specific post (a name is already on file, or was
		 * just confirmed, and the claim hasn't been submitted yet). */
		guestClaimContactActive: boolean;
		guestClaimContactPhone: string;
		guestClaimContactEmail: string;
		claimActionBusyId: string | null;
		claimActionErrorFor: string | null;
		claimActionSaveRequired: boolean;
		claimActionError: string;
		form: { form?: string; error?: string } | null;
		onGuestNameInput: (value: string) => void;
		onGuestNameCancel: () => void;
		onGuestNameConfirm: () => void;
		onStartClaim: (postId: string) => void;
		onGuestClaimContactPhoneInput: (value: string) => void;
		onGuestClaimContactEmailInput: (value: string) => void;
		onGuestClaimContactCancel: () => void;
		onGuestClaimContactConfirm: (postId: string) => void;
		onReleaseGuestClaim: (postId: string, claimId: string) => void;
	} = $props();

	// B34: the member (non-guest) path's own optional contact-info step,
	// expanded locally since this form is entirely self-contained (unlike
	// the guest path, which threads its equivalent state through
	// `CarpoolBoard.svelte` so it can survive the name-prompt step).
	let claiming = $state(false);
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
	{:else if !isOwner && canPost && isGuest && guestClaimContactActive}
		<form
			class="carpool-claim-contact-form"
			onsubmit={(e) => {
				e.preventDefault();
				onGuestClaimContactConfirm(post.id);
			}}
		>
			<label class="field">
				<span>{m.carpool_contact_phone_field()}</span>
				<input
					type="tel"
					value={guestClaimContactPhone}
					oninput={(e) => onGuestClaimContactPhoneInput(e.currentTarget.value)}
					placeholder={m.groups_optional()}
				/>
			</label>
			<label class="field">
				<span>{m.carpool_contact_email_field()}</span>
				<input
					type="email"
					value={guestClaimContactEmail}
					oninput={(e) => onGuestClaimContactEmailInput(e.currentTarget.value)}
					placeholder={m.groups_optional()}
				/>
			</label>
			<p class="card-note">{m.carpool_claim_contact_hint()}</p>
			<div class="btn-row">
				<button type="submit" class="btn btn-outline" disabled={claimActionBusyId === post.id}>
					{claimActionBusyId === post.id ? m.carpool_claiming() : m.carpool_claim_seat()}
				</button>
				<button type="button" class="text-link" onclick={onGuestClaimContactCancel}>{m.action_cancel()}</button>
			</div>
		</form>
	{:else if !isOwner && canPost && (post.seats_available ?? 0) > 0}
		{#if isGuest}
			<button type="button" class="btn btn-outline" onclick={() => onStartClaim(post.id)}>
				{m.carpool_claim_seat()}
			</button>
		{:else if claiming}
			<form
				class="carpool-claim-contact-form"
				method="POST"
				action="?/claimSeat"
				use:enhance={() => {
					return async ({ result, update }) => {
						if (result.type === 'success') claiming = false;
						await update();
					};
				}}
			>
				<input type="hidden" name="driverPostId" value={post.id} />
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
					<button type="submit" class="btn btn-outline">{m.carpool_claim_seat()}</button>
					<button type="button" class="text-link" onclick={() => (claiming = false)}>{m.action_cancel()}</button>
				</div>
			</form>
		{:else}
			<button type="button" class="btn btn-outline" onclick={() => (claiming = true)}>
				{m.carpool_claim_seat()}
			</button>
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
