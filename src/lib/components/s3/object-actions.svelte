<script lang="ts">
	import {
		Copy,
		Download,
		Edit2,
		Eye,
		FolderInput,
		Globe,
		Info,
		Lock,
		MoreVertical,
		Trash2,
	} from "@lucide/svelte";
	import { toast } from "svelte-sonner";
	import { callS3 } from "$lib/api";
	import Button from "$lib/components/ui/button.svelte";
	import type { BucketConnectionType, S3ObjectInfo } from "$lib/types";
	import { cn, getPublicObjectUrl } from "$lib/utils";
	import DeleteFolderDialog from "./delete-folder-dialog.svelte";
	import DetailsDrawer from "./details-drawer.svelte";
	import MoveDialog from "./move-dialog.svelte";
	import PreviewModal from "./preview-modal.svelte";
	import RenameDialog from "./rename-dialog.svelte";

	let {
		connectionId,
		bucketName,
		connectionType,
		publicUrl,
		object,
		onRefresh,
		onDelete,
		onRename,
		currentPrefix,
	}: {
		connectionId: string;
		bucketName: string;
		connectionType: BucketConnectionType;
		publicUrl?: string | null;
		object: S3ObjectInfo;
		onRefresh: () => void;
		onDelete: (key: string) => void;
		onRename?: (oldKey: string, newKey: string) => void;
		currentPrefix?: string;
	} = $props();

	let isOpen = $state(false);
	let openUp = $state(false);
	let showRename = $state(false);
	let showPreview = $state(false);
	let showDeleteFolder = $state(false);
	let showDetails = $state(false);
	let moveMode = $state<"move" | "copy" | null>(null);
	let menuRef: HTMLDivElement | undefined = $state();

	function handleClickOutside(event: MouseEvent) {
		if (menuRef && !menuRef.contains(event.target as Node)) {
			isOpen = false;
		}
	}

	$effect(() => {
		if (isOpen && menuRef) {
			const rect = menuRef.getBoundingClientRect();
			const spaceBelow = window.innerHeight - rect.bottom;
			openUp = spaceBelow < 250;
		}
	});

	async function handleDownload() {
		isOpen = false;
		if (object.type === "folder") {
			const params = new URLSearchParams({
				connectionId,
				bucket: bucketName,
				keys: JSON.stringify([object.key]),
			});
			window.open(`/api/download-zip?${params.toString()}`, "_blank");
			return;
		}
		try {
			const result = await callS3<{ url?: string; error?: string }>("getDownloadUrl", {
				connectionId,
				bucket: bucketName,
				key: object.key,
			});
			if (result.url) {
				window.open(result.url, "_blank");
			} else {
				toast.error(result.error || "Failed to get download URL");
			}
		} catch {
			toast.error("Failed to get download URL");
		}
	}

	function copyToClipboard(text: string) {
		navigator.clipboard.writeText(text);
		toast.success("Copied to clipboard");
		isOpen = false;
	}

	async function handleMakePublic() {
		isOpen = false;
		const result = await callS3<{ success?: boolean; error?: string }>("makePublic", {
			connectionId,
			bucket: bucketName,
			key: object.key,
		});
		if (result.success) {
			toast.success("Object is now public");
			onRefresh();
		} else {
			toast.error(result.error || "Failed to make public");
		}
	}

	async function handleMakePrivate() {
		isOpen = false;
		const result = await callS3<{ success?: boolean; error?: string }>("makePrivate", {
			connectionId,
			bucket: bucketName,
			key: object.key,
		});
		if (result.success) {
			toast.success("Object is now private");
			onRefresh();
		} else {
			toast.error(result.error || "Failed to remove public access");
		}
	}

	function getPublicUrl() {
		return getPublicObjectUrl(bucketName, object.key, publicUrl);
	}
</script>

<svelte:window onmousedown={handleClickOutside} />

