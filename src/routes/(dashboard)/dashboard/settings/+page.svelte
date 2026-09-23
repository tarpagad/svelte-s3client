<script lang="ts">
	import SettingsForm from "$lib/components/s3/settings-form.svelte";
</script>

<svelte:head>
	<title>Settings | S3 Client</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-3xl font-bold tracking-tight">Settings</h1>
		<p class="text-muted-foreground">
			Customize your dashboard and S3 explorer experience.
		</p>
	</div>

	<SettingsForm />
</div>
