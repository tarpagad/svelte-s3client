<script lang="ts">
	import { fade, scale } from "svelte/transition";
	import { toast } from "svelte-sonner";
	import { FolderPlus, Loader2 } from "@lucide/svelte";
	import { callS3 } from "$lib/api";
	import Button from "$lib/components/ui/button.svelte";
	import Input from "$lib/components/ui/input.svelte";
	import Label from "$lib/components/ui/label.svelte";

	let {
		connectionId,
		bucketName,
		prefix,
		onClose,
		onSuccess,
	}: {
		connectionId: string;
		bucketName: string;
		prefix: string;
		onClose: () => void;
		onSuccess: () => void;
	} = $props();

	let folderName = $state("");
	let isCreating = $state(false);
	let nameInput: HTMLInputElement | undefined = $state();

	$effect(() => {
		nameInput?.focus();
	});

	async function handleCreate() {
		if (!folderName.trim()) {
			toast.error("Please enter a folder name");
			return;
		}

		isCreating = true;
		try {
			const result = await callS3<{ success?: boolean; error?: string }>("createFolder", {
				connectionId,
				bucket: bucketName,
				prefix,
				folderName: folderName.trim(),
			});
			if (result.success) {
				toast.success(`Folder "${folderName}" created successfully`);
				onSuccess();
				onClose();
			} else {
				toast.error(result.error || "Failed to create folder");
			}
		} catch {
			toast.error("An unexpected error occurred");
		} finally {
			isCreating = false;
		}
	}
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key === "Escape") onClose();
	}}
/>

<div
	class="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
	transition:fade={{ duration: 150 }}
>
	<div
		class="bg-card border border-border/40 rounded-2xl shadow-2xl w-full max-w-md p-6"
		transition:scale={{ duration: 150, start: 0.95 }}
	>
		<div class="space-y-4">
			<div class="flex items-center gap-3">
				<div class="p-2 rounded-lg bg-primary/10 text-primary">
					<FolderPlus size={24} />
				</div>
				<div class="space-y-1">
					<h2 class="text-xl font-bold tracking-tight">New Folder</h2>
					<p class="text-sm text-muted-foreground">
						Create a new folder in
						<span class="font-mono text-xs bg-muted px-1 py-0.5 rounded">
							{prefix || "/"}
						</span>
					</p>
				</div>
			</div>

			<div class="space-y-2">
				<Label for="folderName">Folder Name</Label>
				<Input
					bind:ref={nameInput}
					id="folderName"
					bind:value={folderName}
					placeholder="e.g. documents, images, backup"
					class="h-10"
					onkeydown={(e) => {
						if (e.key === "Enter") handleCreate();
						if (e.key === "Escape") onClose();
					}}
				/>
				<p class="text-[10px] text-muted-foreground italic">
					Avoid using special characters: \ ^ ` &gt; &lt; &#123; &#125; [ ]
					# % ~ | /
				</p>
			</div>

			<div class="flex justify-end gap-3 pt-2">
				<Button variant="ghost" onclick={onClose} disabled={isCreating}>
					Cancel
				</Button>
				<Button
					onclick={handleCreate}
					disabled={isCreating || !folderName.trim()}
					class="min-w-[100px] gap-2"
				>
					{#if isCreating}
						<Loader2 class="animate-spin" size={16} />
					{:else}
						Create Folder
					{/if}
				</Button>
			</div>
		</div>
	</div>
</div>
