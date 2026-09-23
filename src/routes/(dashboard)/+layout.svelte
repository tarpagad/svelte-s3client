<script lang="ts">
	import { Cloud, Search } from "@lucide/svelte";
	import SidebarNav from "$lib/components/s3/sidebar-nav.svelte";
	import ThemeToggle from "$lib/components/theme-toggle.svelte";
	import Input from "$lib/components/ui/input.svelte";

	let { children, data } = $props();
</script>

<div class="flex h-screen bg-background overflow-hidden">
	<aside class="w-64 border-r border-border/40 bg-card/30 hidden md:flex flex-col">
		<div class="p-6">
			<div class="flex items-center gap-2 font-bold text-xl tracking-tight">
				<div class="bg-primary text-primary-foreground p-1 rounded"><Cloud size={20} /></div>
				<span>S3 Client</span>
			</div>
		</div>
		<nav class="flex-1 px-4 space-y-2">
			<SidebarNav connections={data.connections} />
		</nav>
		<div class="p-4 border-t border-border/40">
			<p class="text-xs text-muted-foreground text-center">Credentials encrypted in browser</p>
		</div>
	</aside>
	<div class="flex-1 flex flex-col min-w-0 overflow-hidden">
		<header class="h-16 border-b border-border/40 flex items-center justify-between px-6 bg-card/10">
			<div class="flex items-center gap-4 flex-1 max-w-md">
				<div class="relative w-full">
					<Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
					<Input
						type="search"
						placeholder="Search buckets or files..."
						class="pl-9 bg-muted/50 border-none focus-visible:ring-1 focus-visible:ring-primary/20 h-9"
					/>
				</div>
			</div>
			<div class="flex items-center gap-4">
				<ThemeToggle />
			</div>
		</header>
		<main
			class="flex-1 overflow-y-auto p-6 bg-[radial-gradient(circle_at_center,var(--tw-gradient-stops))] from-primary/2 via-transparent to-transparent"
		>
			{@render children()}
		</main>
	</div>
</div>
