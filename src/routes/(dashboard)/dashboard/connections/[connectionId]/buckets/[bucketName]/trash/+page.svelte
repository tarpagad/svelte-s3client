<script lang="ts">
	import {
		ArrowLeft,
		ChevronDown,
		ChevronRight,
		File as FileIcon,
		Folder,
		Loader2,
		Trash2,
		Undo2,
	} from "@lucide/svelte";
	import { toast } from "svelte-sonner";
	import { callS3 } from "$lib/api";
	import Button from "$lib/components/ui/button.svelte";
	import { runRestore } from "$lib/trash-run";
	import { parseStamp, parseTrashKey, TRASH_PREFIX } from "$lib/trash-path";
	import type { S3ObjectInfo } from "$lib/types";
	import type { PageData } from "./$types";

	let { data }: { data: PageData } = $props();

	let batches = $state<S3ObjectInfo[]>(data.initialBatches);
	let expanded = $state<string | null>(null);
	let items = $state<S3ObjectInfo[]>([]);
	let loadingItems = $state(false);
	let busy = $state(false);
	let listId = 0;

	async function refetchBatches() {
		const r = await callS3<{ objects: S3ObjectInfo[] }>("listObjects", {
			connectionId: data.connectionId,
			bucket: data.bucketName,
			prefix: TRASH_PREFIX,
			maxKeys: 100,
			sortBy: "name-asc",
		});
		batches = r.objects.filter((o) => o.type === "folder");
	}

	$effect(() => {
		const batch = expanded;
		const id = ++listId;
		if (!batch) {
			items = [];
			return;
		}
		loadingItems = true;
		void (async () => {
			try {
				const r = await callS3<{ objects: S3ObjectInfo[] }>("listObjects", {
					connectionId: data.connectionId,
					bucket: data.bucketName,
					prefix: batch,
					maxKeys: 200,
					sortBy: "name-asc",
				});
				if (id === listId) items = r.objects;
			} catch (error: unknown) {
				if (id === listId) {
					toast.error(
						error instanceof Error ? error.message : "Failed to load trash",
					);
				}
			} finally {
				if (id === listId) loadingItems = false;
			}
		})();
	});

	const batchLabel = (name: string) =>
		parseStamp(name)?.toLocaleString() ?? name;

	const originalOf = (key: string) => parseTrashKey(key)?.originalKey ?? key;

	async function withBusy(fn: () => Promise<void>) {
		if (busy) return;
		busy = true;
		try {
			await fn();
		} catch (error: unknown) {
			toast.error(error instanceof Error ? error.message : "Action failed");
		} finally {
			busy = false;
		}
	}

	async function restoreKeys(keys: string[], trashSrcPrefix?: string) {
		await withBusy(async () => {
			const n = await runRestore({
				connectionId: data.connectionId,
				bucket: data.bucketName,
				keys,
				trashSrcPrefix,
			});
			toast.success(n === 1 ? "Restored" : `${n} items restored`);
			if (expanded && trashSrcPrefix === expanded) expanded = null;
			await loadAfterMutation();
		});
	}

	async function deleteForever(keys: string[]) {
		if (!confirm("Delete forever? This cannot be undone.")) return;
		await withBusy(async () => {
			const r = await callS3<{ success?: boolean; error?: string }>(
				"deleteObjects",
				{
					connectionId: data.connectionId,
					bucket: data.bucketName,
					keys,
				},
			);
			if (r.error) throw new Error(r.error);
			toast.success("Deleted forever");
			await loadAfterMutation();
		});
	}

	async function loadAfterMutation() {
		if (expanded) {
			const r = await callS3<{ objects: S3ObjectInfo[] }>("listObjects", {
				connectionId: data.connectionId,
				bucket: data.bucketName,
				prefix: expanded,
				maxKeys: 200,
				sortBy: "name-asc",
			});
			items = r.objects;
			if (r.objects.length === 0) expanded = null;
		}
		await refetchBatches();
	}

	async function emptyTrash() {
		if (batches.length === 0) return;
		if (
			!confirm(
				`Delete all ${batches.length} trash batch${batches.length === 1 ? "" : "es"} forever? This cannot be undone.`,
			)
		)
			return;
		await withBusy(async () => {
			expanded = null;
			const prefixes = batches.map((b) => b.key);
			for (const prefix of prefixes) {
				const r = await callS3<{ success?: boolean; error?: string }>(
					"deleteObjects",
					{
						connectionId: data.connectionId,
						bucket: data.bucketName,
						keys: [prefix],
					},
				);
				if (r.error) throw new Error(r.error);
			}
			toast.success("Trash emptied");
			await refetchBatches();
		});
	}
