<script lang="ts">
	import { fade, scale } from "svelte/transition";
	import { toast } from "svelte-sonner";
	import { Loader2 } from "@lucide/svelte";
	import { callS3 } from "$lib/api";
	import Button from "$lib/components/ui/button.svelte";
	import Input from "$lib/components/ui/input.svelte";
	import Label from "$lib/components/ui/label.svelte";

	let {
		connectionId,
		bucketName,
		oldKey,
		onClose,
		onSuccess,
		onOptimisticRename,
	}: {
		connectionId: string;
		bucketName: string;
		oldKey: string;
		onClose: () => void;
		onSuccess: () => void;
		onOptimisticRename?: (oldKey: string, newKey: string) => void;
	} = $props();

	let newKey = $state(oldKey);
	let isRenaming = $state(false);
	let nameInput: HTMLInputElement | undefined = $state();

	$effect(() => {
		nameInput?.focus();
	});

	async function handleRename() {
		if (newKey === oldKey) {
			onClose();
			return;
		}

		isRenaming = true;
		if (onOptimisticRename) {
			onOptimisticRename(oldKey, newKey);
		}

		try {
			const result = await callS3<{ success?: boolean; error?: string }>("renameObject", {
				connectionId,
				bucket: bucketName,
				oldKey,
				newKey,
			});
			if (result.success) {
				toast.success("Renamed successfully");
				onSuccess();
				onClose();
			} else {
				if (onOptimisticRename) {
					onOptimisticRename(newKey, oldKey);
				}
				toast.error(result.error || "Failed to rename");
			}
		} catch {
			if (onOptimisticRename) {
				onOptimisticRename(newKey, oldKey);
			}
			toast.error("An unexpected error occurred");
		} finally {
			isRenaming = false;
		}
	}
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key === "Escape" && !isRenaming) onClose();
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
			<div class="space-y-2">
				<h2 class="text-xl font-bold tracking-tight">Rename</h2>
				<p class="text-sm text-muted-foreground">
					Enter a new name for your file or folder.
				</p>
			</div>

			<div class="space-y-2">
				<Label for="newKey">New Name / Path</Label>
				<Input
					bind:ref={nameInput}
					id="newKey"
					bind:value={newKey}
					placeholder="Enter new name..."
					class="h-10"
				/>
			</div>

			<div class="flex justify-end gap-3 pt-2">
				<Button variant="ghost" onclick={onClose} disabled={isRenaming}>
					Cancel
				</Button>
				<Button onclick={handleRename} disabled={isRenaming} class="min-w-[80px]">
					{#if isRenaming}
						<Loader2 class="animate-spin" size={16} />
					{:else}
						Rename
					{/if}
				</Button>
			</div>
		</div>
	</div>
</div>
