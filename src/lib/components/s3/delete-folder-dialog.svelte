<script lang="ts">
	import { fade, scale } from "svelte/transition";
	import { toast } from "svelte-sonner";
	import { Folder, Loader2 } from "@lucide/svelte";
	import { callS3 } from "$lib/api";
	import { runRestore, runTrash } from "$lib/trash-run";
	import Button from "$lib/components/ui/button.svelte";

	let {
		connectionId,
		bucketName,
		folderKey,
		folderName,
		onClose,
		onSuccess,
	}: {
		connectionId: string;
		bucketName: string;
		folderKey: string;
		folderName: string;
		onClose: () => void;
		onSuccess: () => void;
	} = $props();

	let itemCount = $state<number | null>(null);
	let itemCapReached = $state(false);
	let isDeleting = $state(false);

	$effect(() => {
		let cancelled = false;
		callS3<{ count: number; capped?: boolean }>("countObjectsToDelete", {
			connectionId,
			bucket: bucketName,
			keys: [folderKey],
		}).then((result) => {
			if (!cancelled) {
				itemCount = result.count;
				itemCapReached = result.capped === true;
			}
		});
		return () => {
			cancelled = true;
		};
	});

	async function handleDelete() {
		isDeleting = true;
		try {
			const { count, trashed } = await runTrash({
				connectionId,
				bucket: bucketName,
				keys: [folderKey],
			});
			toast.success(
				`${count} item${count === 1 ? "" : "s"} moved to trash`,
				{
					duration: 8000,
					action: {
						label: "Undo",
						onClick: () => {
							runRestore({ connectionId, bucket: bucketName, keys: trashed })
								.then((n) => {
									toast.success(n === 1 ? "Restored" : `${n} items restored`);
									onSuccess();
								})
								.catch(() => toast.error("Failed to restore"));
						},
					},
				},
			);
			onSuccess();
			onClose();
		} catch (error: unknown) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to move folder to trash",
			);
		} finally {
			isDeleting = false;
		}
	}
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key === "Escape" && !isDeleting) onClose();
	}}
/>

<div
	class="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
	transition:fade={{ duration: 150 }}>
	<div
		class="bg-card border border-border/40 rounded-2xl shadow-2xl w-full max-w-md p-6"
		transition:scale={{ duration: 150, start: 0.95 }}>
		<div class="space-y-4">
			<div class="flex items-start gap-3">
				<div
					class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10">
					<Folder size={18} class="text-destructive" />
				</div>
				<div class="space-y-1">
					<h2 class="text-lg font-bold tracking-tight">Delete folder</h2>
					<p class="text-sm text-muted-foreground break-all">{folderName}</p>
				</div>
			</div>

			<div
				class="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm space-y-1.5">
				{#if itemCount === null}
					<p class="flex items-center gap-2 text-muted-foreground">
						<Loader2 size={14} class="animate-spin" />
						Counting items in folder...
					</p>
				{:else}
					<p class="font-medium text-destructive">
						{itemCount}{itemCapReached ? "+" : ""} item{itemCount === 1
							? ""
							: "s"} inside this folder
					</p>
					{#if itemCapReached}
						<p class="text-muted-foreground">
							Count capped — this folder may contain more. Items stay in
							Trash for 30 days before they are purged.
						</p>
					{:else}
						<p class="text-muted-foreground">
							Items stay in Trash for 30 days — restore the folder or its
							files from the Trash view.
						</p>
					{/if}
				{/if}
			</div>

			<div class="flex justify-end gap-3 pt-2">
				<Button variant="ghost" onclick={onClose} disabled={isDeleting}>
					Cancel
				</Button>
				<Button
					variant="destructive"
					onclick={handleDelete}
					disabled={isDeleting || itemCount === null}
					class="min-w-[80px]">
					{#if isDeleting}
						<Loader2 class="animate-spin" size={16} />
					{:else}
						Delete
					{/if}
				</Button>
			</div>
		</div>
	</div>
</div>
