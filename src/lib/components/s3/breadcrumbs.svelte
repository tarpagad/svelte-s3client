<script lang="ts">
	import { ChevronRight, Home } from "@lucide/svelte";
	import { cn } from "$lib/utils";

	let {
		bucketName,
		prefix,
		onNavigate,
		onDrop,
		canDrop = false,
	}: {
		bucketName: string;
		prefix: string;
		onNavigate: (prefix: string) => void;
		onDrop?: (prefix: string) => void;
		canDrop?: boolean;
	} = $props();

	const parts = $derived(prefix.split("/").filter(Boolean));
</script>

<nav class="flex items-center space-x-1 text-sm text-muted-foreground mb-6 overflow-hidden">
	<button
		type="button"
		onclick={() => onNavigate("")}
		ondragover={(e) => {
			if (canDrop) e.preventDefault();
		}}
		ondrop={(e) => {
			if (!canDrop) return;
			e.preventDefault();
			e.stopPropagation();
			onDrop?.("");
		}}
		class="flex items-center hover:text-foreground transition-colors"
	>
		<Home size={16} class="mr-1" />
		<span class="font-medium truncate max-w-[100px]">{bucketName}</span>
	</button>

	{#each parts as part, index}
		{@const currentPrefix = parts.slice(0, index + 1).join("/") + "/"}
		<div class="flex items-center">
			<ChevronRight size={14} class="mx-1 shrink-0 opacity-50" />
			<button
				type="button"
				onclick={() => onNavigate(currentPrefix)}
				ondragover={(e) => {
					if (canDrop) e.preventDefault();
				}}
				ondrop={(e) => {
					if (!canDrop) return;
					e.preventDefault();
					e.stopPropagation();
					onDrop?.(currentPrefix);
				}}
				class={cn(
					"hover:text-foreground transition-colors truncate max-w-[150px]",
					index === parts.length - 1 ? "text-foreground font-semibold" : ""
				)}
			>
				{part}
			</button>
		</div>
	{/each}
</nav>
