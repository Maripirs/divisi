<script lang="ts">
	import { m } from '$lib/paraglide/messages';

	let {
		value,
		confirmLabel,
		onInput,
		onCancel,
		onConfirm
	}: {
		value: string;
		confirmLabel: string;
		onInput: (value: string) => void;
		onCancel: () => void;
		onConfirm: () => void;
	} = $props();
</script>

<form
	class="signup-name-form"
	onsubmit={(e) => {
		e.preventDefault();
		onConfirm();
	}}
>
	<label class="field">
		<span>{m.responsibilities_name_prompt()}</span>
		<!-- `list="guest-known-names"`: a plain HTML id link, not a prop --
		     the datalist itself lives once on `join/[code]/+page.svelte`
		     (the only place this component's guest branch ever mounts from),
		     see its own doc comment for why. Harmless if that datalist isn't
		     present for some future caller -- the browser just ignores an
		     unmatched `list` id, no autocomplete, no error. -->
		<input
			value={value}
			oninput={(e) => onInput(e.currentTarget.value)}
			required
			autocomplete="name"
			list="guest-known-names"
		/>
	</label>
	<div class="btn-row">
		<button type="button" class="text-link" onclick={onCancel}>
			{m.join_not_now()}
		</button>
		<button type="submit" class="btn btn-primary" disabled={value.trim().length === 0}>
			{confirmLabel}
		</button>
	</div>
</form>

<style>
	.signup-name-form {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
</style>
