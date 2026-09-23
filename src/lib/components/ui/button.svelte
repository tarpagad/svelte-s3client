<script lang="ts">
	import { cn } from "$lib/utils";
	import type { HTMLButtonAttributes } from "svelte/elements";

	type Props = HTMLButtonAttributes & {
		variant?: "default" | "outline" | "ghost" | "destructive" | "secondary";
		size?: "default" | "sm" | "lg" | "icon";
	};

	let {
		variant = "default",
		size = "default",
		class: className,
		children,
		...rest
	}: Props = $props();
</script>

<button
	class={cn(
		"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer",
		variant === "default" &&
			"bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm shadow-black/5",
		variant === "outline" &&
			"border border-input bg-background hover:bg-accent hover:text-accent-foreground shadow-sm shadow-black/5",
		variant === "ghost" && "hover:bg-accent hover:text-accent-foreground",
		variant === "destructive" &&
			"bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm shadow-black/5",
		variant === "secondary" &&
			"bg-secondary text-secondary-foreground hover:bg-secondary/80 shadow-sm shadow-black/5",
		size === "default" && "h-9 px-4 py-2",
		size === "sm" && "h-8 rounded-md px-3",
		size === "lg" && "h-10 rounded-md px-8",
		size === "icon" && "h-9 w-9",
		className,
	)}
	{...rest}
>
	{@render children?.()}
</button>
