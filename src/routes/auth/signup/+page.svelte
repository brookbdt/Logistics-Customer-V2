<script>
	export let data;
	import { signIn } from '@auth/sveltekit/client';
	import { onMount } from 'svelte';

	onMount(async () => {
		const auth = await signIn('credentials', { callbackUrl: '/', token: data.tokenURL });
	});
</script>

<div>Signup with Email</div>
