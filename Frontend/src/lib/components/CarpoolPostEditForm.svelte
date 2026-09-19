<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { m } from '$lib/paraglide/messages';
	import { ensureLocalId } from '$lib/localProfile';
	import type { CarpoolPostDirection } from '$lib/server/backendTypes';
	import type { CarpoolPostOut } from '$lib/server/backendTypes';
	import ConfirmButton from './ConfirmButton.svelte';
	import EditableCard from './EditableCard.svelte';

	let {
		post,
		isGuest,
		guestCode,
		form,
		onDone
	}: {
		post: CarpoolPostOut;
		isGuest: boolean;
		guestCode: string | null;
		form: { form?: string; error?: string } | null;
		onDone: () => void;
	} = $props();

	// svelte-ignore state_referenced_locally
	let originDraft = $state(post.origin_label);
	// svelte-ignore state_referenced_locally
	let directionDraft = $state<CarpoolPostDirection>(post.direction);
	// svelte-ignore state_referenced_locally
	let seatsDraft = $state<number | undefined>(post.seats_total ?? undefined);
	// svelte-ignore state_referenced_locally
	let leaveDraft = $state(post.leave_time_text ?? '');
	// svelte-ignore state_referenced_locally
	let notesDraft = $state(post.notes ?? '');
	// svelte-ignore state_referenced_locally
	let contactPhoneDraft = $state(post.contact_phone ?? '');
	// svelte-ignore state_referenced_locally
	let contactEmailDraft = $state(post.contact_email ?? '');
	let saving = $state(false);
	let guestError = $state('');

	type GuestWriteResult =
		| { ok: true; post: CarpoolPostOut }
		| { ok: false; error: 'save-required' }
		| { ok: false; error: 'conflict'; message?: string }
		| { ok: false; error: 'forbidden' }
		| { ok: false; error: 'server' };

	async function submitGuestEdit() {
		if (!guestCode) return;
		guestError = '';
		saving = true;
		try {
			const res = await fetch(`/join/${guestCode}/carpool/posts/${post.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					originLabel: originDraft,
					direction: directionDraft,
					seatsTotal: post.kind === 'driver' ? (seatsDraft ?? null) : undefined,
					leaveTimeText: leaveDraft || null,
					notes: notesDraft || null,
					contactPhone: contactPhoneDraft || null,
					contactEmail: contactEmailDraft || null,
					localId: ensureLocalId()
				})
			});
			const result = (await res.json()) as GuestWriteResult;
			if (result.ok) {
				onDone();
				await invalidateAll();
			} else if (result.error === 'conflict') {
				guestError = result.message || m.carpool_guest_action_failed();
			} else {
				guestError = m.carpool_guest_action_failed();
			}
		} catch {
			guestError = m.carpool_guest_action_failed();
		} finally {
			saving = false;
		}
	}

	async function deleteGuestPost() {
		if (!guestCode) return;
		guestError = '';
		saving = true;
		try {
			const res = await fetch(`/join/${guestCode}/carpool/posts/${post.id}?localId=${encodeURIComponent(ensureLocalId())}`, {
				method: 'DELETE'
			});
			const result = (await res.json()) as GuestWriteResult;
			if (result.ok) {
				onDone();
				await invalidateAll();
			} else {
				guestError = m.carpool_guest_action_failed();
			}
		} catch {
			guestError = m.carpool_guest_action_failed();
		} finally {
			saving = false;
		}
	}
</script>

{#if isGuest}
	<form
		onsubmit={(e) => {
			e.preventDefault();
			void submitGuestEdit();
		}}
	>
		<label class="field">
			<span>{m.carpool_origin_field()}</span>
			<input bind:value={originDraft} required />
		</label>
		<label class="field">
			<span>{m.carpool_direction_field()}</span>
			<select bind:value={directionDraft}>
				<option value="round_trip">{m.carpool_direction_round_trip()}</option>
				<option value="there">{m.carpool_direction_there()}</option>
				<option value="back">{m.carpool_direction_back()}</option>
			</select>
		</label>
		{#if post.kind === 'driver'}
			<label class="field">
				<span>{m.carpool_seats_field()}</span>
				<input type="number" min="1" bind:value={seatsDraft} required />
			</label>
			<label class="field">
				<span>{m.carpool_leave_time_field()}</span>
				<input bind:value={leaveDraft} placeholder={m.groups_optional()} />
			</label>
		{/if}
		<label class="field">
			<span>{m.carpool_notes_field()}</span>
			<input bind:value={notesDraft} placeholder={m.groups_optional()} />
		</label>
		<label class="field">
			<span>{m.carpool_contact_phone_field()}</span>
			<input type="tel" bind:value={contactPhoneDraft} placeholder={m.groups_optional()} />
		</label>
		<label class="field">
			<span>{m.carpool_contact_email_field()}</span>
			<input type="email" bind:value={contactEmailDraft} placeholder={m.groups_optional()} />
		</label>
		<p class="card-note">{m.carpool_contact_email_hint()}</p>
		{#if guestError}
			<p class="error">{guestError}</p>
		{/if}
		<div class="btn-row">
			<button type="submit" class="btn btn-outline" disabled={saving}>
				{saving ? m.reset_password_saving() : m.action_save()}
			</button>
			<button type="button" class="text-link" onclick={onDone} disabled={saving}>
				{m.action_cancel()}
			</button>
			<ConfirmButton>
				{#snippet trigger(start)}
					<button type="button" class="text-link text-link--danger" onclick={start} disabled={saving}>
						{m.carpool_delete_post()}
					</button>
				{/snippet}
				{#snippet confirm(cancel)}
					<p class="card-note">{m.carpool_delete_post_confirm()}</p>
					<div class="btn-row">
						<button type="button" class="btn btn-outline" onclick={cancel}>{m.action_cancel()}</button>
						<button type="button" class="btn btn-danger" disabled={saving} onclick={() => void deleteGuestPost()}>
							{m.carpool_delete_post()}
						</button>
					</div>
				{/snippet}
			</ConfirmButton>
		</div>
	</form>
{:else}
	<EditableCard
		saveAction="?/updateCarpoolPost"
		deleteAction="?/deleteCarpoolPost"
		idName="postId"
		idValue={post.id}
		bind:saving
		error={form?.form === 'editPost' && form?.error}
		deleteLabel={m.carpool_delete_post()}
		deleteConfirmLabel={m.carpool_delete_post_confirm()}
		onCancel={onDone}
	>
		{#snippet fields()}
			<label class="field">
				<span>{m.carpool_origin_field()}</span>
				<input name="originLabel" bind:value={originDraft} required />
			</label>
			<label class="field">
				<span>{m.carpool_direction_field()}</span>
				<select name="direction" bind:value={directionDraft}>
					<option value="round_trip">{m.carpool_direction_round_trip()}</option>
					<option value="there">{m.carpool_direction_there()}</option>
					<option value="back">{m.carpool_direction_back()}</option>
				</select>
			</label>
			{#if post.kind === 'driver'}
				<label class="field">
					<span>{m.carpool_seats_field()}</span>
					<input name="seatsTotal" type="number" min="1" bind:value={seatsDraft} required />
				</label>
				<label class="field">
					<span>{m.carpool_leave_time_field()}</span>
					<input name="leaveTimeText" bind:value={leaveDraft} placeholder={m.groups_optional()} />
				</label>
			{/if}
			<label class="field">
				<span>{m.carpool_notes_field()}</span>
				<input name="notes" bind:value={notesDraft} placeholder={m.groups_optional()} />
			</label>
			<label class="field">
				<span>{m.carpool_contact_phone_field()}</span>
				<input name="contactPhone" type="tel" bind:value={contactPhoneDraft} placeholder={m.groups_optional()} />
			</label>
			<label class="field">
				<span>{m.carpool_contact_email_field()}</span>
				<input name="contactEmail" type="email" bind:value={contactEmailDraft} placeholder={m.groups_optional()} />
			</label>
			<p class="card-note">{m.carpool_contact_email_hint()}</p>
		{/snippet}
	</EditableCard>
{/if}
