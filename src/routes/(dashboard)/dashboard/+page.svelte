<script lang="ts">
	import { Database, Globe, Plus, RefreshCw } from "@lucide/svelte";
	import Button from "$lib/components/ui/button.svelte";
	import Card from "$lib/components/ui/card.svelte";
	import CardContent from "$lib/components/ui/card-content.svelte";
	import CardHeader from "$lib/components/ui/card-header.svelte";
	import CardTitle from "$lib/components/ui/card-title.svelte";

	let { data } = $props();

	const connections = $derived(data.connections);
	const s3Connections = $derived(connections.filter((c) => c.type === "s3"));
	const r2Connections = $derived(connections.filter((c) => c.type === "r2"));
</script>

<div class="space-y-8">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Connections</h1>
			<p class="text-muted-foreground">Manage your S3 and R2 bucket connections.</p>
		</div>
		<div class="flex gap-2">
			<a href="/dashboard">
				<Button variant="outline" size="sm" class="gap-2"><RefreshCw size={14} />Refresh</Button>
			</a>
			<a href="/dashboard/connections/new">
				<Button size="sm" class="gap-2"><Plus size={14} />Add Connection</Button>
			</a>
		</div>
	</div>
	{#if connections.length === 0}
		<div
			class="py-16 text-center space-y-4 border-2 border-dashed border-muted rounded-2xl bg-muted/5"
		>
			<div class="p-4 bg-muted inline-block rounded-full text-muted-foreground">
				<Globe size={32} />
			</div>
			<div>
				<h3 class="text-lg font-medium">No connections yet</h3>
				<p class="text-sm text-muted-foreground max-w-md mx-auto">
					Add an S3 or R2 connection to start managing your buckets. Your credentials are
					encrypted and stored only in your browser.
				</p>
				<div class="mt-6">
					<a href="/dashboard/connections/new">
						<Button class="gap-2"><Plus size={16} />Add Your First Connection</Button>
					</a>
				</div>
			</div>
		</div>
	{:else}
		<div class="space-y-10">
			{#if s3Connections.length > 0}
				<section>
					<div class="flex items-center gap-3 mb-5">
						<div class="p-2 bg-orange-500/10 rounded-lg text-orange-500">
							<Database size={20} />
						</div>
						<h2 class="text-xl font-semibold">Amazon S3</h2>
						<span class="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
							{s3Connections.length} connection{s3Connections.length > 1 ? "s" : ""}
						</span>
					</div>
					<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
						{#each s3Connections as conn (conn.id)}
							<a href="/dashboard/connections/{conn.id}">
								<Card
									class="hover:border-orange-500/50 transition-all hover:scale-[1.02] cursor-pointer group bg-card/40 overflow-hidden relative"
								>
									<div
										class="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity"
									>
										<Database size={80} />
									</div>
									<CardHeader class="flex flex-row items-center gap-4">
										<div
											class="w-12 h-12 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center shadow-inner"
										>
											<Database size={24} />
										</div>
										<div>
											<CardTitle class="text-lg">{conn.name}</CardTitle>
											<p class="text-xs text-muted-foreground">
												{conn.region}{conn.bucket ? ` • ${conn.bucket}` : ""}
											</p>
										</div>
									</CardHeader>
									<CardContent>
										<div class="flex items-center gap-2 text-xs text-muted-foreground pt-2">
											<div class="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></div>S3
											Compatible
										</div>
									</CardContent>
								</Card>
							</a>
						{/each}
					</div>
				</section>
			{/if}
			{#if r2Connections.length > 0}
				<section>
					<div class="flex items-center gap-3 mb-5">
						<div class="p-2 bg-blue-500/10 rounded-lg text-blue-500"><Globe size={20} /></div>
						<h2 class="text-xl font-semibold">Cloudflare R2</h2>
						<span class="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
							{r2Connections.length} connection{r2Connections.length > 1 ? "s" : ""}
						</span>
					</div>
					<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
						{#each r2Connections as conn (conn.id)}
							<a href="/dashboard/connections/{conn.id}">
								<Card
									class="hover:border-blue-500/50 transition-all hover:scale-[1.02] cursor-pointer group bg-card/40 overflow-hidden relative"
								>
									<div
										class="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity"
									>
										<Database size={80} />
									</div>
									<CardHeader class="flex flex-row items-center gap-4">
										<div
											class="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center shadow-inner"
										>
											<Globe size={24} />
										</div>
										<div>
											<CardTitle class="text-lg">{conn.name}</CardTitle>
											<p class="text-xs text-muted-foreground">
												R2{conn.bucket ? ` • ${conn.bucket}` : ""}
											</p>
										</div>
									</CardHeader>
									<CardContent>
										<div class="flex items-center gap-2 text-xs text-muted-foreground pt-2">
											<div class="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>S3
											Compatible
										</div>
									</CardContent>
								</Card>
							</a>
						{/each}
					</div>
				</section>
			{/if}
		</div>
	{/if}
</div>
