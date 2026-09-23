<script lang="ts">
	import { ArrowLeft } from "@lucide/svelte";
	import FileExplorer from "$lib/components/s3/file-explorer.svelte";
	import Button from "$lib/components/ui/button.svelte";

	let { data } = $props();
</script>

<div class="space-y-6">
	<div class="flex items-center gap-4">
		<a href="/dashboard/connections/{data.connection.id}">
			<Button variant="ghost" size="icon" class="rounded-full"><ArrowLeft size={20} /></Button>
		</a>
		<div>
			<div class="flex items-center gap-2">
				<h1 class="text-2xl font-bold tracking-tight">{data.bucketName}</h1>
				<span class="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
					{data.connection.name}
				</span>
			</div>
			<p class="text-sm text-muted-foreground">
				{data.connection.type === "s3" ? "Amazon S3" : "Cloudflare R2"} — Object Browser
			</p>
		</div>
	</div>
	<FileExplorer
		connectionId={data.connection.id}
		bucketName={data.bucketName}
		connectionType={data.connection.type}
		publicUrl={data.connection.publicUrl}
		initialObjects={data.initialObjects}
		initialNextToken={data.initialNextToken}
		initialPrefs={data.prefs}
	/>
</div>
