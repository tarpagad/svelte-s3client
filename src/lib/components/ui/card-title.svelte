<script lang="ts">
	import { cn } from "$lib/utils";
	import type { HTMLAttributes } from "svelte/elements";

	type Props = HTMLAttributes<HTMLElement>;

	let { class: className, children, ...rest }: Props = $props();
</script>

<h3
	class={cn("leading-none font-semibold tracking-tight", className)}
	{...rest}
>
	{@render children?.()}
</h3>
