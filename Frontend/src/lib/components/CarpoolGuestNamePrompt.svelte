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
		<input value={value} oninput={(e) => onInput(e.currentTarget.value)} required autocomplete="name" />
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
