<script lang="ts">
	import { Grid, Key, List, Save, Trash2 } from "@lucide/svelte";
	import { toast } from "svelte-sonner";
	import { callKeyApi } from "$lib/api";
	import Button from "$lib/components/ui/button.svelte";
	import Card from "$lib/components/ui/card.svelte";
	import CardContent from "$lib/components/ui/card-content.svelte";
	import CardDescription from "$lib/components/ui/card-description.svelte";
	import CardFooter from "$lib/components/ui/card-footer.svelte";
	import CardHeader from "$lib/components/ui/card-header.svelte";
	import CardTitle from "$lib/components/ui/card-title.svelte";
	import Input from "$lib/components/ui/input.svelte";
	import Label from "$lib/components/ui/label.svelte";
	import { cn } from "$lib/utils";

	let viewMode = $state<"list" | "grid">("list");
	let itemsPerPage = $state(20);
	let isSaving = $state(false);

	let hasCookieKey = $state<boolean | null>(null);
	let hasEnvKey = $state(false);
	let showKeyForm = $state(false);
	let showChangeKey = $state(false);
	let newKey = $state("");
	let currentKey = $state("");
	let isKeySaving = $state(false);

	async function fetchKeyStatus() {
		try {
			const status = await callKeyApi<{ hasCookieKey: boolean; hasEnvKey: boolean }>("status");
			hasCookieKey = status.hasCookieKey;
			hasEnvKey = status.hasEnvKey;
		} catch {
			hasCookieKey = false;
		}
	}

	$effect(() => {
		const cookies = document.cookie.split("; ");
		const userPrefs = cookies.find((c) => c.startsWith("user_prefs="));
		if (userPrefs) {
			try {
				const prefs = JSON.parse(decodeURIComponent(userPrefs.split("=")[1]));
				if (prefs.viewMode) viewMode = prefs.viewMode;
				if (prefs.itemsPerPage) itemsPerPage = prefs.itemsPerPage;
			} catch (e) {
				console.error("Failed to parse prefs", e);
			}
		}

		fetchKeyStatus();
	});

	function handleSave() {
		isSaving = true;
		const prefs = { viewMode, itemsPerPage };
		const expires = new Date();
		expires.setDate(expires.getDate() + 30);
		document.cookie = `user_prefs=${encodeURIComponent(JSON.stringify(prefs))}; path=/; expires=${expires.toUTCString()}; SameSite=Strict`;

		setTimeout(() => {
			isSaving = false;
			toast.success("Settings saved successfully");
		}, 500);
	}

	async function handleSetKey() {
		if (!newKey || newKey.length < 8) {
			toast.error("Encryption key must be at least 8 characters");
			return;
		}
		isKeySaving = true;
		try {
			const result = await callKeyApi<{ success?: boolean; error?: string }>("set", { key: newKey });
			if (result.error) {
				toast.error(result.error);
			} else {
				toast.success("Encryption key saved");
				showKeyForm = false;
				newKey = "";
				fetchKeyStatus();
			}
		} catch {
			toast.error("Failed to set encryption key");
		} finally {
			isKeySaving = false;
		}
	}

	async function handleChangeKey() {
		if (!currentKey) {
			toast.error("Current encryption key is required");
			return;
		}
		if (!newKey || newKey.length < 8) {
			toast.error("New encryption key must be at least 8 characters");
			return;
		}
		isKeySaving = true;
		try {
			const result = await callKeyApi<{ success?: boolean; error?: string }>("change", {
				currentKey,
				newKey,
			});
			if (result.error) {
				toast.error(result.error);
			} else {
				toast.success("Encryption key changed successfully");
				showChangeKey = false;
				currentKey = "";
				newKey = "";
				fetchKeyStatus();
			}
		} catch {
			toast.error("Failed to change encryption key");
		} finally {
			isKeySaving = false;
		}
	}

	async function handleRemoveKey() {
		if (
			!confirm(
				"Are you sure? This will prevent access to any encrypted connections stored in your browser."
			)
		) {
			return;
		}
		try {
			await callKeyApi("remove");
			toast.success("Encryption key removed");
			fetchKeyStatus();
		} catch {
			toast.error("Failed to remove encryption key");
		}
	}
