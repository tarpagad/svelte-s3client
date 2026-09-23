<script lang="ts">
	import { ArrowLeft, Shield } from "@lucide/svelte";
	import Button from "$lib/components/ui/button.svelte";

	const year = new Date().getFullYear();
	const updated = new Date().toLocaleDateString();
</script>

<svelte:head>
	<title>Privacy Policy | S3 Client</title>
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
					<Shield class="text-primary" size={24} />
				</div>
				<h1 class="text-4xl font-extrabold tracking-tight">Privacy Policy</h1>
			</div>
			<p class="text-muted-foreground text-lg">Last updated: {updated}</p>
		</div>

		<div class="prose prose-invert max-w-none space-y-6">
			<section class="space-y-3">
				<h2 class="text-2xl font-bold">1. We Store No Data</h2>
				<p class="text-muted-foreground">
					S3 Client is a stateless application. We do not have a database for users, and we do
					not store your AWS Access Keys, Secret Keys, or any metadata about your buckets on our
					servers.
				</p>
			</section>

			<section class="space-y-3">
				<h2 class="text-2xl font-bold">2. Secure Cookies</h2>
				<p class="text-muted-foreground">
					When you "Connect" to your S3 account, your credentials are encrypted using
					<strong>AES-256-GCM</strong> on our server and stored in a secure, HTTP-only cookie in
					your browser. This cookie is never accessible to client-side JavaScript and is only
					sent to our server to facilitate your S3 requests.
				</p>
			</section>

			<section class="space-y-3">
				<h2 class="text-2xl font-bold">3. Local Session</h2>
				<p class="text-muted-foreground">
					Your session exists only as long as that cookie exists. When you click "Disconnect
					S3", the cookie is immediately deleted from your browser, and all access is revoked.
				</p>
			</section>

			<section class="space-y-3">
				<h2 class="text-2xl font-bold">4. Transparency</h2>
				<p class="text-muted-foreground">
					Our source code is open and available for review. We believe in complete transparency
					regarding how your sensitive data is handled.
				</p>
			</section>
		</div>

		<div class="pt-8 border-t border-border/40 text-sm text-muted-foreground">
			<p>&copy; {year} S3 Client. All rights reserved.</p>
		</div>
	</div>
</div>
