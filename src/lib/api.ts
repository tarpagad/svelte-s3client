export async function callS3<T = unknown>(
	op: string,
	payload: Record<string, unknown>,
): Promise<T> {
	const res = await fetch(`/api/s3/${op}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(payload),
	});

	if (!res.ok) {
		let message = `Request failed (${res.status})`;
		try {
			const data = (await res.json()) as { error?: string };
			if (data?.error) message = data.error;
		} catch {
			// non-JSON error response
		}
		throw new Error(message);
	}

	return (await res.json()) as T;
}

export async function uploadToS3(
	form: FormData,
): Promise<{ success?: boolean; error?: string }> {
	const res = await fetch("/api/s3/upload", {
		method: "POST",
		body: form,
	});
	return (await res.json()) as { success?: boolean; error?: string };
}

export async function callKeyApi<T = unknown>(
	op: string,
	payload: Record<string, unknown> = {},
): Promise<T> {
	const res = await fetch(`/api/keys/${op}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(payload),
	});
	return (await res.json()) as T;
}

/** Sequential batch walker for ops capped per request (e.g. move/copy). */
export async function callS3Batches(
	op: string,
	batches: Record<string, unknown>[],
	onProgress?: (done: number, total: number) => void,
): Promise<void> {
	for (let i = 0; i < batches.length; i++) {
		await callS3(op, batches[i]);
		onProgress?.(i + 1, batches.length);
	}
}