</script>

<div class="max-w-2xl space-y-6">
	<Card class="border-border/40 bg-card/30">
		<CardHeader>
			<CardTitle>Display Preferences</CardTitle>
			<CardDescription>Choose how you want to view your S3 objects by default.</CardDescription>
		</CardHeader>
		<CardContent class="space-y-6">
			<div class="space-y-3">
				<Label>Default View Mode</Label>
				<div class="flex gap-4">
					<button
						type="button"
						onclick={() => (viewMode = "list")}
						class={cn(
							"flex-1 flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all group",
							viewMode === "list"
								? "border-primary bg-primary/5"
								: "border-border/40 hover:border-border hover:bg-muted/50"
						)}
					>
						<div
							class={cn(
								"p-3 rounded-lg transition-colors",
								viewMode === "list"
									? "bg-primary text-primary-foreground"
									: "bg-muted group-hover:bg-muted-foreground/10"
							)}
						>
							<List size={24} />
						</div>
						<span class="font-medium">List View</span>
					</button>

					<button
						type="button"
						onclick={() => (viewMode = "grid")}
						class={cn(
							"flex-1 flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all group",
							viewMode === "grid"
								? "border-primary bg-primary/5"
								: "border-border/40 hover:border-border hover:bg-muted/50"
						)}
					>
						<div
							class={cn(
								"p-3 rounded-lg transition-colors",
								viewMode === "grid"
									? "bg-primary text-primary-foreground"
									: "bg-muted group-hover:bg-muted-foreground/10"
							)}
						>
							<Grid size={24} />
						</div>
						<span class="font-medium">Grid View</span>
					</button>
				</div>
			</div>

			<div class="space-y-3">
				<Label for="pageSize">Items Per Page</Label>
				<select
					id="pageSize"
					bind:value={itemsPerPage}
					class="w-full flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
				>
					<option value={10}>10 items</option>
					<option value={20}>20 items</option>
					<option value={50}>50 items</option>
					<option value={100}>100 items</option>
				</select>
				<p class="text-[10px] text-muted-foreground">
					Larger page sizes may affect performance on folders with many objects.
				</p>
			</div>
		</CardContent>
	</Card>

	<Card class="border-border/40 bg-card/30">
		<CardHeader>
			<div class="flex items-center gap-3">
				<div class="p-2 bg-primary/10 rounded-lg text-primary"><Key size={20} /></div>
				<div>
					<CardTitle>Encryption Key</CardTitle>
					<CardDescription>
						Your passphrase is used to encrypt credentials before they are stored in your
						browser. Stored in an HTTP-only cookie — never accessible to JavaScript.
					</CardDescription>
				</div>
			</div>
		</CardHeader>
		<CardContent>
			{#if hasCookieKey === null}
				<p class="text-sm text-muted-foreground">Checking encryption status...</p>
			{:else if hasCookieKey}
				<div class="space-y-4">
					<div class="flex items-center gap-2 text-sm">
						<span class="w-2 h-2 rounded-full bg-green-500"></span>
						<span class="text-green-600 dark:text-green-400 font-medium">
							Encryption key is set
						</span>
					</div>
					{#if showChangeKey}
						<div class="space-y-3 border border-border/40 rounded-xl p-4 bg-muted/20">
							<div class="space-y-2">
								<Label for="currentKey">Current Key</Label>
								<Input id="currentKey" type="password" bind:value={currentKey} placeholder="Enter current encryption key" />
							</div>
							<div class="space-y-2">
								<Label for="newKey">New Key</Label>
								<Input id="newKey" type="password" bind:value={newKey} placeholder="Enter new encryption key (min. 8 characters)" />
							</div>
							<div class="flex gap-2">
								<Button onclick={handleChangeKey} disabled={isKeySaving} size="sm">
									{isKeySaving ? "Changing..." : "Change Key"}
								</Button>
								<Button
									variant="ghost"
									size="sm"
									onclick={() => {
										showChangeKey = false;
										currentKey = "";
										newKey = "";
									}}
								>
									Cancel
								</Button>
							</div>
						</div>
					{:else}
						<div class="flex gap-2">
							<Button variant="outline" size="sm" onclick={() => (showChangeKey = true)}>
								Change Key
							</Button>
							<Button
								variant="outline"
								size="sm"
								class="text-destructive hover:bg-destructive/10 border-destructive/20"
								onclick={handleRemoveKey}
							>
								<Trash2 size={14} class="mr-1" />
								Remove
							</Button>
						</div>
					{/if}
				</div>
			{:else if hasEnvKey}
				<div class="space-y-4">
					<div class="flex items-center gap-2 text-sm">
						<span class="w-2 h-2 rounded-full bg-blue-500"></span>
						<span class="text-blue-600 dark:text-blue-400 font-medium">
							Using server-side encryption key (ENCRYPTION_KEY)
						</span>
					</div>
					{#if !showKeyForm}
						<Button variant="outline" size="sm" onclick={() => (showKeyForm = true)}>
							Set Browser Key Instead
						</Button>
					{:else}
						<div class="space-y-3 border border-border/40 rounded-xl p-4 bg-muted/20">
							<div class="space-y-2">
								<Label for="setKey">Encryption Passphrase</Label>
								<Input id="setKey" type="password" bind:value={newKey} placeholder="Min. 8 characters" />
							</div>
							<div class="flex gap-2">
								<Button onclick={handleSetKey} disabled={isKeySaving} size="sm">
									{isKeySaving ? "Saving..." : "Save Key"}
								</Button>
								<Button
									variant="ghost"
									size="sm"
									onclick={() => {
										showKeyForm = false;
										newKey = "";
									}}
								>
									Cancel
								</Button>
							</div>
						</div>
					{/if}
				</div>
			{:else}
				<div class="space-y-4">
					<div class="flex items-center gap-2 text-sm">
						<span class="w-2 h-2 rounded-full bg-amber-500"></span>
						<span class="text-amber-600 dark:text-amber-400 font-medium">
							No encryption key set
						</span>
					</div>
					<p class="text-sm text-muted-foreground">
						Set an encryption passphrase to secure your stored credentials. This is only needed
						if no ENCRYPTION_KEY is configured on the server.
					</p>
					{#if showKeyForm}
						<div class="space-y-3 border border-border/40 rounded-xl p-4 bg-muted/20">
							<div class="space-y-2">
								<Label for="setKey">Encryption Passphrase</Label>
								<Input id="setKey" type="password" bind:value={newKey} placeholder="Min. 8 characters" />
							</div>
							<div class="flex gap-2">
								<Button onclick={handleSetKey} disabled={isKeySaving} size="sm">
									{isKeySaving ? "Saving..." : "Save Key"}
								</Button>
								<Button
									variant="ghost"
									size="sm"
									onclick={() => {
										showKeyForm = false;
										newKey = "";
									}}
								>
									Cancel
								</Button>
							</div>
						</div>
					{:else}
						<Button variant="outline" size="sm" onclick={() => (showKeyForm = true)}>
							Set Encryption Key
						</Button>
					{/if}
				</div>
			{/if}
		</CardContent>
		<CardFooter class="border-t border-border/40 px-6 py-3">
			<p class="text-[10px] text-muted-foreground">
				The key is stored in an HTTP-only cookie. If you clear your cookies, stored connections
				will become unrecoverable unless you remember this key.
			</p>
		</CardFooter>
	</Card>

	<div class="flex justify-end">
		<Button onclick={handleSave} disabled={isSaving} class="gap-2 px-8">
			{#if isSaving}
				Saving...
			{:else}
				<Save size={16} /> Save Changes
			{/if}
		</Button>
	</div>
</div>