<div class="relative" bind:this={menuRef}>
	<Button
		variant="ghost"
		size="icon"
		class="h-8 w-8"
		type="button"
		onclick={(e) => {
			e.stopPropagation();
			isOpen = !isOpen;
		}}
	>
		<MoreVertical size={16} />
	</Button>

	{#if isOpen}
		<div
			class={cn(
				"absolute right-0 w-48 bg-card border border-border/40 rounded-xl shadow-xl z-1000 py-1 overflow-hidden",
				openUp ? "bottom-full mb-2" : "top-full mt-2"
			)}
		>
			{#if object.type === "file"}
				<button
					type="button"
					onclick={() => {
						showPreview = true;
						isOpen = false;
					}}
					class="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-accent text-left transition-colors"
				>
					<Eye size={14} class="text-muted-foreground" />
					Preview
				</button>
			{/if}

			<button
				type="button"
				onclick={handleDownload}
				class="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-accent text-left transition-colors"
			>
				<Download size={14} class="text-muted-foreground" />
				{object.type === "folder" ? "Download as ZIP" : "Download"}
			</button>

			<button
				type="button"
				onclick={() => {
					showRename = true;
					isOpen = false;
				}}
				class="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-accent text-left transition-colors"
			>
				<Edit2 size={14} class="text-muted-foreground" />
				Rename
			</button>

			<button
				type="button"
				onclick={() => {
					moveMode = "move";
					isOpen = false;
				}}
				class="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-accent text-left transition-colors"
			>
				<FolderInput size={14} class="text-muted-foreground" />
				Move…
			</button>

			<button
				type="button"
				onclick={() => {
					moveMode = "copy";
					isOpen = false;
				}}
				class="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-accent text-left transition-colors"
			>
				<Copy size={14} class="text-muted-foreground" />
				Copy…
			</button>

			{#if object.type === "file"}
				<button
					type="button"
					onclick={() => {
						showDetails = true;
						isOpen = false;
					}}
					class="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-accent text-left transition-colors"
				>
					<Info size={14} class="text-muted-foreground" />
					Details
				</button>
			{/if}

			<button
				type="button"
				onclick={() => copyToClipboard(object.key)}
				class="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-accent text-left transition-colors"
			>
				<Copy size={14} class="text-muted-foreground" />
				Copy Key
			</button>

			{#if !object.isPublic && object.type === "file"}
				<button
					type="button"
					onclick={handleMakePublic}
					class="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-accent text-left transition-colors"
				>
					<Globe size={14} class="text-muted-foreground" />
					Make Public
				</button>
			{/if}

			{#if object.isPublic && object.type === "file"}
				<button
					type="button"
					onclick={handleMakePrivate}
					class="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-accent text-left transition-colors"
				>
					<Lock size={14} class="text-muted-foreground" />
					Make Private
				</button>
			{/if}

			{#if object.isPublic}
				<button
					type="button"
					onclick={() => copyToClipboard(getPublicUrl())}
					class="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-accent text-left transition-colors"
				>
					<Globe size={14} class="text-muted-foreground" />
					Copy Public URL
				</button>
			{/if}

			<div class="h-px bg-border/40 my-1"></div>

			<button
				type="button"
				onclick={() => {
					if (object.type === "folder") {
						showDeleteFolder = true;
					} else {
						onDelete(object.key);
					}
					isOpen = false;
				}}
				class="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-destructive/10 text-destructive text-left transition-colors"
			>
				<Trash2 size={14} />
				Delete
			</button>
		</div>
	{/if}

	{#if showDeleteFolder}
		<DeleteFolderDialog
			{connectionId}
			{bucketName}
			folderKey={object.key}
			folderName={object.name}
			onClose={() => (showDeleteFolder = false)}
			onSuccess={onRefresh}
		/>
	{/if}

	{#if showRename}
		<RenameDialog
			{connectionId}
			{bucketName}
			oldKey={object.key}
			onClose={() => (showRename = false)}
			onSuccess={onRefresh}
			onOptimisticRename={onRename}
		/>
	{/if}

	{#if moveMode}
		<MoveDialog
			{connectionId}
			{bucketName}
			mode={moveMode}
			fileKeys={object.type === "file" ? [object.key] : []}
			folderPrefixes={object.type === "folder" ? [object.key] : []}
			srcName={object.name}
			currentPrefix={currentPrefix ?? ""}
			publicKeys={object.isPublic ? [object.key] : []}
			onClose={() => (moveMode = null)}
			onSuccess={onRefresh}
		/>
	{/if}

	{#if showDetails}
		<DetailsDrawer
			{connectionId}
			{bucketName}
			{connectionType}
			{publicUrl}
			{object}
			onRefresh={onRefresh}
			onClose={() => (showDetails = false)}
		/>
	{/if}

	{#if showPreview}
		<PreviewModal
			{connectionId}
			{bucketName}
			{object}
			onClose={() => (showPreview = false)}
		/>
	{/if}
</div>
