<script lang="ts">
	import { ArrowLeft, FileText } from "@lucide/svelte";
	import Button from "$lib/components/ui/button.svelte";

	const year = new Date().getFullYear();
	const updated = new Date().toLocaleDateString();
</script>

<svelte:head>
	<title>Terms of Service | S3 Client</title>
</svelte:head>

<div class="min-h-screen bg-background p-6 md:p-24 flex flex-col items-center">
	<div class="max-w-2xl w-full space-y-8">
		<a href="/">
			<Button variant="ghost" class="gap-2 -ml-4">
				<ArrowLeft size={16} /> Back to Home
			</Button>
		</a>

		<div class="space-y-4">
			<div class="flex items-center gap-3">
				<div class="bg-primary/10 p-2 rounded-lg">
					<FileText class="text-primary" size={24} />
				</div>
				<h1 class="text-4xl font-extrabold tracking-tight">Terms of Service</h1>
			</div>
			<p class="text-muted-foreground text-lg">Last updated: {updated}</p>
		</div>

		<div class="prose prose-invert max-w-none space-y-6">
			<section class="space-y-3">
				<h2 class="text-2xl font-bold">1. Free for Use</h2>
				<p class="text-muted-foreground">
					S3 Client is free software provided to the community. You are free to use it for
					personal or commercial purposes to manage your S3 buckets.
				</p>
			</section>

			<section class="space-y-3">
				<h2 class="text-2xl font-bold">2. No Warranty</h2>
				<p class="text-muted-foreground font-medium italic">
					THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
					INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
					PARTICULAR PURPOSE AND NONINFRINGEMENT.
				</p>
				<p class="text-muted-foreground">
					In no event shall the authors or copyright holders be liable for any claim, damages or
					other liability, whether in an action of contract, tort or otherwise, arising from,
					out of or in connection with the software or the use or other dealings in the
					software.
				</p>
			</section>

			<section class="space-y-3">
				<h2 class="text-2xl font-bold">3. Responsibility</h2>
				<p class="text-muted-foreground">
					You are solely responsible for the AWS costs incurred by your S3 usage through this
					client. Always ensure you are following AWS's best practices for security and cost
					management.
				</p>
			</section>
		</div>

		<div class="pt-8 border-t border-border/40 text-sm text-muted-foreground">
			<p>&copy; {year} S3 Client. All rights reserved.</p>
		</div>
	</div>
</div>
