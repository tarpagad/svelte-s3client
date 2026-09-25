<script lang="ts">
	interface ContextMenuItem {
		label: string;
		divider?: boolean;
		danger?: boolean;
		onSelect: () => void;
	}

	let {
		x,
		y,
		items,
		onClose,
	}: {
		x: number;
		y: number;
		items: ContextMenuItem[];
		onClose: () => void;
	} = $props();

	let menu: HTMLDivElement | undefined = $state();
	let left = $state(0);
	let top = $state(0);

	// Runs before paint: clamp against an estimate first, then refine
	// against the real rect once the element is bound.
	$effect.pre(() => {
		let l = Math.min(x, window.innerWidth - 240);
		let t = Math.min(y, window.innerHeight - items.length * 34 - 24);
		if (menu) {
			const rect = menu.getBoundingClientRect();
			l = Math.min(x, window.innerWidth - rect.width - 8);
			t = Math.min(y, window.innerHeight - rect.height - 8);
		}
		left = Math.max(8, l);
		top = Math.max(8, t);
	});

	function onWindowMouseDown(event: MouseEvent) {
		if (menu && !menu.contains(event.target as Node)) onClose();
	}

	function onWindowKeyDown(event: KeyboardEvent) {
		if (event.key === "Escape") onClose();
	}
</script>

<svelte:window
	onmousedown={onWindowMouseDown}
	onkeydown={onWindowKeyDown}
	onscroll={onClose}
	onresize={onClose}
/>

<div
	bind:this={menu}
	role="menu"
	style="left: {left}px; top: {top}px;"
	class="fixed z-1000 min-w-48 bg-card border border-border/40 rounded-xl shadow-xl py-1 overflow-hidden"
>
	{#each items as item, i (i)}
		{#if item.divider}
			<div class="h-px bg-border/40 my-1"></div>
		{:else}
			<button
				type="button"
				role="menuitem"
				class="w-full flex items-center gap-2 px-4 py-2 text-sm text-left transition-colors {item.danger
					? 'hover:bg-destructive/10 text-destructive'
					: 'hover:bg-accent'}"
				onclick={() => {
					item.onSelect();
					onClose();
				}}
			>
				{item.label}
			</button>
		{/if}
	{/each}
</div>