</script>

<div class="space-y-4">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div class="flex items-center gap-3">
			<a
				href="/dashboard/connections/{data.connectionId}/buckets/{data.bucketName}"
				class="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-input bg-background text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
			>
				<ArrowLeft size={16} />
				Files
			</a>
			<div>
				<h1 class="text-lg font-semibold flex items-center gap-2">
					<Trash2 size={18} class="text-muted-foreground" />
					Trash
				</h1>
				<p class="text-xs text-muted-foreground">
					{data.connectionName} · {data.bucketName} · items are kept for 30 days
				</p>
			</div>
		</div>
		{#if batches.length > 0}
			<Button
				variant="outline"
				size="sm"
				class="gap-2 text-destructive hover:bg-destructive/10"
				disabled={busy}
				onclick={emptyTrash}
			>
				<Trash2 size={14} />
				Empty trash
			</Button>
		{/if}
	</div>

	{#if batches.length === 0}
		<div
			class="border border-dashed border-border/60 rounded-xl py-16 text-center text-muted-foreground"
		>
			<Trash2 size={28} class="mx-auto mb-3 opacity-40" />
			Trash is empty
		</div>
	{:else}
		<div class="space-y-3">
			{#each batches as batch (batch.key)}
				{@const stamp = batch.name}
				<div class="border rounded-xl bg-card/30 overflow-hidden">
					<div class="flex items-center justify-between gap-3 px-4 py-3 bg-muted/40">
						<button
							type="button"
							class="flex items-center gap-2 text-sm font-medium hover:underline"
							onclick={() => (expanded = expanded === batch.key ? null : batch.key)}
						>
							{#if expanded === batch.key}
								<ChevronDown size={14} />
							{:else}
								<ChevronRight size={14} />
							{/if}
							Deleted {batchLabel(stamp)}
						</button>
						<div class="flex items-center gap-2">
							<Button
								variant="ghost"
								size="sm"
								class="h-8 gap-1"
								disabled={busy}
								onclick={() => restoreKeys([], batch.key)}
							>
								<Undo2 size={14} /> Restore all
							</Button>
							<Button
								variant="ghost"
								size="sm"
								class="h-8 gap-1 text-destructive hover:bg-destructive/10"
								disabled={busy}
								onclick={() => deleteForever([batch.key])}
							>
								<Trash2 size={14} /> Delete forever
							</Button>
						</div>
					</div>

					{#if expanded === batch.key}
						<div class="divide-y divide-border/40">
							{#if loadingItems}
								<div class="flex items-center justify-center py-8">
									<Loader2 class="animate-spin text-muted-foreground" size={18} />
								</div>
							{:else if items.length === 0}
								<p class="px-4 py-6 text-sm text-muted-foreground text-center">
									This batch is empty
								</p>
							{:else}
								{#each items as item (item.key)}
									<div class="flex items-center gap-3 px-4 py-2.5 text-sm">
										<span class="shrink-0">
											{#if item.type === "folder"}
												<Folder size={16} class="text-primary fill-primary/10" />
											{:else}
												<FileIcon size={16} class="text-muted-foreground" />
											{/if}
										</span>
										<span class="font-medium truncate min-w-0 w-2/5">
											{item.name}
										</span>
										<span class="truncate text-muted-foreground text-xs min-w-0 flex-1">
											{originalOf(item.key)}
										</span>
										<span class="flex items-center gap-1 shrink-0">
											<Button
												variant="ghost"
												size="sm"
												class="h-7 gap-1"
												disabled={busy}
												onclick={() =>
													item.type === "folder"
														? restoreKeys([], item.key)
														: restoreKeys([item.key])}
											>
												<Undo2 size={13} /> Restore
											</Button>
											<Button
												variant="ghost"
												size="sm"
												class="h-7 gap-1 text-destructive hover:bg-destructive/10"
												disabled={busy}
												onclick={() => deleteForever([item.key])}
											>
												<Trash2 size={13} />
												<span class="sr-only">Delete forever</span>
											</Button>
										</span>
									</div>
								{/each}
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
