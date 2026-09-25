<script lang="ts">
	import { fade, fly } from "svelte/transition";
	import { Download, Link as LinkIcon, Loader2, Lock } from "@lucide/svelte";
	import { toast } from "svelte-sonner";
	import { callS3 } from "$lib/api";
	import Button from "$lib/components/ui/button.svelte";
	import type { BucketConnectionType, S3ObjectInfo } from "$lib/types";
	import { getPublicObjectUrl } from "$lib/utils";

	let {
		connectionId,
		bucketName,
		connectionType,
		publicUrl,
		object,
		onRefresh,
		onClose,
	}: {
		connectionId: string;
		bucketName: string;
		connectionType: BucketConnectionType;
		publicUrl?: string | null;
		object: S3ObjectInfo;
		onRefresh: () => void;
		onClose: () => void;
	} = $props();

	interface Details {
		contentType?: string;
		contentLength?: number;
		etag?: string;
		lastModified?: Date | string | null;
		storageClass?: string;
		metadata?: Record<string, string>;
	}

	let details = $state<Details | null>(null);
	let loading = $state(true);
	let loadId = 0;

	$effect(() => {
		void object.key;
		const id = ++loadId;
		loading = true;
		details = null;
		void (async () => {
			try {
				const r = await callS3<Details & { error?: string }>("getObjectDetails", {
					connectionId,
					bucket: bucketName,
					key: object.key,
				});
				if (id === loadId) details = r;
			} catch (error: unknown) {
				if (id === loadId) {
					toast.error(
						error instanceof Error ? error.message : "Failed to load details",
					);
				}
			} finally {
				if (id === loadId) loading = false;
			}
		})();
	});

	const formatSize = (bytes?: number) => {
		if (bytes === undefined || bytes === null) return "-";
		if (bytes === 0) return "0 Bytes";
		const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
		const i = Math.floor(Math.log(bytes) / Math.log(1024));
		return Math.round((bytes / 1024 ** i) * 10) / 10 + " " + sizes[i];
	};

	const customMetadata = $derived(
		Object.entries(details?.metadata ?? {}).filter(
			([, v]) => typeof v === "string" && v.length > 0,
		),
	);

	async function handleDownload() {
		try {
			const r = await callS3<{ url?: string; error?: string }>("getDownloadUrl", {
				connectionId,
				bucket: bucketName,
				key: object.key,
			});
			if (r.url) window.open(r.url, "_blank");
			else toast.error(r.error || "Failed to get download URL");
		} catch {
			toast.error("Failed to get download URL");
		}
	}

	async function handleTogglePublic() {
		const op = object.isPublic ? "makePrivate" : "makePublic";
		const r = await callS3<{ success?: boolean; error?: string }>(op, {
			connectionId,
			bucket: bucketName,
			key: object.key,
		});
		if (r.success) {
			toast.success(object.isPublic ? "Object is now private" : "Object is now public");
			onRefresh();
			onClose();
		} else {
			toast.error(r.error || "Failed to update access");
		}
	}
</script>

<div class="fixed inset-0 z-50" transition:fade={{ duration: 150 }}>
	<div class="absolute inset-0 bg-background/60 backdrop-blur-[1px]" role="presentation"></div>
	<aside
		class="absolute right-0 top-0 h-full w-full max-w-sm bg-card border-l border-border/40 shadow-2xl p-5 space-y-5 overflow-y-auto"
		transition:fly={{ x: 40, duration: 200 }}
	>
		<div class="flex items-start justify-between gap-3">
			<div class="min-w-0">
				<h2 class="text-sm font-semibold break-all">{object.name}</h2>
				<p class="text-xs text-muted-foreground mt-0.5">Details</p>
			</div>
			<Button variant="ghost" size="icon" class="h-7 w-7 shrink-0" type="button" onclick={onClose}>
				<span class="sr-only">Close details</span>
				✕
			</Button>
		</div>

		{#if loading}
			<div class="flex items-center justify-center py-8">
				<Loader2 class="animate-spin text-muted-foreground" size={20} />
			</div>
		{:else if details}
			<dl class="space-y-3 text-sm">
				<div class="flex justify-between gap-3">
					<dt class="text-muted-foreground shrink-0">Type</dt>
					<dd class="text-right break-all">{details.contentType || "-"}</dd>
				</div>
				<div class="flex justify-between gap-3">
					<dt class="text-muted-foreground shrink-0">Size</dt>
					<dd class="text-right">{formatSize(details.contentLength)}</dd>
				</div>
				<div class="flex justify-between gap-3">
					<dt class="text-muted-foreground shrink-0">Modified</dt>
					<dd class="text-right">
						{details.lastModified
							? new Date(details.lastModified).toLocaleString()
							: "-"}
					</dd>
				</div>
				<div class="flex justify-between gap-3">
					<dt class="text-muted-foreground shrink-0">Storage class</dt>
					<dd class="text-right">{details.storageClass || "-"}</dd>
				</div>
				<div class="flex justify-between gap-3">
					<dt class="text-muted-foreground shrink-0">ETag</dt>
					<dd class="text-right font-mono text-xs break-all">
						{(details.etag || "-").replaceAll('"', "")}
					</dd>
				</div>
				{#if customMetadata.length > 0}
					<div class="border-t border-border/40 pt-3 space-y-2">
						<dt class="text-muted-foreground text-xs uppercase tracking-wide">
							User metadata
						</dt>
						{#each customMetadata as [k, v] (k)}
							<div class="flex justify-between gap-3 text-xs">
								<span class="font-mono text-muted-foreground break-all">{k}</span>
								<span class="text-right break-all">{v}</span>
							</div>
						{/each}
					</div>
				{/if}
			</dl>
		{:else}
			<p class="text-sm text-muted-foreground">No details available.</p>
		{/if}

		<div class="border-t border-border/40 pt-4 space-y-2">
			<Button variant="outline" size="sm" class="w-full justify-start gap-2" type="button" onclick={handleDownload}>
				<Download size={14} /> Download
			</Button>
			<Button
				variant="outline"
				size="sm"
				class="w-full justify-start gap-2"
				type="button"
				onclick={() => {
					navigator.clipboard.writeText(object.key);
					toast.success("Copied to clipboard");
				}}
			>
				<LinkIcon size={14} /> Copy key
			</Button>
			{#if connectionType === "s3"}
				<Button
					variant="outline"
					size="sm"
					class="w-full justify-start gap-2"
					type="button"
					onclick={handleTogglePublic}
				>
					<Lock size={14} />
					{object.isPublic ? "Make private" : "Make public"}
				</Button>
			{:else if object.isPublic || connectionType === "r2"}
				<Button
					variant="outline"
					size="sm"
					class="w-full justify-start gap-2"
					type="button"
					onclick={() => {
						navigator.clipboard.writeText(
							getPublicObjectUrl(bucketName, object.key, publicUrl),
						);
						toast.success("Public URL copied");
					}}
				>
					<LinkIcon size={14} /> Copy public URL
				</Button>
			{/if}
		</div>
	</aside>
</div>
