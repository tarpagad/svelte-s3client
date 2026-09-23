<script lang="ts">
	import { fade, scale } from "svelte/transition";
	import {
		AlertCircle,
		CheckCircle,
		File as FileIcon,
		Loader2,
		Upload,
		X,
	} from "@lucide/svelte";
	import { toast } from "svelte-sonner";
	import { uploadToS3 } from "$lib/api";
	import Button from "$lib/components/ui/button.svelte";

	interface FileStatus {
		file: File;
		status: "pending" | "uploading" | "success" | "error";
		error?: string;
	}

	let {
		connectionId,
		bucketName,
		prefix,
		files: initialFiles,
		onClose,
		onSuccess,
	}: {
		connectionId: string;
		bucketName: string;
		prefix: string;
		files: File[];
		onClose: () => void;
		onSuccess: () => void;
	} = $props();

	let files = $state<FileStatus[]>(
		initialFiles.map((file) => ({ file, status: "pending" as const }))
	);
	let isUploading = $state(false);
	let isPublic = $state(true);

	async function handleUpload() {
		isUploading = true;
		let successCount = 0;
		let failCount = 0;

		const updatedFiles = [...files];

		for (let i = 0; i < updatedFiles.length; i++) {
			const fileStatus = updatedFiles[i];
			if (fileStatus.status === "success") continue;

			updatedFiles[i] = { ...fileStatus, status: "uploading" };
			files = [...updatedFiles];

			const formData = new FormData();
			formData.append("connectionId", connectionId);
			formData.append("bucket", bucketName);
			formData.append("key", prefix + fileStatus.file.name);
			formData.append("isPublic", isPublic ? "true" : "false");
			formData.append("file", fileStatus.file);

			try {
				const result = await uploadToS3(formData);
				if (result.success) {
					updatedFiles[i] = { ...fileStatus, status: "success" };
					successCount++;
				} else {
					updatedFiles[i] = {
						...fileStatus,
						status: "error",
						error: result.error || "Upload failed",
					};
					failCount++;
				}
			} catch {
				updatedFiles[i] = {
					...fileStatus,
					status: "error",
					error: "Network error",
				};
				failCount++;
			}
			files = [...updatedFiles];
		}

		isUploading = false;

		if (successCount > 0) {
			toast.success(`Uploaded ${successCount} file${successCount !== 1 ? "s" : ""}`);
			onSuccess();
			if (failCount === 0) {
				setTimeout(onClose, 1500);
			}
		}

		if (failCount > 0) {
			toast.error(`Failed to upload ${failCount} file${failCount !== 1 ? "s" : ""}`);
		}
	}
</script>

<div
	class="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
	transition:fade={{ duration: 150 }}
>
	<div
		class="bg-card border border-border/40 rounded-2xl shadow-2xl w-full max-w-lg p-6"
		transition:scale={{ duration: 150, start: 0.95 }}
	>
		<div class="space-y-4">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-3">
					<div class="p-2 rounded-lg bg-primary/10 text-primary">
						<Upload size={24} />
					</div>
					<div class="space-y-1">
						<h2 class="text-xl font-bold tracking-tight">Confirm Upload</h2>
						<p class="text-sm text-muted-foreground">
							Uploading to
							<span class="font-mono text-xs bg-muted px-1 py-0.5 rounded">{prefix || "/"}</span>
						</p>
					</div>
				</div>
				<Button variant="ghost" size="icon" onclick={onClose} disabled={isUploading}>
					<X size={20} />
				</Button>
			</div>

			<div class="max-h-[300px] overflow-y-auto space-y-2 pr-2">
				{#each files as fileStatus, index (`${fileStatus.file.name}-${index}`)}
					<div class="flex items-center justify-between bg-muted/30 p-3 rounded-lg border text-sm">
						<div class="flex items-center gap-3 overflow-hidden">
							<div class="p-2 bg-primary/10 rounded-md text-primary shrink-0">
								<FileIcon size={16} />
							</div>
							<div class="flex flex-col min-w-0">
								<span class="font-medium truncate">{fileStatus.file.name}</span>
								<span class="text-xs text-muted-foreground">
									{(fileStatus.file.size / 1024 / 1024).toFixed(2)} MB
									{#if fileStatus.error}
										<span class="text-destructive ml-2">- {fileStatus.error}</span>
									{/if}
								</span>
							</div>
						</div>

						<div class="flex items-center gap-2">
							{#if fileStatus.status === "uploading"}
								<Loader2 class="animate-spin text-muted-foreground" size={16} />
							{/if}
							{#if fileStatus.status === "success"}
								<CheckCircle class="text-green-500" size={16} />
							{/if}
							{#if fileStatus.status === "error"}
								<AlertCircle class="text-destructive" size={16} />
							{/if}
						</div>
					</div>
				{/each}
			</div>

			<div class="flex items-center space-x-2 py-2">
				<input
					type="checkbox"
					id="is-public-confirm"
					bind:checked={isPublic}
					disabled={isUploading}
					class="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
				/>
				<label for="is-public-confirm" class="text-sm font-medium cursor-pointer select-none">
					Make files public automatically
				</label>
			</div>

			<div class="flex justify-end gap-3 pt-2">
				<Button variant="ghost" onclick={onClose} disabled={isUploading}>
					Cancel
				</Button>
				<Button
					onclick={handleUpload}
					disabled={isUploading || files.every((f) => f.status === "success")}
					class="min-w-[120px] gap-2"
				>
					{#if isUploading}
						<Loader2 class="animate-spin" size={16} />
					{:else}
						<Upload size={16} />
						Upload Files
					{/if}
				</Button>
			</div>
		</div>
	</div>
</div>
