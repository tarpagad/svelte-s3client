<script lang="ts">
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

	let {
		connectionId,
		bucketName,
		prefix,
		onSuccess,
	}: {
		connectionId: string;
		bucketName: string;
		prefix: string;
		onSuccess: () => void;
	} = $props();

	interface FileStatus {
		file: File;
		status: "pending" | "uploading" | "success" | "error";
		error?: string;
	}

	let isDragActive = $state(false);
	let files = $state<FileStatus[]>([]);
	let isUploading = $state(false);
	let isPublic = $state(true);
	let fileInput: HTMLInputElement | undefined = $state();

	function addFiles(newFiles: File[]) {
		files = [
			...files,
			...newFiles.map((file) => ({ file, status: "pending" as const })),
		];
	}

	function handleFileChange() {
		if (fileInput?.files && fileInput.files.length > 0) {
			addFiles(Array.from(fileInput.files));
		}
		if (fileInput) {
			fileInput.value = "";
		}
	}

	function onDragOver(e: DragEvent) {
		e.preventDefault();
		isDragActive = true;
	}

	function onDragLeave() {
		isDragActive = false;
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		isDragActive = false;
		if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
			addFiles(Array.from(e.dataTransfer.files));
		}
	}

	function removeFile(index: number) {
		files = files.filter((_, i) => i !== index);
	}

	async function handleUpload() {
		if (files.length === 0) return;

		isUploading = true;
		let successCount = 0;
		let failCount = 0;

		const uploadedFiles = [...files];

		for (let i = 0; i < uploadedFiles.length; i++) {
			const fileStatus = uploadedFiles[i];
			if (fileStatus.status === "success") continue;

			uploadedFiles[i] = { ...fileStatus, status: "uploading" };
			files = [...uploadedFiles];

			const formData = new FormData();
			formData.append("connectionId", connectionId);
			formData.append("bucket", bucketName);
			formData.append("key", prefix + fileStatus.file.name);
			formData.append("isPublic", isPublic ? "true" : "false");
			formData.append("file", fileStatus.file);

			try {
				const result = await uploadToS3(formData);
				if (result.success) {
					uploadedFiles[i] = { ...fileStatus, status: "success" };
					successCount++;
				} else {
					uploadedFiles[i] = {
						...fileStatus,
						status: "error",
						error: result.error || "Upload failed",
					};
					failCount++;
				}
			} catch {
				uploadedFiles[i] = {
					...fileStatus,
					status: "error",
					error: "Network error",
				};
				failCount++;
			}
			files = [...uploadedFiles];
		}

		isUploading = false;

		if (successCount > 0) {
			toast.success(`Uploaded ${successCount} file${successCount !== 1 ? "s" : ""}`);
			onSuccess();
			setTimeout(() => {
				files = files.filter((f) => f.status !== "success");
			}, 2000);
		}

		if (failCount > 0) {
			toast.error(`Failed to upload ${failCount} file${failCount !== 1 ? "s" : ""}`);
		}
	}
</script>

<div class="space-y-4">
	<div
		role="button"
		tabindex="0"
		ondragover={onDragOver}
		ondragleave={onDragLeave}
		ondrop={onDrop}
		class={`
			border-2 border-dashed rounded-2xl p-8 transition-all flex flex-col items-center justify-center space-y-4
			${isDragActive ? "border-primary bg-primary/5 scale-[1.01]" : "border-border/60 hover:border-border hover:bg-muted/30"}
			${files.length > 0 ? "bg-primary/5 border-primary/40" : ""}
		`}
	>
		<input
			type="file"
			multiple
			class="hidden"
			bind:this={fileInput}
			onchange={handleFileChange}
		/>

		{#if files.length > 0}
			<div class="flex flex-col items-center space-y-4 w-full">
				<div class="w-full max-h-[300px] overflow-y-auto space-y-2 pr-2">
					{#each files as fileStatus, index (`${fileStatus.file.name}-${index}`)}
						<div
							class="flex items-center justify-between bg-background/50 p-3 rounded-lg border text-sm"
						>
							<div class="flex items-center gap-3 overflow-hidden">
								<div class="p-2 bg-primary/10 rounded-md text-primary">
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
								{#if fileStatus.status !== "uploading"}
									<button
										type="button"
										onclick={() => removeFile(index)}
										class="text-muted-foreground hover:text-destructive transition-colors p-1"
									>
										<X size={16} />
									</button>
								{/if}
							</div>
						</div>
					{/each}
				</div>

				<div
					class="flex items-center space-x-2 bg-muted/50 py-2 px-4 rounded-full border border-primary/20"
				>
					<input
						type="checkbox"
						id="is-public"
						bind:checked={isPublic}
						class="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
					/>
					<label for="is-public" class="text-sm font-medium cursor-pointer select-none">
						Make files public automatically
					</label>
				</div>

				<div class="flex gap-3 w-full max-w-xs">
					<Button variant="ghost" class="flex-1" onclick={() => (files = [])} disabled={isUploading} type="button">
						Clear All
					</Button>
					<Button
						class="flex-1"
						onclick={handleUpload}
						disabled={isUploading || files.some((f) => f.status === "uploading")}
						type="button"
					>
						{#if isUploading}
							<Loader2 class="animate-spin" size={18} />
						{:else}
							<Upload size={18} class="mr-2" />
							Upload
							{#if files.filter((f) => f.status === "pending").length > 0}
								({files.filter((f) => f.status === "pending").length})
							{/if}
						{/if}
					</Button>
				</div>
			</div>
		{:else}
			<div class="bg-muted p-4 rounded-full text-muted-foreground group-hover:text-primary transition-colors">
				<Upload size={32} />
			</div>
			<div class="text-center space-y-1">
				<p class="font-medium">Click or drag files to upload</p>
				<p class="text-xs text-muted-foreground">Multiple files supported (Max 100MB per file)</p>
			</div>
			<Button variant="outline" size="sm" onclick={() => fileInput?.click()}>
				Select Files
			</Button>
		{/if}
	</div>
</div>
