import 'dotenv/config';
import express, { Request, Response } from 'express';
import fetch from 'cross-fetch';
import { z } from 'zod';

const app = express();
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

// Health check
app.get('/health', (_req: Request, res: Response) => {
	res.json({ ok: true });
});

// Exa request schema
const ExaRequestSchema = z.object({
	query: z.string().min(2, 'query is required'),
	numResults: z.number().int().positive().max(20).optional(),
	highlights: z.boolean().optional()
});

async function exaSearch(query: string, numResults: number, highlights: boolean) {
	const exaKey = process.env.EXA_API_KEY;
	if (!exaKey) {
		throw new Error('Missing EXA_API_KEY');
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 15000);

	try {
		const baseUrl = process.env.EXA_API_BASE_URL || 'https://api.exa.ai';
		const payload = JSON.stringify({
			query,
			type: 'auto',
			numResults,
			text: true,
			highlights
		});

		const headers = {
			'x-api-key': exaKey,
			'Content-Type': 'application/json'
		} as Record<string, string>;

		const attempt = async (path: string) => {
			const res = await fetch(`${baseUrl}${path}`, {
				method: 'POST',
				headers,
				body: payload,
				signal: controller.signal
			});
			return res;
		};

		// Use documented search endpoint; fallback to versioned if needed
		let exaRes = await attempt('/search');
		if (!exaRes.ok && (exaRes.status === 404 || exaRes.status === 405)) {
			exaRes = await attempt('/v1/search');
		}

		if (!exaRes.ok) {
			const text = await exaRes.text();
			throw new Error(`Exa error: ${text}`);
		}

		return exaRes.json();
	} finally {
		clearTimeout(timeout);
	}
}

// Fetch contents for a list of URLs
async function exaContents(urls: string[]) {
	const exaKey = process.env.EXA_API_KEY;
	if (!exaKey) {
		throw new Error('Missing EXA_API_KEY');
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 15000);

	try {
		const baseUrl = process.env.EXA_API_BASE_URL || 'https://api.exa.ai';
		const res = await fetch(`${baseUrl}/contents`, {
			method: 'POST',
			headers: {
				'x-api-key': exaKey,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				urls,
				text: true
			}),
			signal: controller.signal
		});

		if (!res.ok) {
			const text = await res.text();
			throw new Error(`Exa contents error: ${text}`);
		}

		return res.json();
	} finally {
		clearTimeout(timeout);
	}
}

async function exaSearchWithContents(query: string, numResults: number, highlights: boolean) {
	const searchData = await exaSearch(query, numResults, highlights);
	const results = Array.isArray(searchData?.results) ? searchData.results : [];
	const urls: string[] = results
		.map((r: any) => r?.url)
		.filter((u: unknown): u is string => typeof u === 'string')
		.slice(0, numResults);

	if (urls.length === 0) {
		return searchData;
	}

	try {
		const contentsData = await exaContents(urls);
		const contentResults = Array.isArray(contentsData?.results) ? contentsData.results : [];
		const byUrl = new Map<string, any>();
		for (const c of contentResults) {
			if (c?.url) byUrl.set(c.url, c);
		}

		const mergedResults = results.map((r: any) => {
			const c = r?.url ? byUrl.get(r.url) : undefined;
			if (!c) return r;
			return {
				...r,
				content: {
					text: c.text,
					highlights: c.highlights,
					summary: c.summary
				}
			};
		});
		return { ...searchData, results: mergedResults };
	} catch {
		// If contents fetch fails, still return the search results
		return searchData;
	}
}

// Direct test endpoint (sync)
// POST /tools/exa/search
// Body: { query: string, numResults?: number, highlights?: boolean }
app.post('/tools/exa/search', async (req: Request, res: Response) => {
	const parsed = ExaRequestSchema.safeParse(req.body);
	if (!parsed.success) {
		return res.status(400).json({ error: parsed.error.flatten() });
	}
	const { query, numResults = 5, highlights = true } = parsed.data;

	try {
		const data = await exaSearchWithContents(query, numResults, highlights);
		return res.json(data);
	} catch (err: any) {
		return res.status(500).json({ error: 'Exa request failed', details: err?.message || String(err) });
	}
});

