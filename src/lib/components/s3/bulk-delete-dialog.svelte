<script lang="ts">
	import { fade, scale } from "svelte/transition";
	import { toast } from "svelte-sonner";
	import { Loader, Trash } from "@lucide/svelte";
	import { callS3 } from "$lib/api";
	import Button from "$lib/components/ui/button.svelte";

	let {
		connectionId,
		bucketName,
		keys,
		selectedCount,
		onClose,
		onSuccess,
	}: {
		connectionId: string;
		bucketName: string;
		keys: string[];
		selectedCount: number;
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
			keys,
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
			const result = await callS3<{
				success?: boolean;
				deleted?: number;
				error?: string;
			}>("deleteObjects", { connectionId, bucket: bucketName, keys });
			if (result.success) {
				toast.success(
					(result.deleted ?? 0) > 0
						? `Deleted ${result.deleted} item${result.deleted === 1 ? "" : "s"}`
						: "Items deleted",
				);
				onSuccess();
				onClose();
			} else {
				toast.error(result.error || "Failed to delete items");
			}
		} catch {
			toast.error("An unexpected error occurred");
		} finally {
			isDeleting = false;
		}
	}
</script>

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
					<Trash size={18} class="text-destructive" />
				</div>
				<div class="space-y-1">
					<h2 class="text-lg font-bold tracking-tight">
						Delete {selectedCount} item{selectedCount === 1 ? "" : "s"}
					</h2>
					<p class="text-sm text-muted-foreground">
						This will delete everything inside the selected folders too.
					</p>
				</div>
			</div>

			<div
				class="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm space-y-1.5">
				{#if itemCount === null}
					<p class="flex items-center gap-2 text-muted-foreground">
						<Loader size={14} class="animate-spin" />
						Counting items...
					</p>
				{:else}
					<p class="font-medium text-destructive">
						{itemCount}{itemCapReached ? "+" : ""} item{itemCount === 1
							? ""
							: "s"} will be deleted
					</p>
					{#if itemCapReached}
						<p class="text-muted-foreground">
							Count capped — large folders may contain more. This action is
							permanent.
						</p>
					{:else}
						<p class="text-muted-foreground">This action is permanent.</p>
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
					class="min-w-20">
					{#if isDeleting}
						<Loader class="animate-spin" size={16} />
					{:else}
						Delete
					{/if}
				</Button>
			</div>
		</div>
	</div>
</div>
