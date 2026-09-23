<script lang="ts">
	import { Moon, Sun } from "@lucide/svelte";
	import { mode, setMode } from "mode-watcher";
</script>

<button
	type="button"
	onclick={() => setMode(mode.current === "dark" ? "light" : "dark")}
	class="relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-border/40 bg-card/30 hover:bg-card/50 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/20"
	aria-label="Toggle theme"
>
	<Sun
		class="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0"
	/>
	<Moon
		class="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100"
	/>
	<span class="sr-only">Toggle theme</span>
</button>
