<script lang="ts" module>
	// Shared presign cache: presigning is server-side SigV4 (no object
	// fetch), one request per unique key, cached for the session.
	const cache = new Map<string, string>();
</script>

<script lang="ts">
	import { File as FileIcon } from "@lucide/svelte";
	import { callS3 } from "$lib/api";

	let {
		connectionId,
		bucketName,
		objectKey,
	}: {
		connectionId: string;
		bucketName: string;
		objectKey: string;
	} = $props();

	let url = $state<string | null>(null);
	let failed = $state(false);
	let requested = false;
	let root: HTMLDivElement | undefined = $state();

	async function ensure() {
		if (requested || url) return;
		requested = true;
		const cacheKey = `${connectionId}|${bucketName}|${objectKey}`;
		try {
			const r = await callS3<{ url?: string; error?: string }>(
				"getDownloadUrl",
				{ connectionId, bucket: bucketName, key: objectKey },
			);
			if (r.url) {
				cache.set(cacheKey, r.url);
				url = r.url;
			} else {
				failed = true;
			}
		} catch {
			failed = true;
		}
	}

	$effect(() => {
		const el = root;
		const cached = url ?? cache.get(`${connectionId}|${bucketName}|${objectKey}`) ?? null;
		if (cached && !url) url = cached;
		if (!el || url) return;
		// Only presign once the card scrolls into view.
		const io = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) {
					void ensure();
					io.disconnect();
				}
			},
			{ rootMargin: "200px" },
		);
		io.observe(el);
		return () => io.disconnect();
	});
</script>

<div
	bind:this={root}
	class="h-16 w-16 flex items-center justify-center"
	role="presentation"
>
	{#if url && !failed}
		<img
			src={url}
			alt=""
			loading="lazy"
			class="h-16 w-16 object-contain rounded-md bg-white/5 shadow-sm"
			onerror={() => (failed = true)}
		/>
	{:else if failed}
		<FileIcon size={40} class="text-muted-foreground" />
	{:else}
		<div class="h-16 w-16 rounded-md bg-muted animate-pulse"></div>
	{/if}
</div>
