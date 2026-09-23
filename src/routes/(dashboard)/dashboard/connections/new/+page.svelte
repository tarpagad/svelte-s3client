<script lang="ts">
	import AddConnectionForm from "./add-connection-form.svelte";
</script>

<div class="max-w-2xl mx-auto space-y-6">
	<div>
		<h1 class="text-3xl font-bold tracking-tight">Add Connection</h1>
		<p class="text-muted-foreground">
			Connect your Amazon S3 or Cloudflare R2 account. Your credentials are encrypted and
			stored only in your browser.
		</p>
	</div>
	<AddConnectionForm />
</div>
