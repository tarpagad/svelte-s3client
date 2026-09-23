<script lang="ts">
	import { Database, Globe, LayoutDashboard, Plus, Settings } from "@lucide/svelte";
	import { page } from "$app/state";
	import { cn } from "$lib/utils";
	import type { ConnectionInfo } from "$lib/types";

	let { connections }: { connections: ConnectionInfo[] } = $props();

	const pathname = $derived(page.url.pathname);

	const routes = $derived([
		{
			label: "Connections",
			icon: LayoutDashboard,
			href: "/dashboard",
			active:
				pathname === "/dashboard" || pathname.startsWith("/dashboard/connections"),
		},
		{
			label: "Add Connection",
			icon: Plus,
			href: "/dashboard/connections/new",
			active: pathname === "/dashboard/connections/new",
		},
		{
			label: "Settings",
			icon: Settings,
			href: "/dashboard/settings",
			active: pathname === "/dashboard/settings",
		},
	]);
</script>

<div class="space-y-1">
	{#each routes as route (route.href)}
		<a
			href={route.href}
			class={cn(
				"flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors group",
				route.active
					? "bg-primary text-primary-foreground shadow-sm"
					: "text-muted-foreground hover:text-foreground hover:bg-muted"
			)}
		>
			<route.icon
				size={18}
				class={cn(
					"transition-colors shrink-0",
					route.active
						? "text-primary-foreground"
						: "text-muted-foreground group-hover:text-foreground"
				)}
			/>
			{route.label}
		</a>
	{/each}

	{#if connections.length > 0}
		<div class="pt-4 pb-1.5">
			<p class="px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
				Connected
			</p>
		</div>
		{#each connections as conn (conn.id)}
			{@const href = `/dashboard/connections/${conn.id}`}
			{@const isActive = pathname === href || pathname.startsWith(`${href}/`)}
			<a
				href={href}
				class={cn(
					"flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors group",
					isActive
						? "bg-primary/10 text-primary font-semibold"
						: "text-muted-foreground hover:text-foreground hover:bg-muted"
				)}
			>
				{#if conn.type === "r2"}
					<Globe
						size={18}
						class={cn(
							"transition-colors shrink-0",
							isActive
								? "text-primary"
								: "text-muted-foreground group-hover:text-foreground"
						)}
					/>
				{:else}
					<Database
						size={18}
						class={cn(
							"transition-colors shrink-0",
							isActive
								? "text-primary"
								: "text-muted-foreground group-hover:text-foreground"
						)}
					/>
				{/if}
				<span class="truncate">{conn.name}</span>
			</a>
		{/each}
	{/if}
</div>
