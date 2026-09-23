<script lang="ts">
	import { enhance } from "$app/forms";
	import { toast } from "svelte-sonner";
	import { ArrowLeft, Database, Edit, RefreshCw, Trash2 } from "@lucide/svelte";
	import Button from "$lib/components/ui/button.svelte";
	import Card from "$lib/components/ui/card.svelte";
	import CardContent from "$lib/components/ui/card-content.svelte";
	import CardHeader from "$lib/components/ui/card-header.svelte";
	import CardTitle from "$lib/components/ui/card-title.svelte";

	let { data } = $props();

	const typeLabel = $derived(data.connection.type === "s3" ? "Amazon S3" : "Cloudflare R2");
	const typeBadge = $derived(
		data.connection.type === "s3"
			? "bg-orange-500/10 text-orange-500 border border-orange-500/20"
			: "bg-blue-500/10 text-blue-500 border border-blue-500/20"
	);

	const deleteHandler = () => {
		return async ({ result, update }: { result: any; update: () => Promise<void> }) => {
			if (result.type === "failure") {
				toast.error(result.data?.error ?? "Failed to delete connection");
			} else if (result.type === "success") {
				toast.success("Connection deleted");
			}
			await update();
		};
	};
</script>

<div class="space-y-6">
	<div class="flex items-center gap-4">
		<a href="/dashboard">
			<Button variant="ghost" size="icon" class="rounded-full"><ArrowLeft size={20} /></Button>
		</a>
		<div class="flex-1">
			<div class="flex items-center gap-3">
				<h1 class="text-2xl font-bold tracking-tight">{data.connection.name}</h1>
				<span class="text-xs font-medium px-2.5 py-0.5 rounded-full {typeBadge}">{typeLabel}</span>
			</div>
			<p class="text-sm text-muted-foreground">
				{data.connection.region}{data.connection.endpoint ? ` • ${data.connection.endpoint}` : ""}
			</p>
		</div>
		<div class="flex gap-2">
			<a href="/dashboard/connections/{data.connection.id}/edit">
				<Button variant="outline" size="sm" class="gap-2"><Edit size={14} />Edit</Button>
			</a>
			<form method="POST" action="?/delete" use:enhance={deleteHandler}>
				<Button
					variant="outline"
					size="sm"
					class="gap-2 text-destructive hover:bg-destructive/10 border-destructive/20"
				>
					<Trash2 size={14} />Delete
				</Button>
			</form>
			<a href="/dashboard/connections/{data.connection.id}">
				<Button variant="outline" size="sm" class="gap-2"><RefreshCw size={14} />Refresh</Button>
			</a>
		</div>
	</div>
	{#if data.loadError}
		<Card class="border-destructive/20 bg-destructive/5">
			<CardHeader>
				<CardTitle class="text-destructive">Connection Error</CardTitle>
				<p class="text-sm text-destructive/80">
					We couldn't fetch buckets for this connection. Please check your credentials and
					permissions.
				</p>
			</CardHeader>
			<CardContent>
				<p class="text-sm font-mono bg-background/50 p-4 rounded border border-destructive/10">
					{data.loadError}
				</p>
			</CardContent>
		</Card>
	{:else}
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
			{#each data.buckets as bucket (bucket.name)}
				<a href="/dashboard/connections/{data.connection.id}/buckets/{bucket.name}">
					<Card
						class="hover:border-primary/50 transition-all hover:scale-[1.02] cursor-pointer group bg-card/40 overflow-hidden relative"
					>
						<div
							class="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity"
						>
							<Database size={80} />
						</div>
						<CardHeader class="flex flex-row items-center gap-4">
							<div
								class="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shadow-inner"
							>
								<Database size={24} />
							</div>
							<div>
								<CardTitle class="text-lg">{bucket.name}</CardTitle>
								<p class="text-xs text-muted-foreground">
									{bucket.creationDate
										? `Created: ${new Date(bucket.creationDate).toLocaleDateString()}`
										: "Date unknown"}
								</p>
							</div>
						</CardHeader>
						<CardContent>
							<div class="flex items-center gap-2 text-xs text-muted-foreground pt-2">
								<div class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>Connected via
								{typeLabel}
							</div>
						</CardContent>
					</Card>
				</a>
			{/each}
			{#if data.buckets.length === 0}
				<div
					class="col-span-full py-12 text-center space-y-4 border-2 border-dashed border-muted rounded-2xl bg-muted/5"
				>
					<div class="p-4 bg-muted inline-block rounded-full text-muted-foreground">
						<Database size={32} />
					</div>
					<div>
						<h3 class="text-lg font-medium">No buckets found</h3>
						<p class="text-sm text-muted-foreground max-w-xs mx-auto">
							No buckets were found for this connection. You can create one via the provider
							console.
						</p>
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>
