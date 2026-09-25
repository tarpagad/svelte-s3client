<script lang="ts">
	import { fade, fly } from "svelte/transition";
	import {
		ChevronLeft,
		ChevronRight,
		CloudUpload,
		Code2,
		Copy as CopyIcon,
		File as FileIcon,
		Folder,
		FolderInput,
		FolderPlus,
		Grid,
		Image as ImageIcon,
		Link as LinkIcon,
		List as ListIcon,
		Loader2,
		Lock,
		Music,
		Plus,
		Search,
		Trash2,
		Video,
	} from "@lucide/svelte";
	import { toast } from "svelte-sonner";
	import { callS3 } from "$lib/api";
	import { isInsidePrefix } from "$lib/move-path";
	import { runMove } from "$lib/move-run";
	import { runRestore, runTrash } from "$lib/trash-run";
	import Button from "$lib/components/ui/button.svelte";
	import Card from "$lib/components/ui/card.svelte";
	import CardContent from "$lib/components/ui/card-content.svelte";
	import Input from "$lib/components/ui/input.svelte";
	import type { UserPrefs } from "$lib/prefs";
	import type { BucketConnectionType, S3ObjectInfo } from "$lib/types";
	import { cn, getPublicObjectUrl } from "$lib/utils";
	import Breadcrumbs from "./breadcrumbs.svelte";
	import BulkDeleteDialog from "./bulk-delete-dialog.svelte";
	import ConfirmUploadDialog from "./confirm-upload-dialog.svelte";
	import CreateFolderDialog from "./create-folder-dialog.svelte";
	import MoveDialog from "./move-dialog.svelte";
	import ObjectActions from "./object-actions.svelte";
	import PreviewModal from "./preview-modal.svelte";
	import UploadZone from "./upload-zone.svelte";

	let {
		connectionId,
		bucketName,
		connectionType,
		publicUrl,
		initialObjects,
		initialNextToken,
		initialPrefs,
	}: {
		connectionId: string;
		bucketName: string;
		connectionType: BucketConnectionType;
		publicUrl?: string | null;
		initialObjects: S3ObjectInfo[];
		initialNextToken?: string;
		initialPrefs: UserPrefs;
	} = $props();

	let prefix = $state("");
	let objects = $state<S3ObjectInfo[]>(initialObjects);
	let loading = $state(false);
	let searchQuery = $state("");
	let viewMode = $state<"list" | "grid">(initialPrefs.viewMode);
	let showUpload = $state(false);
	let showCreateFolder = $state(false);
	let previewObject = $state<S3ObjectInfo | null>(null);
	let nextToken = $state<string | undefined>(initialNextToken);
	let prevTokens = $state<string[]>([]);
	let currentPage = $state(1);
	let sortBy = $state<"date-desc" | "date-asc" | "name-asc" | "name-desc">("date-desc");
	let totalItems = $state<number | null>(null);
	let tokenCache = $state<(string | undefined)[]>([undefined]);
	let isSearching = $state(false);
	let selectedKeys = $state<Set<string>>(new Set());
	let isDragActive = $state(false);
	let droppedFiles = $state<File[]>([]);
	let showConfirmUpload = $state(false);
	let showBulkDelete = $state(false);
	let bulkMoveMode = $state<"move" | "copy" | null>(null);
	let dragKeys = $state<string[] | null>(null);
	let dropTarget = $state<string | null>(null);

	$effect(() => {
		void objects;
		void prefix;
		void searchQuery;
		selectedKeys = new Set();
	});

	function toggleSelection(key: string) {
		const newSet = new Set(selectedKeys);
		if (newSet.has(key)) {
			newSet.delete(key);
		} else {
			newSet.add(key);
		}
		selectedKeys = newSet;
	}

	function toggleSelectAll() {
		if (selectedKeys.size === objects.length && objects.length > 0) {
			selectedKeys = new Set();
		} else {
			selectedKeys = new Set(objects.map((o) => o.key));
		}
	}

	const selectedFiles = $derived.by(() =>
		[...selectedKeys].filter((k) => !k.endsWith("/"))
	);
	const selectedFolders = $derived.by(() =>
		[...selectedKeys].filter((k) => k.endsWith("/"))
	);
	const selectedPublicFiles = $derived.by(() =>
		objects.filter(
			(o) => selectedKeys.has(o.key) && o.isPublic && o.type === "file"
		)
	);
	const selectedPublicKeys = $derived.by(() =>
		objects.filter((o) => selectedKeys.has(o.key) && o.isPublic).map((o) => o.key)
	);

	function handleBulkMove(mode: "move" | "copy") {
		if (selectedKeys.size === 0) return;
		bulkMoveMode = mode;
	}

	async function handleBulkMakePrivate() {
		const keys = selectedPublicFiles.map((o) => o.key);
		if (keys.length === 0) return;
		if (
			!confirm(
				`Make ${keys.length} file${keys.length === 1 ? "" : "s"} private?`
			)
		)
			return;

		const promises = keys.map((key) =>
			callS3<{ success?: boolean; error?: string }>("makePrivate", {
				connectionId,
				bucket: bucketName,
				key,
			})
		);

		toast.promise(Promise.all(promises), {
			loading: "Updating permissions...",
			success: () => {
				fetchObjects(prefix);
				return "Items are now private";
			},
			error: "Failed to update permissions",
		});
	}

	function handleBulkDelete() {
		showBulkDelete = true;
	}

	async function handleBulkMakePublic() {
		if (!confirm(`Make ${selectedKeys.size} items public?`)) return;

		const keys = Array.from(selectedKeys);
		const promises = keys.map((key) =>
			callS3<{ success?: boolean; error?: string }>("makePublic", {
				connectionId,
				bucket: bucketName,
				key,
			})
		);

		toast.promise(Promise.all(promises), {
			loading: "Updating permissions...",
			success: () => {
				fetchObjects(prefix);
				return "Items are now public";
			},
			error: "Failed to update permissions",
		});
	}

	function handleBulkDownload() {
		const keys = Array.from(selectedKeys);
		if (keys.length === 0) return;

		const params = new URLSearchParams({
			connectionId,
			bucket: bucketName,
			keys: JSON.stringify(keys),
		});
		window.open(`/api/download-zip?${params.toString()}`, "_blank");
		selectedKeys = new Set();
	}

	const safeDate = (date: Date | string | undefined): Date | undefined => {
		if (!date) return undefined;
		return new Date(date);
	};

	async function fetchObjects(
		newPrefix: string,
		token?: string,
		sortStr?: typeof sortBy
	) {
		loading = true;
		try {
			const data = await callS3<{
				objects: S3ObjectInfo[];
				nextToken?: string;
				totalObjects?: number;
			}>("listObjects", {
				connectionId,
				bucket: bucketName,
				prefix: newPrefix,
				maxKeys: initialPrefs.itemsPerPage,
				continuationToken: token,
				sortBy: sortStr || sortBy,
			});

			const fixedObjects = data.objects.map((obj) => ({
				...obj,
				lastModified: safeDate(obj.lastModified),
			}));

			objects = fixedObjects;
			nextToken = data.nextToken;
			prefix = newPrefix;

			if (!token) {
				prevTokens = [];
				currentPage = 1;
				if (data.totalObjects !== undefined) {
					totalItems = data.totalObjects;
				}
			}

			if (data.nextToken) {
				const next = [...tokenCache];
				next[currentPage] = data.nextToken;
				tokenCache = next;
			} else {
				tokenCache = tokenCache.slice(0, currentPage);
			}
			isSearching = false;
		} catch (error: unknown) {
			toast.error(error instanceof Error ? error.message : "Failed to load objects");
		} finally {
			loading = false;
		}
	}

	async function handleNextPage() {
		if (!nextToken) return;
		prevTokens = [...prevTokens, nextToken];
		currentPage = currentPage + 1;
		await fetchObjects(prefix, nextToken);
	}

	async function handlePrevPage() {
		if (currentPage === 1) return;
		const newPrevTokens = [...prevTokens];
		newPrevTokens.pop();
		const lastToken = newPrevTokens[newPrevTokens.length - 1];
		prevTokens = newPrevTokens;
		currentPage = currentPage - 1;
		await fetchObjects(prefix, lastToken);
	}

	async function jumpToPage(page: number) {
		if (page === currentPage || page < 1) return;
		if (totalItems && page > Math.ceil(totalItems / initialPrefs.itemsPerPage)) return;

		if (page <= tokenCache.length) {
			const token = tokenCache[page - 1];
			const newPrevTokens: string[] = [];
			for (let i = 1; i < page; i++) {
				const t = tokenCache[i];
				if (t) newPrevTokens.push(t);
			}
			prevTokens = newPrevTokens;
			currentPage = page;
			await fetchObjects(prefix, token);
		} else {
			toast.info("Please navigate sequentially to caching pages.");
		}
	}

	async function handleSearchExecute() {
		if (!searchQuery.trim()) {
			fetchObjects(prefix);
			return;
		}

		loading = true;
		isSearching = true;
		try {
			const data = await callS3<{ objects: S3ObjectInfo[]; totalObjects?: number }>(
				"searchObjects",
				{ connectionId, bucket: bucketName, prefix, query: searchQuery }
			);
			const fixedObjects = data.objects.map((obj) => ({
				...obj,
				lastModified: safeDate(obj.lastModified),
			}));
			objects = fixedObjects;
			nextToken = undefined;
			totalItems = data.totalObjects ?? data.objects.length;
		} catch (error: unknown) {
			toast.error(error instanceof Error ? error.message : "Search failed");
		} finally {
			loading = false;
		}
	}

	function handlePreview(obj: S3ObjectInfo) {
		if (obj.type === "file") {
			previewObject = obj;
		}
	}

	const filteredObjects = $derived(
		isSearching
			? objects
			: objects.filter((obj) => obj.name.toLowerCase().includes(searchQuery.toLowerCase()))
	);

	const sortedObjects = $derived(
		[...filteredObjects].sort((a, b) => {
			if (a.type !== b.type) return a.type === "folder" ? -1 : 1;

			if (sortBy === "date-desc") {
				return (toTime(b.lastModified) || 0) - (toTime(a.lastModified) || 0);
			}
			if (sortBy === "date-asc") {
				return (toTime(a.lastModified) || 0) - (toTime(b.lastModified) || 0);
			}
			if (sortBy === "name-asc") {
				return a.name.localeCompare(b.name);
			}
			if (sortBy === "name-desc") {
				return b.name.localeCompare(a.name);
			}
			return 0;
		})
	);

	const toTime = (date: Date | string | undefined) => {
		if (!date) return 0;
		return new Date(date).getTime();
	};

	const totalPages = $derived(
		totalItems ? Math.ceil(totalItems / initialPrefs.itemsPerPage) : 0
	);

	const pageList = $derived.by(() => {
		if (!totalPages) return [] as number[];
		return Array.from({ length: totalPages }, (_, i) => i + 1).filter(
			(p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1
		);
	});

	const formatSize = (bytes?: number) => {
		if (bytes === undefined) return "-";
		const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
		if (bytes === 0) return "0 Byte";
		const i = Math.floor(Math.log(bytes) / Math.log(1024));
		return Math.round(bytes / 1024 ** i) + " " + sizes[i];
	};

	async function handleDelete(key: string) {
		if (!confirm("Move this item to the trash?")) return;

		const previousObjects = [...objects];
		objects = objects.filter((obj) => obj.key !== key);

		try {
			const { count, trashed } = await runTrash({
				connectionId,
				bucket: bucketName,
				keys: [key],
			});
			toast.success(
				count > 1 ? `${count} items moved to trash` : "Moved to trash",
				{
					duration: 8000,
					action: {
						label: "Undo",
						onClick: () => {
							runRestore({ connectionId, bucket: bucketName, keys: trashed })
								.then((n) => {
									toast.success(n === 1 ? "Restored" : `${n} items restored`);
									fetchObjects(prefix);
								})
								.catch(() => toast.error("Failed to restore"));
						},
					},
				}
			);
		} catch (error: unknown) {
			objects = previousObjects;
			toast.error(error instanceof Error ? error.message : "Failed to delete");
		}
	}

	function handleOptimisticRename(oldKey: string, newKey: string) {
		objects = objects.map((obj) => {
			if (obj.key === oldKey) {
				const name = newKey.split("/").pop() || "";
				const extension = name.split(".").pop();
				return { ...obj, key: newKey, name, extension };
			}
			return obj;
		});
	}

	function onRowDragStart(e: DragEvent, key: string) {
		dragKeys =
			selectedKeys.size > 0 && selectedKeys.has(key)
				? [...selectedKeys]
				: [key];
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = "move";
			e.dataTransfer.setData("text/plain", key);
		}
	}

	function onRowDragEnd() {
		dragKeys = null;
		dropTarget = null;
	}

	function onFolderDragOver(e: DragEvent, key: string) {
		if (!dragKeys) return;
		e.preventDefault();
		e.stopPropagation();
		dropTarget = key;
	}

	function onFolderDragLeave() {
		dropTarget = null;
	}

	async function performDrop(keys: string[], destParent: string) {
		dragKeys = null;
		dropTarget = null;
		if (keys.length === 0) return;
		if (keys.some((k) => k.endsWith("/") && isInsidePrefix(k, destParent))) {
			toast.error("Cannot move a folder into itself");
			return;
		}
		const p = runMove({
			connectionId,
			bucket: bucketName,
			mode: "move",
			destParent,
			fileKeys: keys.filter((k) => !k.endsWith("/")),
			folderPrefixes: keys.filter((k) => k.endsWith("/")),
		});
		toast.promise(p, {
			loading: "Moving items…",
			success: (n: number) => `${n} item${n === 1 ? "" : "s"} moved`,
			error: "Move failed",
		});
		try {
			await p;
			selectedKeys = new Set();
			await fetchObjects(prefix);
		} catch {
			// surfaced via toast.promise
		}
	}

	function onFolderDrop(e: DragEvent, destParent: string) {
		e.preventDefault();
		e.stopPropagation();
		void performDrop(dragKeys ?? [], destParent);
	}

	function onGlobalDragOver(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		// Internal row drags carry no files — keep the upload overlay off.
		if (e.dataTransfer?.types.includes("Files")) isDragActive = true;
	}

	function onGlobalDragLeave(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		if (e.relatedTarget === null) {
			isDragActive = false;
		}
	}

	function onGlobalDrop(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		isDragActive = false;
		if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
			droppedFiles = Array.from(e.dataTransfer.files);
			showConfirmUpload = true;
		}
	}
