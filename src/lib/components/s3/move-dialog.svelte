<script lang="ts">
	import { fade, scale } from "svelte/transition";
	import {
		Folder as FolderIcon,
		FolderPlus,
		Home,
		Loader2,
		ChevronRight,
	} from "@lucide/svelte";
	import { toast } from "svelte-sonner";
	import { callS3 } from "$lib/api";
	import { runMove } from "$lib/move-run";
	import Button from "$lib/components/ui/button.svelte";
	import Input from "$lib/components/ui/input.svelte";
	import type { S3ObjectInfo } from "$lib/types";
	import { cn } from "$lib/utils";
	import { folderDestPrefix, isInsidePrefix } from "$lib/move-path";

	let {
		connectionId,
		bucketName,
		mode,
		fileKeys = [],
		folderPrefixes = [],
		srcName,
		currentPrefix,
		publicKeys = [],
		onClose,
		onSuccess,
	}: {
		connectionId: string;
		bucketName: string;
		mode: "move" | "copy";
		fileKeys?: string[];
		folderPrefixes?: string[];
		srcName?: string;
		currentPrefix: string;
		publicKeys?: string[];
		onClose: () => void;
		onSuccess: () => void;
	} = $props();

	const totalSources = $derived(fileKeys.length + folderPrefixes.length);
	const verb = $derived(mode === "move" ? "Move" : "Copy");

	let destPrefix = $state("");
	let folders = $state<S3ObjectInfo[]>([]);
	let loadingFolders = $state(false);
	let newFolderName = $state("");
	let busy = $state(false);

	const targetPrefix = $derived(
		folderPrefixes.length === 1 && fileKeys.length === 0 && srcName
			? folderDestPrefix(destPrefix, srcName)
			: destPrefix,
	);

	const crumbs = $derived(
		destPrefix === ""
			? []
			: destPrefix
					.split("/")
					.filter(Boolean)
					.map((seg, i, arr) => ({
						name: seg,
						prefix: arr.slice(0, i + 1).join("/") + "/",
					})),
	);

	let folderLoadId = 0;
	$effect(() => {
		void destPrefix;
		const loadId = ++folderLoadId;
		void (async () => {
			loadingFolders = true;
			try {
				const data = await callS3<{ objects: S3ObjectInfo[] }>("listObjects", {
					connectionId,
					bucket: bucketName,
					prefix: destPrefix,
					maxKeys: 500,
					sortBy: "name-asc",
				});
				if (loadId === folderLoadId) {
					folders = data.objects.filter((o) => o.type === "folder");
				}
			} catch (error: unknown) {
				toast.error(
					error instanceof Error ? error.message : "Failed to list folders",
				);
			} finally {
				loadingFolders = false;
			}
		})();
	});

	function enterFolder(key: string) {
		if (folderPrefixes.some((p) => isInsidePrefix(p, key))) {
			toast.error("Cannot move or copy a folder into itself");
			return;
		}
		destPrefix = key;
	}

	async function handleCreateFolder() {
		const name = newFolderName.trim();
		if (!name) return;
		try {
			await callS3("createFolder", {
				connectionId,
				bucket: bucketName,
				prefix: destPrefix,
				folderName: name,
			});
			newFolderName = "";
			destPrefix = folderDestPrefix(destPrefix, name);
		} catch (error: unknown) {
			toast.error(
				error instanceof Error ? error.message : "Failed to create folder",
			);
		}
	}

	async function handleConfirm() {
		if (busy) return;
		busy = true;
		try {
			const processed = await runMove({
				connectionId,
				bucket: bucketName,
				mode,
				destParent: destPrefix,
				fileKeys,
				folderPrefixes,
				publicKeys,
			});

			toast.success(
				`${verb}d ${processed} item${processed === 1 ? "" : "s"}`,
			);
			onSuccess();
			onClose();
		} catch (error: unknown) {
			toast.error(error instanceof Error ? error.message : `${verb} failed`);
		} finally {
			busy = false;
		}
	}
</script>

<div
	class="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
	transition:fade={{ duration: 150 }}
