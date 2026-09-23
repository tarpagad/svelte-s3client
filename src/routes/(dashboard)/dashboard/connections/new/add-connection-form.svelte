<script lang="ts">
	import { enhance } from "$app/forms";
	import { toast } from "svelte-sonner";
	import { cn } from "$lib/utils";
	import type { BucketConnectionType } from "$lib/types";
	import { Globe, HardDrive, Loader2, ShieldCheck } from "@lucide/svelte";
	import Button from "$lib/components/ui/button.svelte";
	import Card from "$lib/components/ui/card.svelte";
	import CardContent from "$lib/components/ui/card-content.svelte";
	import CardDescription from "$lib/components/ui/card-description.svelte";
	import CardHeader from "$lib/components/ui/card-header.svelte";
	import CardTitle from "$lib/components/ui/card-title.svelte";
	import Input from "$lib/components/ui/input.svelte";
	import Label from "$lib/components/ui/label.svelte";

	let { form }: { form?: { error?: string } | null } = $props();

	let loading = $state(false);
	let type = $state<BucketConnectionType>("s3");

	const submitHandler = () => {
		loading = true;
		return async ({ result, update }: { result: any; update: () => Promise<void> }) => {
			loading = false;
			if (result.type === "failure") {
				toast.error(result.data?.error ?? "Something went wrong. Please try again.");
			} else if (result.type === "success") {
				toast.success(type === "s3" ? "S3 connection added" : "R2 connection added");
			}
			await update();
		};
	};
</script>

<Card class="w-full shadow-lg border-muted/40">
	<CardHeader class="space-y-1">
		<div class="flex items-center gap-2 mb-2">
			<div class="p-2 bg-primary/10 rounded-full text-primary"><ShieldCheck size={24} /></div>
			<CardTitle class="text-2xl">New Connection</CardTitle>
		</div>
		<CardDescription>
			Choose the provider type and enter your credentials. They will be encrypted and stored in
			a secure, HTTP-only cookie.
		</CardDescription>
	</CardHeader>
	<form method="POST" action="?/add" use:enhance={submitHandler}>
		<CardContent class="space-y-6">
			<div class="space-y-3">
				<Label>Provider Type</Label>
				<div class="grid grid-cols-2 gap-4">
					<button
						type="button"
						onclick={() => (type = "s3")}
						class={cn(
							"flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all",
							type === "s3" ? "border-orange-500 bg-orange-500/5" : "border-border/40 hover:border-border"
						)}
					>
						<div
							class={cn(
								"p-3 rounded-lg transition-colors",
								type === "s3" ? "bg-orange-500 text-white" : "bg-muted text-muted-foreground"
							)}
						>
							<HardDrive size={24} />
						</div>
						<span class="font-medium text-sm">Amazon S3</span>
					</button>
					<button
						type="button"
						onclick={() => (type = "r2")}
						class={cn(
							"flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all",
							type === "r2" ? "border-blue-500 bg-blue-500/5" : "border-border/40 hover:border-border"
						)}
					>
						<div
							class={cn(
								"p-3 rounded-lg transition-colors",
								type === "r2" ? "bg-blue-500 text-white" : "bg-muted text-muted-foreground"
							)}
						>
							<Globe size={24} />
						</div>
						<span class="font-medium text-sm">Cloudflare R2</span>
					</button>
				</div>
				<input type="hidden" name="type" value={type} />
			</div>
			<div class="space-y-2">
				<Label for="name">Connection Name</Label>
				<Input id="name" name="name" placeholder={type === "s3" ? "e.g. Production S3" : "e.g. Media R2"} required />
			</div>
			<div class="space-y-2">
				<Label for="accessKeyId">Access Key ID</Label>
				<Input id="accessKeyId" name="accessKeyId" placeholder={type === "s3" ? "AKIA..." : "R2 Access Key"} required autocomplete="off" />
			</div>
			<div class="space-y-2">
				<Label for="secretAccessKey">Secret Access Key</Label>
				<Input id="secretAccessKey" name="secretAccessKey" type="password" placeholder="wJalrXUt...EXAMPLEKEY" required autocomplete="off" />
			</div>
			<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
				<div class="space-y-2">
					<Label for="region">Region</Label>
					<Input id="region" name="region" placeholder="us-east-1" defaultValue="us-east-1" />
				</div>
				<div class="space-y-2">
					<Label for="bucket">Bucket (optional)</Label>
					<Input id="bucket" name="bucket" placeholder="Leave blank to browse all" />
				</div>
			</div>
			{#if type === "r2"}
				<div class="space-y-2">
					<Label for="endpoint">R2 Endpoint</Label>
					<Input id="endpoint" name="endpoint" placeholder="https://<accountid>.r2.cloudflarestorage.com" />
					<p class="text-xs text-muted-foreground">
						Your R2 endpoint URL from the Cloudflare dashboard. Required for R2 connections.
					</p>
				</div>
			{/if}
			<div class="space-y-2">
				<Label for="publicUrl">Public URL (optional)</Label>
				<Input
					id="publicUrl"
					name="publicUrl"
					placeholder={type === "r2" ? "https://pub-<bucketid>.r2.dev" : "https://my-bucket.example.com"}
				/>
				<p class="text-xs text-muted-foreground">
					Base URL for public object links. If set, this will be used instead of the default S3
					domain.
				</p>
			</div>
			{#if form?.error}
				<p class="text-sm text-destructive">{form.error}</p>
			{/if}
		</CardContent>
		<div class="px-6 pb-6">
			<Button class="w-full" type="submit" disabled={loading}>
				{#if loading}<Loader2 class="mr-2 h-4 w-4 animate-spin" />{/if}
				{type === "s3" ? "Connect S3" : "Connect R2"}
			</Button>
		</div>
	</form>
</Card>
