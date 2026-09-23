<script lang="ts">
	import { enhance } from "$app/forms";
	import { toast } from "svelte-sonner";
	import { Loader2, ShieldCheck } from "@lucide/svelte";
	import Button from "$lib/components/ui/button.svelte";
	import Card from "$lib/components/ui/card.svelte";
	import CardContent from "$lib/components/ui/card-content.svelte";
	import CardDescription from "$lib/components/ui/card-description.svelte";
	import CardHeader from "$lib/components/ui/card-header.svelte";
	import CardTitle from "$lib/components/ui/card-title.svelte";
	import Input from "$lib/components/ui/input.svelte";
	import Label from "$lib/components/ui/label.svelte";
	import type { ConnectionInfo } from "$lib/types";

	let { data, form }: { data: { connection: ConnectionInfo }; form: { error?: string } | null } =
		$props();

	let loading = $state(false);

	const submitHandler = () => {
		loading = true;
		return async ({ result, update }: { result: any; update: () => Promise<void> }) => {
			loading = false;
			if (result.type === "failure") {
				toast.error(result.data?.error ?? "Something went wrong. Please try again.");
			} else if (result.type === "success") {
				toast.success("Connection updated successfully");
			}
			await update();
		};
	};

	const isR2 = $derived(data.connection.type === "r2");
</script>

<Card class="w-full shadow-lg border-muted/40">
	<CardHeader class="space-y-1">
		<div class="flex items-center gap-2 mb-2">
			<div class="p-2 bg-primary/10 rounded-full text-primary"><ShieldCheck size={24} /></div>
			<CardTitle class="text-2xl">{isR2 ? "R2" : "S3"} Connection</CardTitle>
		</div>
		<CardDescription>
			Leave the credential fields blank to keep the existing values.
		</CardDescription>
	</CardHeader>
	<form method="POST" use:enhance={submitHandler}>
		<CardContent class="space-y-6">
			<div class="space-y-2">
				<Label for="name">Connection Name</Label>
				<Input id="name" name="name" defaultValue={data.connection.name} required />
			</div>
			<div class="space-y-2">
				<Label for="accessKeyId">Access Key ID</Label>
				<Input id="accessKeyId" name="accessKeyId" placeholder="Leave blank to keep current" autocomplete="off" />
			</div>
			<div class="space-y-2">
				<Label for="secretAccessKey">Secret Access Key</Label>
				<Input id="secretAccessKey" name="secretAccessKey" type="password" placeholder="Leave blank to keep current" autocomplete="off" />
			</div>
			<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
				<div class="space-y-2">
					<Label for="region">Region</Label>
					<Input id="region" name="region" defaultValue={data.connection.region} placeholder="us-east-1" />
				</div>
				<div class="space-y-2">
					<Label for="bucket">Bucket</Label>
					<Input id="bucket" name="bucket" defaultValue={data.connection.bucket ?? ""} placeholder="Leave blank to browse all" />
				</div>
			</div>
			<div class="space-y-2">
				<Label for="endpoint">Endpoint</Label>
				<Input
					id="endpoint"
					name="endpoint"
					defaultValue={data.connection.endpoint ?? ""}
					placeholder={isR2 ? "https://<accountid>.r2.cloudflarestorage.com" : "Optional custom endpoint"}
				/>
				{#if isR2}
					<p class="text-xs text-muted-foreground">
						Your R2 endpoint URL from the Cloudflare dashboard.
					</p>
				{/if}
			</div>
			<div class="space-y-2">
				<Label for="publicUrl">Public URL (optional)</Label>
				<Input
					id="publicUrl"
					name="publicUrl"
					defaultValue={data.connection.publicUrl ?? ""}
					placeholder={isR2 ? "https://pub-<bucketid>.r2.dev" : "https://my-bucket.example.com"}
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
				Save Changes
			</Button>
		</div>
	</form>
</Card>