</script>

{#snippet fileIcon(obj: S3ObjectInfo)}
	{#if obj.type === "folder"}
		<Folder class="text-primary fill-primary/10" size={18} />
	{:else}
		{@const ext = obj.extension?.toLowerCase()}
		{#if ["jpg", "jpeg", "png", "gif", "svg", "webp"].includes(ext || "")}
			<ImageIcon class="text-indigo-500" size={18} />
		{:else if ["mp4", "webm", "mov", "avi"].includes(ext || "")}
			<Video class="text-pink-500" size={18} />
		{:else if ["mp3", "wav", "ogg"].includes(ext || "")}
			<Music class="text-amber-500" size={18} />
		{:else if ["js", "ts", "tsx", "jsx", "py", "go", "rs", "html", "css", "json", "mjs"].includes(ext || "")}
			<Code2 class="text-blue-500" size={18} />
		{:else}
			<FileIcon class="text-muted-foreground" size={18} />
		{/if}
	{/if}
{/snippet}

{#snippet fileIconLarge(obj: S3ObjectInfo)}
	{#if obj.type === "folder"}
		<Folder size={40} class="text-primary fill-primary/10" />
	{:else}
		{@const ext = obj.extension?.toLowerCase()}
		{#if ["jpg", "jpeg", "png", "gif", "svg", "webp"].includes(ext || "")}
			<ImageIcon size={40} class="text-indigo-400" />
		{:else if ["mp4", "webm", "mov", "avi"].includes(ext || "")}
			<Video size={40} class="text-pink-400" />
		{:else if ["mp3", "wav", "ogg"].includes(ext || "")}
			<Music size={40} class="text-amber-400" />
		{:else if ["js", "ts", "tsx", "jsx", "py", "go", "rs", "html", "css", "json", "mjs"].includes(ext || "")}
			<Code2 size={40} class="text-blue-400" />
		{:else}
			<FileIcon size={40} class="text-muted-foreground" />
		{/if}
	{/if}
{/snippet}

<div
	class="space-y-4 relative"
	ondragover={onGlobalDragOver}
	ondragleave={onGlobalDragLeave}
	ondrop={onGlobalDrop}
>
	{#if isDragActive}
		<div
			class="absolute inset-0 z-40 bg-primary/10 border-2 border-dashed border-primary rounded-2xl flex flex-col items-center justify-center backdrop-blur-sm"
			transition:fade={{ duration: 200 }}
		>
			<div class="bg-background p-6 rounded-full shadow-xl text-primary animate-bounce">
				<CloudUpload size={48} />
			</div>
			<p class="mt-4 text-xl font-bold text-primary">
				Drop files to upload to {prefix || "root"}
			</p>
		</div>
	{/if}
	<div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
		<Breadcrumbs
			{bucketName}
			{prefix}
			onNavigate={(p) => fetchObjects(p)}
			canDrop={dragKeys !== null}
			onDrop={(p) => performDrop(dragKeys ?? [], p)}
		/>

		<div class="flex items-center gap-2">
			<div class="relative w-full md:w-64">
				<Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
				<Input
					placeholder="Search in this folder..."
					class="pl-9 h-9"
					bind:value={searchQuery}
					onkeydown={(e) => {
						if (e.key === "Enter") handleSearchExecute();
					}}
				/>
				{#if isSearching}
					<Button
						variant="ghost"
						size="sm"
						class="absolute right-1 top-1 h-7 w-7 p-0"
						onclick={() => {
							searchQuery = "";
							fetchObjects(prefix);
						}}
						type="button"
					>
						<Plus class="rotate-45" size={14} />
					</Button>
				{/if}
			</div>
			<Button
				variant="ghost"
				size="icon"
				class="h-9 w-9 shrink-0"
				onclick={handleSearchExecute}
				type="button"
				disabled={loading}
			>
				<Search size={16} />
			</Button>
			<div class="flex border rounded-lg overflow-hidden shrink-0">
				<Button
					variant={viewMode === "list" ? "secondary" : "ghost"}
					size="icon"
					class="h-9 w-9 rounded-none"
					onclick={() => (viewMode = "list")}
					type="button"
				>
					<ListIcon size={16} />
				</Button>
				<Button
					variant={viewMode === "grid" ? "secondary" : "ghost"}
					size="icon"
					class="h-9 w-9 rounded-none"
					onclick={() => (viewMode = "grid")}
					type="button"
				>
					<Grid size={16} />
				</Button>
			</div>
			<Button
				onclick={() => (showUpload = !showUpload)}
				variant={showUpload ? "secondary" : "default"}
				class="gap-2 h-9"
				type="button"
			>
				{#if showUpload}
					<Plus class="rotate-45" size={16} />
				{:else}
					<CloudUpload size={16} />
				{/if}
				{showUpload ? "Close" : "Upload"}
			</Button>
			<Button
				onclick={() => (showCreateFolder = true)}
				variant="outline"
				class="gap-2 h-9 border-primary/20 hover:border-primary/50 hover:bg-primary/5 text-primary"
				type="button"
			>
				<FolderPlus size={16} />
				<span class="hidden sm:inline">New Folder</span>
			</Button>
			<a
				href="/dashboard/connections/{connectionId}/buckets/{bucketName}/trash"
				class="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-input bg-background text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
			>
				<Trash2 size={16} />
				<span class="hidden sm:inline">Trash</span>
			</a>
		</div>
	</div>

	{#if showUpload}
		<div transition:fly={{ y: -20, duration: 250 }}>
			<UploadZone
				{connectionId}
				{bucketName}
				{prefix}
				onSuccess={() => {
					fetchObjects(prefix);
					showUpload = false;
				}}
			/>
		</div>
	{/if}

	{#if selectedKeys.size > 0}
		<div
			class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-foreground text-background px-6 py-3 rounded-full shadow-xl flex items-center gap-6"
			transition:fly={{ y: 40, duration: 250 }}
		>
			<div class="font-medium">{selectedKeys.size} selected</div>
			<div class="h-4 w-px bg-background/20"></div>
			<div class="flex items-center gap-2">
				<Button
					variant="ghost"
					size="sm"
					onclick={handleBulkDownload}
					class="hover:bg-background/20 text-background hover:text-background h-8"
				>
					Download
				</Button>
				<Button
					variant="ghost"
					size="sm"
					onclick={() => handleBulkMove("move")}
					class="hover:bg-background/20 text-background hover:text-background h-8"
				>
					Move
				</Button>
				<Button
					variant="ghost"
					size="sm"
					onclick={() => handleBulkMove("copy")}
					class="hover:bg-background/20 text-background hover:text-background h-8"
				>
					Copy
				</Button>
				<Button
					variant="ghost"
					size="sm"
					onclick={handleBulkMakePublic}
					class="hover:bg-background/20 text-background hover:text-background h-8"
				>
					Make Public
				</Button>
				{#if selectedPublicFiles.length > 0 && connectionType === "s3"}
					<Button
						variant="ghost"
						size="sm"
						onclick={handleBulkMakePrivate}
						class="hover:bg-background/20 text-background hover:text-background h-8"
					>
						Make Private
					</Button>
				{/if}
				<Button
					variant="ghost"
					size="sm"
					onclick={handleBulkDelete}
					class="hover:bg-red-500/20 text-red-300 hover:text-red-200 h-8"
				>
					Delete
				</Button>
				<Button
					variant="ghost"
					size="icon"
					onclick={() => (selectedKeys = new Set())}
					class="hover:bg-background/20 text-background hover:text-background h-8 w-8 ml-2 rounded-full"
				>
					<Plus class="rotate-45" size={16} />
				</Button>
			</div>
		</div>
	{/if}

	<div class="min-h-[400px] relative">
		{#if loading}
			<div class="absolute inset-0 bg-background/50 backdrop-blur-[1px] z-10 flex items-center justify-center">
				<Loader2 class="animate-spin text-primary" size={32} />
			</div>
		{/if}

		{#if viewMode === "list"}
			<div class="border rounded-xl bg-card/30">
				<table class="w-full text-sm text-left">
					<thead class="bg-muted/50 text-muted-foreground font-medium border-b">
						<tr>
							<th class="px-4 py-3 w-[40px]">
								<input
									type="checkbox"
									class="rounded border-input"
									checked={selectedKeys.size === objects.length && objects.length > 0}
									onchange={toggleSelectAll}
								/>
							</th>
							<th class="px-4 py-3">Name</th>
							<th class="px-4 py-3 hidden md:table-cell">Size</th>
							<th class="px-4 py-3 hidden lg:table-cell">Last Modified</th>
							<th class="px-4 py-3 text-right">Actions</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-border/40">
						{#if filteredObjects.length === 0 && !loading}
							<tr>
								<td colspan={5} class="px-4 py-12 text-center text-muted-foreground">
									No files or folders found
								</td>
							</tr>
						{/if}
						{#each sortedObjects as obj (obj.key)}
							<tr
								draggable="true"
								ondragstart={(e) => onRowDragStart(e, obj.key)}
								ondragend={onRowDragEnd}
								class={cn(
									"hover:bg-muted/30 transition-colors group",
									selectedKeys.has(obj.key) && "bg-primary/5 hover:bg-primary/10"
								)}
								onclick={(e) => {
									if (e.ctrlKey || e.metaKey) {
										toggleSelection(obj.key);
									}
								}}
							>
								<td class="px-4 py-3">
									<input
										type="checkbox"
										class="rounded border-input"
										checked={selectedKeys.has(obj.key)}
										onchange={() => toggleSelection(obj.key)}
										onclick={(e) => e.stopPropagation()}
									/>
								</td>
								<td class="px-4 py-3">
									<div
										role="group"
										class={cn(
											"flex items-center gap-3 rounded-md px-1 -mx-1 py-0.5",
											dropTarget === obj.key && "ring-2 ring-primary bg-primary/10"
										)}
										ondragover={(e) =>
											obj.type === "folder" && onFolderDragOver(e, obj.key)}
										ondragleave={onFolderDragLeave}
										ondrop={(e) =>
											obj.type === "folder" && onFolderDrop(e, obj.key)}
									>
										{@render fileIcon(obj)}
										{#if obj.type === "folder"}
											<button
												onclick={() => fetchObjects(obj.key)}
												class="font-medium hover:underline text-left cursor-pointer"
												type="button"
											>
												{obj.name}
											</button>
										{:else}
											<button
												onclick={() => handlePreview(obj)}
												class="font-medium hover:underline text-left cursor-pointer"
												type="button"
											>
												{obj.name}
											</button>
										{/if}
									</div>
								</td>
								<td class="px-4 py-3 text-muted-foreground hidden md:table-cell">
									{obj.type === "file" ? formatSize(obj.size) : "-"}
								</td>
								<td class="px-4 py-3 text-muted-foreground hidden lg:table-cell">
									{obj.lastModified ? new Date(obj.lastModified).toLocaleString() : "-"}
								</td>
								<td class="px-4 py-3 text-right">
									<div class="flex items-center justify-end gap-1">
										{#if obj.isPublic || connectionType === "r2"}
											<Button
												variant="ghost"
												size="icon"
												class="h-8 w-8 text-primary hover:bg-primary/10"
												type="button"
												onclick={(e) => {
													e.stopPropagation();
													const url = getPublicObjectUrl(bucketName, obj.key, publicUrl);
													navigator.clipboard.writeText(url);
													toast.success("Public URL copied");
												}}
												title="Copy Public URL"
											>
												<LinkIcon size={14} />
											</Button>
										{/if}
										<ObjectActions
											{connectionType}
											{publicUrl}
											{connectionId}
											{bucketName}
											object={obj}
											currentPrefix={prefix}
											onRefresh={() => fetchObjects(prefix)}
											onDelete={handleDelete}
											onRename={handleOptimisticRename}
										/>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
				{#each sortedObjects as obj (obj.key)}
					<Card
						draggable="true"
						ondragstart={(e) => onRowDragStart(e, obj.key)}
						ondragend={onRowDragEnd}
						ondragover={(e) =>
							obj.type === "folder" && onFolderDragOver(e, obj.key)}
						ondragleave={onFolderDragLeave}
						ondrop={(e) => obj.type === "folder" && onFolderDrop(e, obj.key)}
						class={cn(
							"group hover:border-primary/50 transition-all cursor-pointer relative",
							obj.type === "folder" ? "bg-primary/5" : "bg-card/40",
							selectedKeys.has(obj.key) && "border-primary bg-primary/10",
							dropTarget === obj.key && "ring-2 ring-primary"
						)}
						onclick={(e) => {
							if (e.ctrlKey || e.metaKey) {
								toggleSelection(obj.key);
							} else if (obj.type === "folder") {
								fetchObjects(obj.key);
							}
						}}
					>
						<CardContent class="p-4 flex flex-col items-center justify-center text-center space-y-2">
							<div
								class="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity data-[selected=true]:opacity-100"
								data-selected={selectedKeys.has(obj.key)}
							>
								<input
									type="checkbox"
									class="rounded border-input h-4 w-4 shadow-sm"
									checked={selectedKeys.has(obj.key)}
									onchange={() => toggleSelection(obj.key)}
									onclick={(e) => e.stopPropagation()}
								/>
							</div>
							{@render fileIconLarge(obj)}
							<span class="text-xs font-medium truncate w-full">{obj.name}</span>

							<div class="absolute top-1 right-1 opacity-100 group-hover:opacity-100 flex items-center gap-1">
								{#if obj.isPublic || connectionType === "r2"}
									<Button
										variant="secondary"
										size="icon"
										class="h-6 w-6 bg-background/80 backdrop-blur-sm"
										type="button"
										onclick={(e) => {
											e.stopPropagation();
											const url = getPublicObjectUrl(bucketName, obj.key, publicUrl);
											navigator.clipboard.writeText(url);
											toast.success("Public URL copied");
										}}
										title="Copy Public URL"
									>
										<LinkIcon size={10} />
									</Button>
								{/if}
								<div class="bg-background/80 backdrop-blur-sm rounded-md">
									<ObjectActions
										{connectionId}
										{bucketName}
										{connectionType}
										{publicUrl}
										object={obj}
										currentPrefix={prefix}
										onRefresh={() => fetchObjects(prefix)}
										onDelete={handleDelete}
										onRename={handleOptimisticRename}
									/>
								</div>
							</div>
						</CardContent>
					</Card>
				{/each}
			</div>
		{/if}
	</div>

	{#if nextToken || currentPage > 1 || totalItems || isSearching}
		<div class="flex items-center justify-between px-2 py-4 border-t border-border/40">
			<div class="text-sm text-muted-foreground">
				{#if isSearching}
					<span class="flex items-center gap-2">
						<Search size={14} class="text-primary" />
						Search results for
						<span class="font-medium text-foreground italic">"{searchQuery}"</span>
						<span class="text-xs">({objects.length} found)</span>
					</span>
				{:else}
					Page <span class="font-medium text-foreground">{currentPage}</span>
					{#if totalItems}
						of <span class="font-medium text-foreground">{totalPages}</span>
					{/if}
				{/if}
			</div>
			<div class="flex items-center gap-2">
				{#if !isSearching}
					<select
						value={sortBy}
						onchange={(e) => {
							const newSort = e.currentTarget.value as
								| "date-desc"
								| "date-asc"
								| "name-asc"
								| "name-desc";
							sortBy = newSort;
							fetchObjects(prefix, undefined, newSort);
						}}
						class="h-8 text-xs rounded-md border border-input bg-background px-2 py-1 outline-none mr-4"
					>
						<option value="date-desc">Newest First</option>
						<option value="date-asc">Oldest First</option>
						<option value="name-asc">Name (A-Z)</option>
						<option value="name-desc">Name (Z-A)</option>
					</select>

					<div class="flex items-center gap-1 mr-4">
						{#each pageList as p, i (p)}
							{#if i > 0 && pageList[i - 1] !== p - 1}
								<span class="px-1">...</span>
							{/if}
							<Button
								variant={currentPage === p ? "default" : "ghost"}
								size="sm"
								onclick={() => jumpToPage(p)}
								class="h-8 w-8 p-0"
								disabled={loading}
							>
								{p}
							</Button>
						{/each}
					</div>

					<Button
						variant="outline"
						size="sm"
						onclick={handlePrevPage}
						disabled={currentPage === 1 || loading}
						class="h-8 gap-1"
					>
						<ChevronLeft size={16} /> Previous
					</Button>
					<Button
						variant="outline"
						size="sm"
						onclick={handleNextPage}
						disabled={!nextToken || loading}
						class="h-8 gap-1"
					>
						Next <ChevronRight size={16} />
					</Button>
				{/if}
				{#if isSearching}
					<Button
						variant="outline"
						size="sm"
						onclick={() => {
							searchQuery = "";
							fetchObjects(prefix);
						}}
						class="h-8"
					>
						Clear Search
					</Button>
				{/if}
			</div>
		</div>
	{/if}

	{#if previewObject}
		<PreviewModal
			{connectionId}
			{bucketName}
			object={previewObject}
			onClose={() => (previewObject = null)}
		/>
	{/if}

	{#if bulkMoveMode}
		<MoveDialog
			{connectionId}
			{bucketName}
			mode={bulkMoveMode}
			fileKeys={selectedFiles}
			folderPrefixes={selectedFolders}
			srcName={selectedKeys.size === 1
				? (objects.find((o) => selectedKeys.has(o.key))?.name ?? "")
				: undefined}
			currentPrefix={prefix}
			publicKeys={selectedPublicKeys}
			onClose={() => (bulkMoveMode = null)}
			onSuccess={() => {
				selectedKeys = new Set();
				fetchObjects(prefix);
			}}
		/>
	{/if}

	{#if showBulkDelete}
		<BulkDeleteDialog
			{connectionId}
			{bucketName}
			keys={Array.from(selectedKeys)}
			selectedCount={selectedKeys.size}
			onClose={() => (showBulkDelete = false)}
			onSuccess={() => {
				selectedKeys = new Set();
				fetchObjects(prefix);
			}}
		/>
	{/if}

	{#if showCreateFolder}
		<CreateFolderDialog
			{connectionId}
			{bucketName}
			{prefix}
			onClose={() => (showCreateFolder = false)}
			onSuccess={() => fetchObjects(prefix)}
		/>
	{/if}

	{#if showConfirmUpload}
		<ConfirmUploadDialog
			{connectionId}
			{bucketName}
			{prefix}
			files={droppedFiles}
			onClose={() => {
				showConfirmUpload = false;
				droppedFiles = [];
			}}
			onSuccess={() => {
				fetchObjects(prefix);
			}}
		/>
	{/if}
</div>
