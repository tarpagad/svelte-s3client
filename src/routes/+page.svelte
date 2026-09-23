<script lang="ts">
	import { Cloud, Shield, Zap } from "@lucide/svelte";
	import Button from "$lib/components/ui/button.svelte";
</script>

<div class="flex flex-col min-h-screen">
	<header class="border-b border-border/40 backdrop-blur-md sticky top-0 z-50 bg-background/80">
		<div class="container flex h-16 items-center justify-between">
			<div class="flex items-center gap-2 font-bold text-xl tracking-tight">
				<div class="bg-primary text-primary-foreground p-1 rounded"><Cloud size={20} /></div>
				<span>S3 Client</span>
			</div>
			<nav class="flex items-center gap-4">
				<a href="/dashboard"><Button size="sm" class="gap-2">Dashboard</Button></a>
			</nav>
		</div>
	</header>
	<main
		class="flex-1 flex flex-col items-center justify-center p-6 md:p-24 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-primary/5 via-background to-background"
	>
		<div class="max-w-4xl w-full text-center space-y-8">
			<div class="space-y-4">
				<h1 class="text-4xl md:text-6xl font-extrabold tracking-tighter leading-tight">
					Manage your S3 and R2 buckets <span class="text-primary">securely</span> and
					<span class="text-primary">efficiently</span>.
				</h1>
				<p class="text-muted-foreground text-lg md:text-xl max-w-2xl mx-auto">
					A premium web client for Amazon S3 and Cloudflare R2. Your credentials are encrypted
					and stored only in your browser — never in a database.
				</p>
			</div>
			<div class="flex items-center justify-center gap-4 pt-4">
				<a href="/dashboard"><Button size="lg" class="gap-2 text-base px-8">Go to Dashboard</Button></a>
			</div>
			<div class="grid grid-cols-1 md:grid-cols-3 gap-6 pt-12 max-w-3xl mx-auto">
				<div class="flex flex-col items-center gap-3 p-6 rounded-xl border border-border/40 bg-card/50">
					<Shield class="text-primary" size={28} />
					<h3 class="font-semibold">Encrypted in Browser</h3>
					<p class="text-xs text-muted-foreground text-center">
						AES-256-GCM encryption stored in a secure cookie. No database, no leaks.
					</p>
				</div>
				<div class="flex flex-col items-center gap-3 p-6 rounded-xl border border-border/40 bg-card/50">
					<Zap class="text-primary" size={28} />
					<h3 class="font-semibold">S3 & R2 Support</h3>
					<p class="text-xs text-muted-foreground text-center">
						Manage both Amazon S3 and Cloudflare R2 in one place.
					</p>
				</div>
				<div class="flex flex-col items-center gap-3 p-6 rounded-xl border border-border/40 bg-card/50">
					<Cloud class="text-primary" size={28} />
					<h3 class="font-semibold">Multiple Connections</h3>
					<p class="text-xs text-muted-foreground text-center">
						Add and switch between multiple bucket connections.
					</p>
				</div>
			</div>
		</div>
	</main>
	<footer class="border-t border-border/40 py-8 bg-background/50">
		<div
			class="container flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left"
		>
			<p class="text-sm text-muted-foreground">
				&copy; {new Date().getFullYear()} S3 Client. Built with SvelteKit and Cloudflare.
			</p>
			<div class="flex items-center gap-4 text-sm text-muted-foreground">
				<a href="/privacy" class="hover:text-primary transition-colors">Privacy</a>
				<a href="/terms" class="hover:text-primary transition-colors">Terms</a>
			</div>
		</div>
	</footer>
</div>
