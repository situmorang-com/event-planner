<script lang="ts">
	import RegistrationPage from '$lib/components/RegistrationPage.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<RegistrationPage {data} {form} />