>
	<div
		class="bg-card border border-border/40 rounded-2xl shadow-2xl w-full max-w-lg p-5 space-y-4"
		transition:scale={{ start: 0.95, duration: 150 }}
	>
		<div class="flex items-start justify-between gap-4">
			<div>
				<h2 class="text-base font-semibold">
					{verb}
					{#if totalSources === 1 && (srcName || fileKeys.length === 1)}
						<span class="text-primary">"{srcName || fileKeys[0]?.split('/').pop()}"</span>
					{:else}
						{totalSources} item{totalSources === 1 ? "" : "s"}
					{/if}
				</h2>
				<p class="text-xs text-muted-foreground mt-1">
					Choose a destination folder
				</p>
			</div>
			<Button variant="ghost" size="icon" class="h-7 w-7" type="button" onclick={onClose}>
				<span class="sr-only">Close</span>
				✕
			</Button>
		</div>

		<div class="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
			<button
				type="button"
				class={cn(
					"flex items-center gap-1 px-1.5 py-1 rounded hover:bg-accent",
					destPrefix === "" && "text-foreground font-medium bg-accent"
				)}
				onclick={() => (destPrefix = "")}
			>
				<Home size={12} /> {bucketName}
			</button>
			{#each crumbs as crumb (crumb.prefix)}
				<ChevronRight size={12} />
				<button
					type="button"
					class={cn(
						"px-1.5 py-1 rounded hover:bg-accent max-w-32 truncate",
						destPrefix === crumb.prefix && "text-foreground font-medium bg-accent"
					)}
					onclick={() => (destPrefix = crumb.prefix)}
				>
					{crumb.name}
				</button>
			{/each}
		</div>

		<div
			class="border border-border/40 rounded-xl h-56 overflow-y-auto bg-background/50 relative"
		>
			{#if loadingFolders}
				<div class="absolute inset-0 flex items-center justify-center">
					<Loader2 class="animate-spin text-muted-foreground" size={20} />
				</div>
			{:else}
				{#if destPrefix !== ""}
					<button
						type="button"
						class="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left"
						onclick={() =>
							(destPrefix =
							destPrefix.split("/").filter(Boolean).slice(0, -1).join("/") +
							(destPrefix.split("/").filter(Boolean).length > 1 ? "/" : ""))}
					>
						<FolderIcon size={14} class="text-muted-foreground" />
						..
					</button>
				{/if}
				{#if folders.length === 0 && destPrefix === ""}
					<p class="text-sm text-muted-foreground text-center py-8">
						No subfolders — items land in the bucket root
					</p>
				{/if}
				{#each folders as folder (folder.key)}
					<button
						type="button"
						class="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left"
						onclick={() => enterFolder(folder.key)}
					>
						<FolderIcon size={14} class="text-primary fill-primary/10" />
						<span class="truncate">{folder.name}</span>
					</button>
				{/each}
			{/if}
		</div>

		<div class="flex items-center gap-2">
			<Input
				placeholder="New folder name…"
				class="h-8 text-sm"
				bind:value={newFolderName}
				onkeydown={(e) => {
					if (e.key === "Enter") handleCreateFolder();
				}}
			/>
			<Button
				variant="outline"
				size="sm"
				class="h-8 gap-1"
				type="button"
				disabled={!newFolderName.trim() || busy}
				onclick={handleCreateFolder}
			>
				<FolderPlus size={14} /> Create
			</Button>
		</div>

		<p class="text-xs text-muted-foreground truncate">
			{verb} to
			<span class="text-foreground font-medium">{targetPrefix || "bucket root"}</span>
		</p>

		<div class="flex items-center justify-end gap-2">
			<Button variant="outline" size="sm" type="button" onclick={onClose} disabled={busy}>
				Cancel
			</Button>
			<Button size="sm" type="button" onclick={handleConfirm} disabled={busy}>
				{#if busy}
					<Loader2 class="mr-1 animate-spin" size={14} />
				{/if}
				{verb}
			</Button>
		</div>
	</div>
</div>
