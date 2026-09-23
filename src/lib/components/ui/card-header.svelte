<script lang="ts">
	import { cn } from "$lib/utils";
	import type { HTMLAttributes } from "svelte/elements";

	type Props = HTMLAttributes<HTMLElement>;

	let { class: className, children, ...rest }: Props = $props();
</script>

<div class={cn("flex flex-col gap-1.5 p-6", className)} {...rest}>
	{@render children?.()}
</div>