// Vapi custom tool webhook (sync)
// Configure in Vapi Dashboard as:
// - Tool type: function
// - Function name: exa_search
// - Parameters: { query: string, numResults?: number, highlights?: boolean }
// - Server URL: https://<your-public-host>/tools/exa/webhook
app.post('/tools/exa/webhook', async (req: Request, res: Response) => {
	const message = req.body?.message ?? req.body;
	const maybeLists = [
		message?.toolCallList,            // documented server payload
		message?.toolCalls,               // alt shape (web/tool_calls event)
		message?.toolWithToolCallList     // sometimes provided
	].filter((x: unknown) => Array.isArray(x)) as any[][];

	if (maybeLists.length === 0) {
		return res.status(400).json({ error: 'Invalid Vapi tool call payload: no tool call list' });
	}

	const toolCalls = maybeLists[0];
	const results: Array<{ toolCallId: string; result: unknown }> = [];

	for (const toolCall of toolCalls) {
		const toolCallId = (toolCall?.id || toolCall?.toolCallId) as string | undefined;
		const name: string | undefined = (toolCall?.name || toolCall?.function?.name) as string | undefined;

		// Extract arguments robustly (may be object or stringified JSON)
		let args: any = toolCall?.arguments ?? toolCall?.function?.arguments ?? toolCall?.function?.parameters ?? {};
		if (typeof args === 'string') {
			try {
				args = JSON.parse(args);
			} catch {
				// keep as string to trigger validation error below
			}
		}

		if (!toolCallId) {
			continue;
		}

		if (name !== 'exa_search') {
			results.push({
				toolCallId,
				result: { error: 'Unknown tool function', name }
			});
			continue;
		}

		const parsed = ExaRequestSchema.safeParse({
			query: args?.query,
			numResults: typeof args?.numResults === 'number' ? args.numResults : undefined,
			highlights: typeof args?.highlights === 'boolean' ? args.highlights : undefined
		});

		if (!parsed.success) {
			results.push({
				toolCallId,
				result: { error: 'Invalid arguments', details: parsed.error.flatten() }
			});
			continue;
		}

		const { query, numResults = 5, highlights = true } = parsed.data;
		try {
			const data = await exaSearchWithContents(query, numResults, highlights);
			results.push({ toolCallId, result: data });
		} catch (err: any) {
			results.push({
				toolCallId,
				result: { error: 'Exa request failed', details: err?.message || String(err) }
			});
		}
	}

	return res.json({ results });
});

// Diagnostics + manual attach endpoints for Vapi tool
async function attachExaTool(): Promise<any> {
	const vapiKey = process.env.VAPI_API_KEY;
	const assistantId = process.env.VAPI_ASSISTANT_ID;
	const publicBaseUrl = process.env.PUBLIC_BASE_URL;
	const steps: any[] = [];

	if (!vapiKey) throw new Error('Missing VAPI_API_KEY');
	if (!assistantId) throw new Error('Missing VAPI_ASSISTANT_ID');
	if (!publicBaseUrl) throw new Error('Missing PUBLIC_BASE_URL');

	const serverUrl = `${publicBaseUrl.replace(/\/+$/, '')}/tools/exa/webhook`;
	const headers = {
		'Authorization': `Bearer ${vapiKey}`,
		'Content-Type': 'application/json'
	} as Record<string, string>;

	let toolId: string | undefined;

	// Try to create the tool first (simplifies logic across accounts)
	{
		const body = {
			type: 'function',
			function: {
				name: 'exa_search',
				description: 'Search the web with Exa and return results with optional content highlights.',
				parameters: {
					type: 'object',
					properties: {
						query: { type: 'string', description: 'Search query string' },
						numResults: { type: 'number', description: 'Max results to return (1-20)' },
						highlights: { type: 'boolean', description: 'Whether to include highlights/content' }
					},
					required: ['query']
				}
			},
			server: { url: serverUrl }
		};
		const resp = await fetch('https://api.vapi.ai/tool', { method: 'POST', headers, body: JSON.stringify(body) });
		if (resp.ok) {
			const data = await resp.json();
			toolId = data?.id;
			steps.push({ createTool: 'created', id: toolId });
		} else {
			const text = await resp.text();
			steps.push({ createTool: 'failed', status: resp.status, body: text });
		}
	}

	// If create failed or no id, try to find by name
	if (!toolId) {
		const listRes = await fetch('https://api.vapi.ai/tool', { headers });
		if (listRes.ok) {
			const tools = await listRes.json();
			const existing = Array.isArray(tools) ? tools.find((t: any) => (t?.function?.name === 'exa_search')) : undefined;
			if (existing?.id) {
				toolId = existing.id;
				steps.push({ lookupTool: 'found', id: toolId });
			} else {
				steps.push({ lookupTool: 'not_found' });
			}
		} else {
			const text = await listRes.text();
			steps.push({ lookupTool: 'failed', status: listRes.status, body: text });
		}
	}

	if (!toolId) {
		return { ok: false, steps, error: 'Unable to resolve exa_search tool id' };
	}

	// Fetch assistant and attach tool id
	const getAsstRes = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, { headers });
	if (!getAsstRes.ok) {
		const text = await getAsstRes.text();
		return { ok: false, steps, error: 'Fetch assistant failed', status: getAsstRes.status, body: text };
	}
	const assistant = await getAsstRes.json();
	const modelObj = assistant?.model ?? {};
	const currentToolIds: string[] = Array.isArray(modelObj?.toolIds) ? modelObj.toolIds : [];

	if (currentToolIds.includes(toolId)) {
		steps.push({ attach: 'already_attached', toolId });
		return { ok: true, steps, attached: false, toolId };
	}

	const nextToolIds = [...currentToolIds, toolId];
	const patchBody: any = { model: { ...modelObj, toolIds: nextToolIds } };
	const patchRes = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
		method: 'PATCH',
		headers,
		body: JSON.stringify(patchBody)
	});
	if (!patchRes.ok) {
		const text = await patchRes.text();
		return { ok: false, steps, error: 'Attach failed', status: patchRes.status, body: text, toolId };
	}

	const patched = await patchRes.json();
	steps.push({ attach: 'success', toolId });
	return { ok: true, steps, attached: true, toolId, assistant: { id: patched?.id } };
}

