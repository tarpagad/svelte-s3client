<script lang="ts">
	import { fade, scale } from "svelte/transition";
	import {
		Download,
		File as FileIcon,
		FileText,
		Image as ImageIcon,
		Loader2,
		X,
	} from "@lucide/svelte";
	import { toast } from "svelte-sonner";
	import { callS3 } from "$lib/api";
	import Button from "$lib/components/ui/button.svelte";
	import type { S3ObjectInfo } from "$lib/types";

	let {
		connectionId,
		bucketName,
		object,
		onClose,
	}: {
		connectionId: string;
		bucketName: string;
		object: S3ObjectInfo;
		onClose: () => void;
	} = $props();

	let loading = $state(true);
	let downloadUrl = $state<string | null>(null);
	let textContent = $state<string | null>(null);
	let previewType = $state<"image" | "text" | "pdf" | "other">("other");

	$effect(() => {
		let cancelled = false;

		async function initPreview() {
			loading = true;
			const ext = object.extension?.toLowerCase() || "";

			if (["jpg", "jpeg", "png", "gif", "svg", "webp"].includes(ext)) {
				previewType = "image";
				const result = await callS3<{ url?: string; error?: string }>("getDownloadUrl", {
					connectionId,
					bucket: bucketName,
					key: object.key,
				});
				if (!cancelled && result.url) downloadUrl = result.url;
			} else if (["pdf"].includes(ext)) {
				previewType = "pdf";
				const result = await callS3<{ url?: string; error?: string }>("getDownloadUrl", {
					connectionId,
					bucket: bucketName,
					key: object.key,
				});
				if (!cancelled && result.url) downloadUrl = result.url;
			} else if (
				["txt", "md", "json", "js", "ts", "tsx", "jsx", "css", "py", "html"].includes(ext)
			) {
				previewType = "text";
				const result = await callS3<{ content?: string; error?: string }>("getFileContent", {
					connectionId,
					bucket: bucketName,
					key: object.key,
				});
				if (!cancelled) {
					if (result.content) textContent = result.content;
					if (result.error) toast.error(result.error);
				}
			} else {
				previewType = "other";
			}

			if (!cancelled) loading = false;
		}

		initPreview();

		return () => {
			cancelled = true;
		};
	});

	async function handleDownload() {
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
	}
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key === "Escape") onClose();
	}}
/>

<div
	class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
	transition:fade={{ duration: 150 }}
>
	<div
		class="bg-card border border-border/40 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
		transition:scale={{ duration: 150, start: 0.95 }}
	>
		<div class="p-4 border-b flex items-center justify-between bg-muted/30">
			<div class="flex items-center gap-3">
				<div class="p-2 bg-primary/10 rounded-lg text-primary">
					{#if previewType === "image"}
						<ImageIcon size={20} />
					{:else if previewType === "text"}
						<FileText size={20} />
					{:else}
						<FileIcon size={20} />
					{/if}
				</div>
				<div>
					<h3 class="font-semibold text-sm truncate max-w-50 md:max-w-md">{object.name}</h3>
					<p class="text-[10px] text-muted-foreground uppercase tracking-widest">Preview Mode</p>
				</div>
			</div>
			<div class="flex items-center gap-2">
				<Button variant="outline" size="sm" class="h-8 gap-2" onclick={handleDownload} type="button">
					<Download size={14} />
					Download
				</Button>
				<Button variant="ghost" size="icon" class="h-8 w-8 rounded-full" onclick={onClose} type="button">
					<X size={18} />
				</Button>
			</div>
		</div>

		<div class="flex-1 overflow-auto bg-muted/10 p-4 md:p-8 flex items-center justify-center min-h-75">
			{#if loading}
				<div class="flex flex-col items-center gap-3">
					<Loader2 class="animate-spin text-primary" size={40} />
					<p class="text-sm text-muted-foreground">Loading preview...</p>
				</div>
			{:else if previewType === "image" && downloadUrl}
				<div class="relative group">
					<img
						src={downloadUrl}
						alt={object.name}
						class="max-w-full max-h-[60vh] rounded-lg shadow-lg object-contain bg-white/5"
					/>
				</div>
			{:else if previewType === "pdf" && downloadUrl}
				<iframe src={downloadUrl} class="w-full h-[60vh] rounded-lg border shadow-sm" title={object.name}></iframe>
			{:else if previewType === "text" && textContent !== null}
				<div
					class="w-full h-full bg-card/50 border rounded-lg p-4 font-mono text-sm overflow-auto max-h-[60vh] whitespace-pre-wrap selection:bg-primary/20"
				>
					{textContent}
				</div>
			{:else}
				<div class="text-center space-y-4 max-w-sm">
					<div
						class="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto text-muted-foreground/50"
					>
						<FileIcon size={40} />
					</div>
					<div>
						<h4 class="font-medium">No preview available</h4>
						<p class="text-sm text-muted-foreground">
							We don't support online preview for this file type yet.
						</p>
					</div>
					<Button onclick={handleDownload} class="w-full" type="button">Download to view</Button>
				</div>
			{/if}
		</div>

		<div class="p-3 border-t bg-muted/30 flex items-center justify-between text-[11px] text-muted-foreground">
			<div class="flex gap-4">
				<span>
					Size:
					{(object.size || 0) > 1024 * 1024
						? `${((object.size || 0) / (1024 * 1024)).toFixed(2)} MB`
						: `${((object.size || 0) / 1024).toFixed(2)} KB`}
				</span>
				<span>
					Modified:
					{object.lastModified ? new Date(object.lastModified).toLocaleDateString() : "Unknown"}
				</span>
			</div>
			<div class="hidden sm:block">
				Press <kbd class="bg-muted px-1 rounded border">Esc</kbd> to close
			</div>
		</div>
	</div>
</div>