app.get('/tools/exa/status', async (_req: Request, res: Response) => {
	try {
		const vapiKey = process.env.VAPI_API_KEY;
		const assistantId = process.env.VAPI_ASSISTANT_ID;
		if (!vapiKey || !assistantId) {
			return res.status(400).json({ error: 'Missing VAPI_API_KEY or VAPI_ASSISTANT_ID' });
		}
		const headers = { 'Authorization': `Bearer ${vapiKey}` } as Record<string, string>;
		const asstRes = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, { headers });
		const body = await asstRes.text();
		return res.status(asstRes.ok ? 200 : 502).json({ ok: asstRes.ok, raw: body });
	} catch (e: any) {
		return res.status(500).json({ error: e?.message || String(e) });
	}
});

app.post('/tools/exa/attach', async (_req: Request, res: Response) => {
	try {
		const result = await attachExaTool();
		return res.status(result.ok ? 200 : 502).json(result);
	} catch (e: any) {
		return res.status(500).json({ ok: false, error: e?.message || String(e) });
	}
});

app.listen(PORT, () => {
	console.log(`Server listening on http://localhost:${PORT}`);
	console.log('Exa tool endpoint (direct): POST /tools/exa/search');
	console.log('Vapi tool webhook (exa_search): POST /tools/exa/webhook');
});

// Optional: auto-create Vapi tool and attach to assistant if env is set
void (async () => {
	try {
		const vapiKey = process.env.VAPI_API_KEY;
		const assistantId = process.env.VAPI_ASSISTANT_ID;
		const publicBaseUrl = process.env.PUBLIC_BASE_URL;
		if (!vapiKey || !assistantId || !publicBaseUrl) {
			console.log('Vapi auto-setup skipped: missing VAPI_API_KEY, VAPI_ASSISTANT_ID, or PUBLIC_BASE_URL');
			return;
		}

		const serverUrl = `${publicBaseUrl.replace(/\/+$/, '')}/tools/exa/webhook`;
		const headers = {
			'Authorization': `Bearer ${vapiKey}`,
			'Content-Type': 'application/json'
		} as Record<string, string>;

		// Try to find existing tool by name
		let toolId: string | undefined;
		try {
			const listRes = await fetch('https://api.vapi.ai/tool', { headers });
			if (listRes.ok) {
				const tools = await listRes.json();
				if (Array.isArray(tools)) {
					const existing = tools.find((t: any) => (t?.function?.name === 'exa_search'));
					if (existing?.id) {
						toolId = existing.id as string;
					}
				}
			}
		} catch {}

		// Create tool if not found
		if (!toolId) {
			const createRes = await fetch('https://api.vapi.ai/tool', {
				method: 'POST',
				headers,
				body: JSON.stringify({
					type: 'function',
					function: {
						name: 'exa_search',
						description: 'Search the web with Exa and return results with optional content highlights.',
						parameters: {
							type: 'object',
							properties: {
								query: { type: 'string', description: 'Search query string' },
								numResults: { type: 'number', description: 'Max results to return (1-20)' },
								highlights: { type: 'boolean', description: 'Whether to include highlights/content' }
							},
							required: ['query']
						}
					},
					server: {
						url: serverUrl
					}
				})
			});
			if (!createRes.ok) {
				const text = await createRes.text();
				console.warn('Failed to create Vapi tool exa_search:', text);
				return;
			}
			const created = await createRes.json();
			toolId = created?.id;
		}

		if (!toolId) {
			console.warn('Could not resolve Vapi tool id for exa_search');
			return;
		}

		// Get current assistant to merge toolIds
		const getAsstRes = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, { headers });
		if (!getAsstRes.ok) {
			const text = await getAsstRes.text();
			console.warn('Failed to fetch Vapi assistant:', text);
			return;
		}
		const assistant = await getAsstRes.json();
		const modelObj = assistant?.model ?? {};
		const currentToolIds: string[] = Array.isArray(modelObj?.toolIds) ? modelObj.toolIds : [];
		if (currentToolIds.includes(toolId)) {
			console.log('Vapi tool already attached to assistant:', toolId);
			return;
		}
		const nextToolIds = [...currentToolIds, toolId];

		// Patch assistant with updated toolIds (preserve provider/model if present)
		const patchBody: any = { model: { ...modelObj, toolIds: nextToolIds } };
		const patchRes = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
			method: 'PATCH',
			headers,
			body: JSON.stringify(patchBody)
		});
		if (!patchRes.ok) {
			const text = await patchRes.text();
			console.warn('Failed to attach tool to assistant:', text);
			return;
		}
		console.log('Attached exa_search tool to assistant:', toolId);
	} catch (e: any) {
		console.warn('Vapi auto-setup error:', e?.message || String(e));
	}
})(); 