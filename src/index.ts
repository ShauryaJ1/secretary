import 'dotenv/config';
import express, { Request, Response } from 'express';
import fetch from 'cross-fetch';
import { z } from 'zod';
import { Composio } from '@composio/core';
import { VercelProvider } from '@composio/vercel';
import { VapiClient } from '@vapi-ai/server-sdk';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// =============================================================================
// CONFIGURATION - All environment variables in one place
// =============================================================================
const CONFIG = {
	// Server
	PORT: process.env.PORT ? Number(process.env.PORT) : 3000,
	
	// Exa API
	EXA_API_KEY: process.env.EXA_API_KEY,
	EXA_API_BASE_URL: process.env.EXA_API_BASE_URL || 'https://api.exa.ai',
	
	// VAPI
	VAPI_API_KEY: process.env.VAPI_API_KEY,
	VAPI_ASSISTANT_ID: process.env.VAPI_ASSISTANT_ID || process.env.ASSISTANT_ID, // Support both names
	PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL,
	
	// VAPI - Outbound Calls
	OUTBOUND_ASSISTANT_ID: process.env.OUTBOUND_ASSISTANT_ID,
	VAPI_FROM_NUMBER_ID: process.env.VAPI_FROM_NUMBER_ID || process.env.SECOND_PHONE_NUMBER_ID, // Support both names
	VAPI_FORCE_PHONE_PATCH: String(process.env.VAPI_FORCE_PHONE_PATCH || '').toLowerCase() === 'true',
	
	// Supabase
	SUPABASE_URL: process.env.SUPABASE_URL,
	SUPABASE_KEY: process.env.SUPABASE_KEY,
	
	// Voice Defaults
	DEFAULT_VOICE_PROVIDER: process.env.DEFAULT_VOICE_PROVIDER || '11labs',
	DEFAULT_VOICE_ID: process.env.DEFAULT_VOICE_ID || 'cgSgspJ2msm6clMCkdW9'
} as const;

const app = express();
app.use(express.json({ limit: '50mb' })); // Increased for large VAPI payloads with web search data

// Initialize Composio client
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY!,
  provider: new VercelProvider(),
  toolkitVersions: {
    gmail: '20251027_00',
  },
});

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

// Exa web contents request schema
const ExaWebContentsRequestSchema = z.object({
	urls: z.array(z.string().url()).min(1, 'at least one URL is required').max(20, 'maximum 20 URLs allowed'),
	getText: z.boolean().optional(),
	getHighlights: z.boolean().optional()
});

// Call status request schema
const CallStatusRequestSchema = z.object({
	callId: z.string().min(1, 'callId is required')
});

// Call messages request schema
const CallMessagesRequestSchema = z.object({
	callId: z.string().min(1, 'callId is required')
});

// Gmail tool schemas
const GmailFetchEmailsSchema = z.object({
	userId: z.string(),
	query: z.string().optional(),
	max_results: z.number().int().positive().optional(),
	verbose: z.boolean().optional(),
	include_payload: z.boolean().optional(),
	ids_only: z.boolean().optional(),
	include_spam_trash: z.boolean().optional(),
	label_ids: z.array(z.string()).optional(),
	page_token: z.string().optional(),
	user_id: z.string().optional(),
});

const GmailListThreadsSchema = z.object({
	userId: z.string(),
	query: z.string().optional(),
	max_results: z.number().int().positive().optional(),
	verbose: z.boolean().optional(),
	page_token: z.string().optional(),
	user_id: z.string().optional(),
});

const GmailFetchMessageByIdSchema = z.object({
	userId: z.string(),
	message_id: z.string().min(1, 'message_id is required'),
	format: z.string().optional(),
	user_id: z.string().optional(),
});

const GmailFetchMessageByThreadIdSchema = z.object({
	userId: z.string(),
	thread_id: z.string().min(1, 'thread_id is required'),
	page_token: z.string().optional(),
	user_id: z.string().optional(),
});

const GmailSendEmailSchema = z.object({
	userId: z.string(),
	recipient_email: z.string().email().optional(),
	subject: z.string().optional(),
	body: z.string().optional(),
	cc: z.array(z.string()).optional(),
	bcc: z.array(z.string()).optional(),
	is_html: z.boolean().optional(),
	user_id: z.string().optional(),
});

const GmailReplyToThreadSchema = z.object({
	userId: z.string(),
	thread_id: z.string().min(1, 'thread_id is required'),
	message_body: z.string().optional(),
	recipient_email: z.string().email().optional(),
	cc: z.array(z.string()).optional(),
	bcc: z.array(z.string()).optional(),
	is_html: z.boolean().optional(),
	extra_recipients: z.array(z.string()).optional(),
	user_id: z.string().optional(),
});

const GmailCreateDraftSchema = z.object({
	userId: z.string(),
	recipient_email: z.string().email().optional(),
	subject: z.string().optional(),
	body: z.string().optional(),
	cc: z.array(z.string()).optional(),
	bcc: z.array(z.string()).optional(),
	is_html: z.boolean().optional(),
	user_id: z.string().optional(),
});

const GmailSendDraftSchema = z.object({
	userId: z.string(),
	draft_id: z.string().min(1, 'draft_id is required'),
	user_id: z.string().optional(),
});

const GmailListDraftsSchema = z.object({
	userId: z.string(),
	max_results: z.number().int().positive().optional(),
	verbose: z.boolean().optional(),
	page_token: z.string().optional(),
	user_id: z.string().optional(),
});

async function exaSearch(query: string, numResults: number, highlights: boolean) {
	const exaKey = CONFIG.EXA_API_KEY;
	if (!exaKey) {
		throw new Error('Missing EXA_API_KEY');
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 15000);

	try {
		const baseUrl = CONFIG.EXA_API_BASE_URL || 'https://api.exa.ai';
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
async function exaContents(urls: string[], getText = true, getHighlights = false) {
	const exaKey = CONFIG.EXA_API_KEY;
	if (!exaKey) {
		throw new Error('Missing EXA_API_KEY');
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 15000);

	try {
		const baseUrl = CONFIG.EXA_API_BASE_URL || 'https://api.exa.ai';
		const payload: any = { urls };
		if (getText) payload.text = true;
		if (getHighlights) payload.highlights = true;

		const res = await fetch(`${baseUrl}/contents`, {
			method: 'POST',
			headers: {
				'x-api-key': exaKey,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(payload),
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

// Outbound call tool
const OutboundCallRequestSchema = z.object({
	customerNumber: z.string().min(8, 'customerNumber is required'),
	instructions: z.string().min(1, 'instructions is required'),
	schedulePlan: z.object({
		earliestAt: z.string().min(1, 'earliestAt is required in ISO 8601 format (e.g., 2025-05-30T14:30:00Z)'),
		latestAt: z.string().optional()
	}).optional()
});

async function createOutboundCall(
	customerNumber: string,
	instructions: string,
	schedulePlan?: { earliestAt: string; latestAt?: string }
) {
	if (!CONFIG.VAPI_API_KEY) throw new Error('Missing VAPI_API_KEY');
	if (!CONFIG.OUTBOUND_ASSISTANT_ID) throw new Error('Missing OUTBOUND_ASSISTANT_ID');
	if (!CONFIG.VAPI_FROM_NUMBER_ID) throw new Error('Missing VAPI_FROM_NUMBER_ID');

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 20000);
	try {
		const headers = {
			'Authorization': `Bearer ${CONFIG.VAPI_API_KEY}`,
			'Content-Type': 'application/json'
		} as Record<string, string>;

		const body: any = {
			assistantId: CONFIG.OUTBOUND_ASSISTANT_ID,
			phoneNumberId: CONFIG.VAPI_FROM_NUMBER_ID,
			customer: { number: customerNumber },
			assistantOverrides: {
				model: {
					provider: 'openai',
					model: 'gpt-4o-mini',
					messages: [
						{ role: 'system', content: instructions }
					]
				}
			}
		};

		// Add schedulePlan if provided
		if (schedulePlan) {
			body.schedulePlan = schedulePlan;
		}

		const res = await fetch('https://api.vapi.ai/call', {
			method: 'POST',
			headers,
			body: JSON.stringify(body),
			signal: controller.signal
		});
		if (!res.ok) {
			const text = await res.text();
			throw new Error(`Vapi Create Call error: ${text}`);
		}
		return res.json();
	} finally {
		clearTimeout(timeout);
	}
}

// Get call status from Vapi
async function getCallStatus(callId: string) {
	const vapiKey = CONFIG.VAPI_API_KEY;
	if (!vapiKey) throw new Error('Missing VAPI_API_KEY');

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 15000);
	try {
		const headers = {
			'Authorization': `Bearer ${vapiKey}`
		} as Record<string, string>;
		
		const res = await fetch(`https://api.vapi.ai/call/${callId}`, {
			method: 'GET',
			headers,
			signal: controller.signal
		});
		
		if (!res.ok) {
			const text = await res.text();
			throw new Error(`Vapi Get Call error: ${text}`);
		}
		return res.json();
	} finally {
		clearTimeout(timeout);
	}
}

// Get call messages from Vapi
async function getCallMessages(callId: string) {
	const vapiKey = CONFIG.VAPI_API_KEY;
	if (!vapiKey) throw new Error('Missing VAPI_API_KEY');

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 15000);
	try {
		const headers = {
			'Authorization': `Bearer ${vapiKey}`
		} as Record<string, string>;
		
		const res = await fetch(`https://api.vapi.ai/call/${callId}`, {
			method: 'GET',
			headers,
			signal: controller.signal
		});
		
		if (!res.ok) {
			const text = await res.text();
			throw new Error(`Vapi Get Call error: ${text}`);
		}
		const callData = await res.json();
		// Extract just the messages and relevant metadata
		return {
			id: callData.id,
			status: callData.status,
			messages: callData.messages || [],
			startedAt: callData.startedAt,
			endedAt: callData.endedAt,
			endedReason: callData.endedReason
		};
	} finally {
		clearTimeout(timeout);
	}
}

// Optional: update phone number metadata with last target, only if explicitly enabled
async function patchSecondPhoneNumberDestination(customerNumber: string) {
	const vapiKey = CONFIG.VAPI_API_KEY;
	const phoneNumberId = CONFIG.VAPI_FROM_NUMBER_ID;
	if (!vapiKey) throw new Error('Missing VAPI_API_KEY');
	if (!phoneNumberId) throw new Error('Missing SECOND_PHONE_NUMBER_ID');

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 15000);
	try {
		const headers = {
			'Authorization': `Bearer ${vapiKey}`,
			'Content-Type': 'application/json'
		} as Record<string, string>;
		// We only set metadata by default to avoid org-specific routing configs.
		// If your org requires a specific routing field, replace this with that field.
		const body = {
			metadata: { lastCustomerNumber: customerNumber }
		};
		const res = await fetch(`https://api.vapi.ai/phone-number/${phoneNumberId}`, {
			method: 'PATCH',
			headers,
			body: JSON.stringify(body),
			signal: controller.signal
		});
		if (!res.ok) {
			const text = await res.text();
			throw new Error(`Vapi Phone Number update error: ${text}`);
		}
		return res.json();
	} finally {
		clearTimeout(timeout);
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

// Direct call status endpoint
// GET /tools/call/status/:callId
app.get('/tools/call/status/:callId', async (req: Request, res: Response) => {
	const parsed = CallStatusRequestSchema.safeParse({ callId: req.params.callId });
	if (!parsed.success) {
		return res.status(400).json({ error: parsed.error.flatten() });
	}
	const { callId } = parsed.data;

	try {
		const data = await getCallStatus(callId);
		return res.json(data);
	} catch (err: any) {
		return res.status(500).json({ error: 'Get call status failed', details: err?.message || String(err) });
	}
});

// Direct call messages endpoint
// GET /tools/call/messages/:callId
app.get('/tools/call/messages/:callId', async (req: Request, res: Response) => {
	const parsed = CallMessagesRequestSchema.safeParse({ callId: req.params.callId });
	if (!parsed.success) {
		return res.status(400).json({ error: parsed.error.flatten() });
	}
	const { callId } = parsed.data;

	try {
		const data = await getCallMessages(callId);
		return res.json(data);
	} catch (err: any) {
		return res.status(500).json({ error: 'Get call messages failed', details: err?.message || String(err) });
	}
});

// Direct web contents endpoint
// POST /tools/exa/contents
// Body: { urls: string[], getText?: boolean, getHighlights?: boolean }
app.post('/tools/exa/contents', async (req: Request, res: Response) => {
	const parsed = ExaWebContentsRequestSchema.safeParse(req.body);
	if (!parsed.success) {
		return res.status(400).json({ error: parsed.error.flatten() });
	}
	const { urls, getText = true, getHighlights = false } = parsed.data;

	try {
		const data = await exaContents(urls, getText, getHighlights);
		return res.json(data);
	} catch (err: any) {
		return res.status(500).json({ error: 'Exa contents request failed', details: err?.message || String(err) });
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

// Vapi custom tool webhook for web contents
// Configure in Vapi Dashboard as:
// - Tool type: function
// - Function name: exa_get_contents
// - Parameters: { urls: string[], getText?: boolean, getHighlights?: boolean }
// - Server URL: https://<your-public-host>/tools/exa/contents/webhook
app.post('/tools/exa/contents/webhook', async (req: Request, res: Response) => {
	const message = req.body?.message ?? req.body;
	const maybeLists = [
		message?.toolCallList,
		message?.toolCalls,
		message?.toolWithToolCallList
	].filter((x: unknown) => Array.isArray(x)) as any[][];

	if (maybeLists.length === 0) {
		return res.status(400).json({ error: 'Invalid Vapi tool call payload: no tool call list' });
	}

	const toolCalls = maybeLists[0];
	const results: Array<{ toolCallId: string; result: unknown }> = [];

	for (const toolCall of toolCalls) {
		const toolCallId = (toolCall?.id || toolCall?.toolCallId) as string | undefined;
		const name: string | undefined = (toolCall?.name || toolCall?.function?.name) as string | undefined;

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

		if (name !== 'exa_get_contents') {
			results.push({
				toolCallId,
				result: { error: 'Unknown tool function', name }
			});
			continue;
		}

		const parsed = ExaWebContentsRequestSchema.safeParse({
			urls: args?.urls,
			getText: typeof args?.getText === 'boolean' ? args.getText : undefined,
			getHighlights: typeof args?.getHighlights === 'boolean' ? args.getHighlights : undefined
		});

		if (!parsed.success) {
			results.push({
				toolCallId,
				result: { error: 'Invalid arguments', details: parsed.error.flatten() }
			});
			continue;
		}

		const { urls, getText = true, getHighlights = false } = parsed.data;
		try {
			const data = await exaContents(urls, getText, getHighlights);
			results.push({ toolCallId, result: data });
		} catch (err: any) {
			results.push({
				toolCallId,
				result: { error: 'Exa contents request failed', details: err?.message || String(err) }
			});
		}
	}

	return res.json({ results });
});

// Vapi custom tool webhook for call status
// Configure in Vapi Dashboard as:
// - Tool type: function
// - Function name: get_call_status
// - Parameters: { callId: string }
// - Server URL: https://<your-public-host>/tools/call/status/webhook
app.post('/tools/call/status/webhook', async (req: Request, res: Response) => {
	const message = req.body?.message ?? req.body;
	const maybeLists = [
		message?.toolCallList,
		message?.toolCalls,
		message?.toolWithToolCallList
	].filter((x: unknown) => Array.isArray(x)) as any[][];

	if (maybeLists.length === 0) {
		return res.status(400).json({ error: 'Invalid Vapi tool call payload: no tool call list' });
	}

	const toolCalls = maybeLists[0];
	const results: Array<{ toolCallId: string; result: unknown }> = [];

	for (const toolCall of toolCalls) {
		const toolCallId = (toolCall?.id || toolCall?.toolCallId) as string | undefined;
		const name: string | undefined = (toolCall?.name || toolCall?.function?.name) as string | undefined;

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

		if (name !== 'get_call_status') {
			results.push({
				toolCallId,
				result: { error: 'Unknown tool function', name }
			});
			continue;
		}

		const parsed = CallStatusRequestSchema.safeParse({
			callId: args?.callId
		});

		if (!parsed.success) {
			results.push({
				toolCallId,
				result: { error: 'Invalid arguments', details: parsed.error.flatten() }
			});
			continue;
		}

		const { callId } = parsed.data;
		try {
			const data = await getCallStatus(callId);
			results.push({ toolCallId, result: data });
		} catch (err: any) {
			results.push({
				toolCallId,
				result: { error: 'Get call status failed', details: err?.message || String(err) }
			});
		}
	}

	return res.json({ results });
});

// Vapi custom tool webhook for call messages
// Configure in Vapi Dashboard as:
// - Tool type: function
// - Function name: get_call_messages
// - Parameters: { callId: string }
// - Server URL: https://<your-public-host>/tools/call/messages/webhook
app.post('/tools/call/messages/webhook', async (req: Request, res: Response) => {
	const message = req.body?.message ?? req.body;
	const maybeLists = [
		message?.toolCallList,
		message?.toolCalls,
		message?.toolWithToolCallList
	].filter((x: unknown) => Array.isArray(x)) as any[][];

	if (maybeLists.length === 0) {
		return res.status(400).json({ error: 'Invalid Vapi tool call payload: no tool call list' });
	}

	const toolCalls = maybeLists[0];
	const results: Array<{ toolCallId: string; result: unknown }> = [];

	for (const toolCall of toolCalls) {
		const toolCallId = (toolCall?.id || toolCall?.toolCallId) as string | undefined;
		const name: string | undefined = (toolCall?.name || toolCall?.function?.name) as string | undefined;

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

		if (name !== 'get_call_messages') {
			results.push({
				toolCallId,
				result: { error: 'Unknown tool function', name }
			});
			continue;
		}

		const parsed = CallMessagesRequestSchema.safeParse({
			callId: args?.callId
		});

		if (!parsed.success) {
			results.push({
				toolCallId,
				result: { error: 'Invalid arguments', details: parsed.error.flatten() }
			});
			continue;
		}

		const { callId } = parsed.data;
		try {
			const data = await getCallMessages(callId);
			results.push({ toolCallId, result: data });
		} catch (err: any) {
			results.push({
				toolCallId,
				result: { error: 'Get call messages failed', details: err?.message || String(err) }
			});
		}
	}

	return res.json({ results });
});

// Diagnostics + manual attach endpoints for Vapi tool
async function attachExaTool(): Promise<any> {
	const vapiKey = CONFIG.VAPI_API_KEY;
	const assistantId = CONFIG.VAPI_ASSISTANT_ID;
	const publicBaseUrl = CONFIG.PUBLIC_BASE_URL;
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

async function attachOutboundTool(): Promise<any> {
	const vapiKey = CONFIG.VAPI_API_KEY;
	const assistantId = CONFIG.VAPI_ASSISTANT_ID;
	const publicBaseUrl = CONFIG.PUBLIC_BASE_URL;
	const steps: any[] = [];

	if (!vapiKey) throw new Error('Missing VAPI_API_KEY');
	if (!assistantId) throw new Error('Missing VAPI_ASSISTANT_ID');
	if (!publicBaseUrl) throw new Error('Missing PUBLIC_BASE_URL');

	const serverUrl = `${publicBaseUrl.replace(/\/+$/, '')}/tools/outbound/webhook`;
	const headers = {
		'Authorization': `Bearer ${vapiKey}`,
		'Content-Type': 'application/json'
	} as Record<string, string>;

	let toolId: string | undefined;

	// Try to create the tool first
	{
		const body = {
			type: 'function',
			function: {
				name: 'make_outbound_call',
				description: 'Place an outbound phone call to the provided customer number. Can schedule calls for a future time using schedulePlan. For immediate calls, omit schedulePlan. For scheduled calls, ask the user for their timezone to convert to UTC ISO 8601 format.',
				parameters: {
					type: 'object',
					properties: {
						customerNumber: { type: 'string', description: 'Destination phone in E.164 format, e.g. +14155551212' },
						instructions: { type: 'string', description: 'System instructions for the assistant on this call' },
						schedulePlan: {
							type: 'object',
							description: 'Optional: Schedule the call for a future time. Dates must be in ISO 8601 format with timezone (e.g., 2025-05-30T14:30:00Z for UTC, or 2025-05-30T14:30:00-08:00 for PST). Ask user for their timezone if scheduling.',
							properties: {
								earliestAt: { type: 'string', description: 'Earliest time to place the call in ISO 8601 format (required if schedulePlan is provided)' },
								latestAt: { type: 'string', description: 'Optional: Latest time to place the call in ISO 8601 format' }
							},
							required: ['earliestAt']
						}
					},
					required: ['customerNumber', 'instructions']
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
			const existing = Array.isArray(tools) ? tools.find((t: any) => (t?.function?.name === 'make_outbound_call')) : undefined;
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
		return { ok: false, steps, error: 'Unable to resolve make_outbound_call tool id' };
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

async function attachExaContentsTool(): Promise<any> {
	const vapiKey = CONFIG.VAPI_API_KEY;
	const assistantId = CONFIG.VAPI_ASSISTANT_ID;
	const publicBaseUrl = CONFIG.PUBLIC_BASE_URL;
	const steps: any[] = [];

	if (!vapiKey) throw new Error('Missing VAPI_API_KEY');
	if (!assistantId) throw new Error('Missing VAPI_ASSISTANT_ID');
	if (!publicBaseUrl) throw new Error('Missing PUBLIC_BASE_URL');

	const serverUrl = `${publicBaseUrl.replace(/\/+$/, '')}/tools/exa/contents/webhook`;
	const headers = {
		'Authorization': `Bearer ${vapiKey}`,
		'Content-Type': 'application/json'
	} as Record<string, string>;

	let toolId: string | undefined;

	// Try to create the tool first
	{
		const body = {
			type: 'function',
			function: {
				name: 'exa_get_contents',
				description: 'Fetch full web page contents from a list of URLs using Exa AI. Returns text and optional highlights from each URL.',
				parameters: {
					type: 'object',
					properties: {
						urls: { 
							type: 'array',
							items: { type: 'string' },
							description: 'List of URLs to fetch contents from (1-20 URLs)',
							minItems: 1,
							maxItems: 20
						},
						getText: { type: 'boolean', description: 'Whether to include full text content (default: true)' },
						getHighlights: { type: 'boolean', description: 'Whether to include content highlights (default: false)' }
					},
					required: ['urls']
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
			const existing = Array.isArray(tools) ? tools.find((t: any) => (t?.function?.name === 'exa_get_contents')) : undefined;
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
		return { ok: false, steps, error: 'Unable to resolve exa_get_contents tool id' };
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

async function attachCallStatusTool(): Promise<any> {
	const vapiKey = CONFIG.VAPI_API_KEY;
	const assistantId = CONFIG.VAPI_ASSISTANT_ID;
	const publicBaseUrl = CONFIG.PUBLIC_BASE_URL;
	const steps: any[] = [];

	if (!vapiKey) throw new Error('Missing VAPI_API_KEY');
	if (!assistantId) throw new Error('Missing VAPI_ASSISTANT_ID');
	if (!publicBaseUrl) throw new Error('Missing PUBLIC_BASE_URL');

	const serverUrl = `${publicBaseUrl.replace(/\/+$/, '')}/tools/call/status/webhook`;
	const headers = {
		'Authorization': `Bearer ${vapiKey}`,
		'Content-Type': 'application/json'
	} as Record<string, string>;

	let toolId: string | undefined;

	// Try to create the tool first
	{
		const body = {
			type: 'function',
			function: {
				name: 'get_call_status',
				description: 'Retrieve the full status and details of a call by its ID, including messages, costs, and metadata.',
				parameters: {
					type: 'object',
					properties: {
						callId: { type: 'string', description: 'The unique ID of the call to retrieve' }
					},
					required: ['callId']
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
			const existing = Array.isArray(tools) ? tools.find((t: any) => (t?.function?.name === 'get_call_status')) : undefined;
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
		return { ok: false, steps, error: 'Unable to resolve get_call_status tool id' };
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

async function attachCallMessagesTool(): Promise<any> {
	const vapiKey = CONFIG.VAPI_API_KEY;
	const assistantId = CONFIG.VAPI_ASSISTANT_ID;
	const publicBaseUrl = CONFIG.PUBLIC_BASE_URL;
	const steps: any[] = [];

	if (!vapiKey) throw new Error('Missing VAPI_API_KEY');
	if (!assistantId) throw new Error('Missing VAPI_ASSISTANT_ID');
	if (!publicBaseUrl) throw new Error('Missing PUBLIC_BASE_URL');

	const serverUrl = `${publicBaseUrl.replace(/\/+$/, '')}/tools/call/messages/webhook`;
	const headers = {
		'Authorization': `Bearer ${vapiKey}`,
		'Content-Type': 'application/json'
	} as Record<string, string>;

	let toolId: string | undefined;

	// Try to create the tool first
	{
		const body = {
			type: 'function',
			function: {
				name: 'get_call_messages',
				description: 'Retrieve the conversation transcript/messages from a completed call by its ID.',
				parameters: {
					type: 'object',
					properties: {
						callId: { type: 'string', description: 'The unique ID of the call to retrieve messages from' }
					},
					required: ['callId']
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
			const existing = Array.isArray(tools) ? tools.find((t: any) => (t?.function?.name === 'get_call_messages')) : undefined;
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
		return { ok: false, steps, error: 'Unable to resolve get_call_messages tool id' };
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
		const vapiKey = CONFIG.VAPI_API_KEY;
		const assistantId = CONFIG.VAPI_ASSISTANT_ID;
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

app.post('/tools/exa/contents/attach', async (_req: Request, res: Response) => {
	try {
		const result = await attachExaContentsTool();
		return res.status(result.ok ? 200 : 502).json(result);
	} catch (e: any) {
		return res.status(500).json({ ok: false, error: e?.message || String(e) });
	}
});

// Outbound tool: status + attach endpoints
app.get('/tools/outbound/status', async (_req: Request, res: Response) => {
	try {
		const vapiKey = CONFIG.VAPI_API_KEY;
		const assistantId = CONFIG.VAPI_ASSISTANT_ID;
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

app.post('/tools/outbound/attach', async (_req: Request, res: Response) => {
	try {
		const result = await attachOutboundTool();
		return res.status(result.ok ? 200 : 502).json(result);
	} catch (e: any) {
		return res.status(500).json({ ok: false, error: e?.message || String(e) });
	}
});

// Call tools: status + attach endpoints
app.get('/tools/call/status-tool/status', async (_req: Request, res: Response) => {
	try {
		const vapiKey = CONFIG.VAPI_API_KEY;
		const assistantId = CONFIG.VAPI_ASSISTANT_ID;
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

app.post('/tools/call/status-tool/attach', async (_req: Request, res: Response) => {
	try {
		const result = await attachCallStatusTool();
		return res.status(result.ok ? 200 : 502).json(result);
	} catch (e: any) {
		return res.status(500).json({ ok: false, error: e?.message || String(e) });
	}
});

app.get('/tools/call/messages-tool/status', async (_req: Request, res: Response) => {
	try {
		const vapiKey = CONFIG.VAPI_API_KEY;
		const assistantId = CONFIG.VAPI_ASSISTANT_ID;
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

app.post('/tools/call/messages-tool/attach', async (_req: Request, res: Response) => {
	try {
		const result = await attachCallMessagesTool();
		return res.status(result.ok ? 200 : 502).json(result);
	} catch (e: any) {
		return res.status(500).json({ ok: false, error: e?.message || String(e) });
	}
});

// Gmail webhooks
app.post('/tools/gmail/fetch-emails/webhook', async (req: Request, res: Response) => {
	const message = req.body?.message ?? req.body;
	const maybeLists = [
		message?.toolCallList,
		message?.toolCalls,
		message?.toolWithToolCallList
	].filter((x: unknown) => Array.isArray(x)) as any[][];

	if (maybeLists.length === 0) {
		return res.status(400).json({ error: 'Invalid Vapi tool call payload: no tool call list' });
	}

	const toolCalls = maybeLists[0];
	const results: Array<{ toolCallId: string; result: unknown }> = [];

	for (const toolCall of toolCalls) {
		const toolCallId = (toolCall?.id || toolCall?.toolCallId) as string | undefined;
		const name: string | undefined = (toolCall?.name || toolCall?.function?.name) as string | undefined;

		let args: any = toolCall?.arguments ?? toolCall?.function?.arguments ?? toolCall?.function?.parameters ?? {};
		if (typeof args === 'string') {
			try {
				args = JSON.parse(args);
			} catch {}
		}

		if (!toolCallId) {
			continue;
		}

		if (name !== 'gmail_fetch_emails') {
			results.push({
				toolCallId,
				result: { error: 'Unknown tool function', name }
			});
			continue;
		}

		const userId = args?.userId || 'default';
		try {
			const result = await composio.tools.execute('GMAIL_FETCH_EMAILS', {
				userId,
				arguments: {
					query: args?.query,
					max_results: args?.max_results,
					verbose: args?.verbose,
					include_payload: args?.include_payload,
					ids_only: args?.ids_only,
					include_spam_trash: args?.include_spam_trash,
					label_ids: args?.label_ids,
					page_token: args?.page_token,
					user_id: args?.user_id,
				},
			});
			results.push({ toolCallId, result });
		} catch (err: any) {
			results.push({
				toolCallId,
				result: { error: 'Gmail fetch emails failed', details: err?.message || String(err) }
			});
		}
	}

	return res.json({ results });
});

app.post('/tools/gmail/list-threads/webhook', async (req: Request, res: Response) => {
	const message = req.body?.message ?? req.body;
	const maybeLists = [
		message?.toolCallList,
		message?.toolCalls,
		message?.toolWithToolCallList
	].filter((x: unknown) => Array.isArray(x)) as any[][];

	if (maybeLists.length === 0) {
		return res.status(400).json({ error: 'Invalid Vapi tool call payload: no tool call list' });
	}

	const toolCalls = maybeLists[0];
	const results: Array<{ toolCallId: string; result: unknown }> = [];

	for (const toolCall of toolCalls) {
		const toolCallId = (toolCall?.id || toolCall?.toolCallId) as string | undefined;
		const name: string | undefined = (toolCall?.name || toolCall?.function?.name) as string | undefined;

		let args: any = toolCall?.arguments ?? toolCall?.function?.arguments ?? toolCall?.function?.parameters ?? {};
		if (typeof args === 'string') {
			try {
				args = JSON.parse(args);
			} catch {}
		}

		if (!toolCallId) {
			continue;
		}

		if (name !== 'gmail_list_threads') {
			results.push({
				toolCallId,
				result: { error: 'Unknown tool function', name }
			});
			continue;
		}

		const userId = args?.userId || 'default';
		try {
			const result = await composio.tools.execute('GMAIL_LIST_THREADS', {
				userId,
				arguments: {
					query: args?.query,
					max_results: args?.max_results,
					verbose: args?.verbose,
					page_token: args?.page_token,
					user_id: args?.user_id,
				},
			});
			results.push({ toolCallId, result });
		} catch (err: any) {
			results.push({
				toolCallId,
				result: { error: 'Gmail list threads failed', details: err?.message || String(err) }
			});
		}
	}

	return res.json({ results });
});

app.post('/tools/gmail/fetch-message-by-id/webhook', async (req: Request, res: Response) => {
	const message = req.body?.message ?? req.body;
	const maybeLists = [
		message?.toolCallList,
		message?.toolCalls,
		message?.toolWithToolCallList
	].filter((x: unknown) => Array.isArray(x)) as any[][];

	if (maybeLists.length === 0) {
		return res.status(400).json({ error: 'Invalid Vapi tool call payload: no tool call list' });
	}

	const toolCalls = maybeLists[0];
	const results: Array<{ toolCallId: string; result: unknown }> = [];

	for (const toolCall of toolCalls) {
		const toolCallId = (toolCall?.id || toolCall?.toolCallId) as string | undefined;
		const name: string | undefined = (toolCall?.name || toolCall?.function?.name) as string | undefined;

		let args: any = toolCall?.arguments ?? toolCall?.function?.arguments ?? toolCall?.function?.parameters ?? {};
		if (typeof args === 'string') {
			try {
				args = JSON.parse(args);
			} catch {}
		}

		if (!toolCallId) {
			continue;
		}

		if (name !== 'gmail_fetch_message_by_id') {
			results.push({
				toolCallId,
				result: { error: 'Unknown tool function', name }
			});
			continue;
		}

		const userId = args?.userId || 'default';
		const parsed = GmailFetchMessageByIdSchema.safeParse({ userId, ...args });
		if (!parsed.success) {
			results.push({
				toolCallId,
				result: { error: 'Invalid arguments', details: parsed.error.flatten() }
			});
			continue;
		}

		try {
			const result = await composio.tools.execute('GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID', {
				userId,
				arguments: {
					message_id: args.message_id,
					format: args?.format,
					user_id: args?.user_id,
				},
			});
			results.push({ toolCallId, result });
		} catch (err: any) {
			results.push({
				toolCallId,
				result: { error: 'Gmail fetch message by ID failed', details: err?.message || String(err) }
			});
		}
	}

	return res.json({ results });
});

app.post('/tools/gmail/fetch-message-by-thread/webhook', async (req: Request, res: Response) => {
	const message = req.body?.message ?? req.body;
	const maybeLists = [
		message?.toolCallList,
		message?.toolCalls,
		message?.toolWithToolCallList
	].filter((x: unknown) => Array.isArray(x)) as any[][];

	if (maybeLists.length === 0) {
		return res.status(400).json({ error: 'Invalid Vapi tool call payload: no tool call list' });
	}

	const toolCalls = maybeLists[0];
	const results: Array<{ toolCallId: string; result: unknown }> = [];

	for (const toolCall of toolCalls) {
		const toolCallId = (toolCall?.id || toolCall?.toolCallId) as string | undefined;
		const name: string | undefined = (toolCall?.name || toolCall?.function?.name) as string | undefined;

		let args: any = toolCall?.arguments ?? toolCall?.function?.arguments ?? toolCall?.function?.parameters ?? {};
		if (typeof args === 'string') {
			try {
				args = JSON.parse(args);
			} catch {}
		}

		if (!toolCallId) {
			continue;
		}

		if (name !== 'gmail_fetch_message_by_thread') {
			results.push({
				toolCallId,
				result: { error: 'Unknown tool function', name }
			});
			continue;
		}

		const userId = args?.userId || 'default';
		const parsed = GmailFetchMessageByThreadIdSchema.safeParse({ userId, ...args });
		if (!parsed.success) {
			results.push({
				toolCallId,
				result: { error: 'Invalid arguments', details: parsed.error.flatten() }
			});
			continue;
		}

		try {
			const result = await composio.tools.execute('GMAIL_FETCH_MESSAGE_BY_THREAD_ID', {
				userId,
				arguments: {
					thread_id: args.thread_id,
					page_token: args?.page_token,
					user_id: args?.user_id,
				},
			});
			results.push({ toolCallId, result });
		} catch (err: any) {
			results.push({
				toolCallId,
				result: { error: 'Gmail fetch message by thread ID failed', details: err?.message || String(err) }
			});
		}
	}

	return res.json({ results });
});

app.post('/tools/gmail/send-email/webhook', async (req: Request, res: Response) => {
	const message = req.body?.message ?? req.body;
	const maybeLists = [
		message?.toolCallList,
		message?.toolCalls,
		message?.toolWithToolCallList
	].filter((x: unknown) => Array.isArray(x)) as any[][];

	if (maybeLists.length === 0) {
		return res.status(400).json({ error: 'Invalid Vapi tool call payload: no tool call list' });
	}

	const toolCalls = maybeLists[0];
	const results: Array<{ toolCallId: string; result: unknown }> = [];

	for (const toolCall of toolCalls) {
		const toolCallId = (toolCall?.id || toolCall?.toolCallId) as string | undefined;
		const name: string | undefined = (toolCall?.name || toolCall?.function?.name) as string | undefined;

		let args: any = toolCall?.arguments ?? toolCall?.function?.arguments ?? toolCall?.function?.parameters ?? {};
		if (typeof args === 'string') {
			try {
				args = JSON.parse(args);
			} catch {}
		}

		if (!toolCallId) {
			continue;
		}

		if (name !== 'gmail_send_email') {
			results.push({
				toolCallId,
				result: { error: 'Unknown tool function', name }
			});
			continue;
		}

		const userId = args?.userId || 'default';
		try {
			const result = await composio.tools.execute('GMAIL_SEND_EMAIL', {
				userId,
				arguments: {
					recipient_email: args?.recipient_email,
					subject: args?.subject,
					body: args?.body,
					cc: args?.cc,
					bcc: args?.bcc,
					is_html: args?.is_html,
					user_id: args?.user_id,
				},
			});
			results.push({ toolCallId, result });
		} catch (err: any) {
			results.push({
				toolCallId,
				result: { error: 'Gmail send email failed', details: err?.message || String(err) }
			});
		}
	}

	return res.json({ results });
});

app.post('/tools/gmail/reply-to-thread/webhook', async (req: Request, res: Response) => {
	const message = req.body?.message ?? req.body;
	const maybeLists = [
		message?.toolCallList,
		message?.toolCalls,
		message?.toolWithToolCallList
	].filter((x: unknown) => Array.isArray(x)) as any[][];

	if (maybeLists.length === 0) {
		return res.status(400).json({ error: 'Invalid Vapi tool call payload: no tool call list' });
	}

	const toolCalls = maybeLists[0];
	const results: Array<{ toolCallId: string; result: unknown }> = [];

	for (const toolCall of toolCalls) {
		const toolCallId = (toolCall?.id || toolCall?.toolCallId) as string | undefined;
		const name: string | undefined = (toolCall?.name || toolCall?.function?.name) as string | undefined;

		let args: any = toolCall?.arguments ?? toolCall?.function?.arguments ?? toolCall?.function?.parameters ?? {};
		if (typeof args === 'string') {
			try {
				args = JSON.parse(args);
			} catch {}
		}

		if (!toolCallId) {
			continue;
		}

		if (name !== 'gmail_reply_to_thread') {
			results.push({
				toolCallId,
				result: { error: 'Unknown tool function', name }
			});
			continue;
		}

		const userId = args?.userId || 'default';
		const parsed = GmailReplyToThreadSchema.safeParse({ userId, ...args });
		if (!parsed.success) {
			results.push({
				toolCallId,
				result: { error: 'Invalid arguments', details: parsed.error.flatten() }
			});
			continue;
		}

		try {
			const result = await composio.tools.execute('GMAIL_REPLY_TO_THREAD', {
				userId,
				arguments: {
					thread_id: args.thread_id,
					message_body: args?.message_body,
					recipient_email: args?.recipient_email,
					cc: args?.cc,
					bcc: args?.bcc,
					is_html: args?.is_html,
					extra_recipients: args?.extra_recipients,
					user_id: args?.user_id,
				},
			});
			results.push({ toolCallId, result });
		} catch (err: any) {
			results.push({
				toolCallId,
				result: { error: 'Gmail reply to thread failed', details: err?.message || String(err) }
			});
		}
	}

	return res.json({ results });
});

app.post('/tools/gmail/create-draft/webhook', async (req: Request, res: Response) => {
	const message = req.body?.message ?? req.body;
	const maybeLists = [
		message?.toolCallList,
		message?.toolCalls,
		message?.toolWithToolCallList
	].filter((x: unknown) => Array.isArray(x)) as any[][];

	if (maybeLists.length === 0) {
		return res.status(400).json({ error: 'Invalid Vapi tool call payload: no tool call list' });
	}

	const toolCalls = maybeLists[0];
	const results: Array<{ toolCallId: string; result: unknown }> = [];

	for (const toolCall of toolCalls) {
		const toolCallId = (toolCall?.id || toolCall?.toolCallId) as string | undefined;
		const name: string | undefined = (toolCall?.name || toolCall?.function?.name) as string | undefined;

		let args: any = toolCall?.arguments ?? toolCall?.function?.arguments ?? toolCall?.function?.parameters ?? {};
		if (typeof args === 'string') {
			try {
				args = JSON.parse(args);
			} catch {}
		}

		if (!toolCallId) {
			continue;
		}

		if (name !== 'gmail_create_draft') {
			results.push({
				toolCallId,
				result: { error: 'Unknown tool function', name }
			});
			continue;
		}

		const userId = args?.userId || 'default';
		try {
			const result = await composio.tools.execute('GMAIL_CREATE_EMAIL_DRAFT', {
				userId,
				arguments: {
					recipient_email: args?.recipient_email,
					subject: args?.subject,
					body: args?.body,
					cc: args?.cc,
					bcc: args?.bcc,
					is_html: args?.is_html,
					user_id: args?.user_id,
				},
			});
			results.push({ toolCallId, result });
		} catch (err: any) {
			results.push({
				toolCallId,
				result: { error: 'Gmail create draft failed', details: err?.message || String(err) }
			});
		}
	}

	return res.json({ results });
});

app.post('/tools/gmail/send-draft/webhook', async (req: Request, res: Response) => {
	const message = req.body?.message ?? req.body;
	const maybeLists = [
		message?.toolCallList,
		message?.toolCalls,
		message?.toolWithToolCallList
	].filter((x: unknown) => Array.isArray(x)) as any[][];

	if (maybeLists.length === 0) {
		return res.status(400).json({ error: 'Invalid Vapi tool call payload: no tool call list' });
	}

	const toolCalls = maybeLists[0];
	const results: Array<{ toolCallId: string; result: unknown }> = [];

	for (const toolCall of toolCalls) {
		const toolCallId = (toolCall?.id || toolCall?.toolCallId) as string | undefined;
		const name: string | undefined = (toolCall?.name || toolCall?.function?.name) as string | undefined;

		let args: any = toolCall?.arguments ?? toolCall?.function?.arguments ?? toolCall?.function?.parameters ?? {};
		if (typeof args === 'string') {
			try {
				args = JSON.parse(args);
			} catch {}
		}

		if (!toolCallId) {
			continue;
		}

		if (name !== 'gmail_send_draft') {
			results.push({
				toolCallId,
				result: { error: 'Unknown tool function', name }
			});
			continue;
		}

		const userId = args?.userId || 'default';
		const parsed = GmailSendDraftSchema.safeParse({ userId, ...args });
		if (!parsed.success) {
			results.push({
				toolCallId,
				result: { error: 'Invalid arguments', details: parsed.error.flatten() }
			});
			continue;
		}

		try {
			const result = await composio.tools.execute('GMAIL_SEND_DRAFT', {
				userId,
				arguments: {
					draft_id: args.draft_id,
					user_id: args?.user_id,
				},
			});
			results.push({ toolCallId, result });
		} catch (err: any) {
			results.push({
				toolCallId,
				result: { error: 'Gmail send draft failed', details: err?.message || String(err) }
			});
		}
	}

	return res.json({ results });
});

app.post('/tools/gmail/list-drafts/webhook', async (req: Request, res: Response) => {
	const message = req.body?.message ?? req.body;
	const maybeLists = [
		message?.toolCallList,
		message?.toolCalls,
		message?.toolWithToolCallList
	].filter((x: unknown) => Array.isArray(x)) as any[][];

	if (maybeLists.length === 0) {
		return res.status(400).json({ error: 'Invalid Vapi tool call payload: no tool call list' });
	}

	const toolCalls = maybeLists[0];
	const results: Array<{ toolCallId: string; result: unknown }> = [];

	for (const toolCall of toolCalls) {
		const toolCallId = (toolCall?.id || toolCall?.toolCallId) as string | undefined;
		const name: string | undefined = (toolCall?.name || toolCall?.function?.name) as string | undefined;

		let args: any = toolCall?.arguments ?? toolCall?.function?.arguments ?? toolCall?.function?.parameters ?? {};
		if (typeof args === 'string') {
			try {
				args = JSON.parse(args);
			} catch {}
		}

		if (!toolCallId) {
			continue;
		}

		if (name !== 'gmail_list_drafts') {
			results.push({
				toolCallId,
				result: { error: 'Unknown tool function', name }
			});
			continue;
		}

		const userId = args?.userId || 'default';
		try {
			const result = await composio.tools.execute('GMAIL_LIST_DRAFTS', {
				userId,
				arguments: {
					max_results: args?.max_results,
					verbose: args?.verbose,
					page_token: args?.page_token,
					user_id: args?.user_id,
				},
			});
			results.push({ toolCallId, result });
		} catch (err: any) {
			results.push({
				toolCallId,
				result: { error: 'Gmail list drafts failed', details: err?.message || String(err) }
			});
		}
	}

	return res.json({ results });
});

// =============================================================================
// PERSONALIZATION WEBHOOK
// =============================================================================
// Handles dynamic assistant personalization based on caller's phone number
// Configure in VAPI phone number settings as the server URL

// Load assistant tools prompt from external file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const toolPrompt = readFileSync(
	join(__dirname, 'prompts', 'assistant-tools.txt'),
	'utf-8'
);

let vapi: VapiClient | null = null;
let supabase: any = null;

// Initialize personalization clients if env vars are present
if (CONFIG.VAPI_API_KEY && CONFIG.VAPI_ASSISTANT_ID && CONFIG.SUPABASE_URL && CONFIG.SUPABASE_KEY) {
	vapi = new VapiClient({ token: CONFIG.VAPI_API_KEY });
	supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
	console.log('✓ Personalization webhook enabled');
} else {
	console.log('⚠ Personalization webhook disabled (missing env vars)');
}

app.post('/personalization/webhook', async (req: Request, res: Response) => {
	if (!vapi || !supabase || !CONFIG.VAPI_ASSISTANT_ID) {
		return res.status(503).json({ 
			error: 'Personalization webhook not configured',
			details: 'Missing required environment variables: VAPI_PRIVATE_API_KEY, ASSISTANT_ID, SUPABASE_URL, SUPABASE_KEY'
		});
	}

	// console.log('[Personalization] Request received');

	try {
		const message = req.body.message;
		const messageType = message?.type;

		// Only handle assistant-request messages (from assistantless phone numbers)
		if (messageType !== 'assistant-request') {
			return res.status(200).json({ received: true });
		}

		console.log('[Personalization] Processing assistant-request message');

		// Extract call information from assistant-request
		const call = message.call;
		if (!call) {
			console.error('[Personalization] No call information in assistant-request');
			return res.status(400).json({ error: 'No call information found' });
		}

		// Get caller's phone number
		const callerNumber = call.customer?.number || call.from || call.customer?.phoneNumber;
		
		if (!callerNumber) {
			console.error('[Personalization] No caller number found in call');
			return res.status(400).json({ error: 'Caller number not found' });
		}

		console.log(`[Personalization] Processing call from: ${callerNumber}`);
		console.log(`[Personalization] Call ID: ${call.id}`);

		const callerNumberRaw = callerNumber.slice(-10);

		// Query Supabase to get custom prompt based on caller's phone number
		const { data, error: supabaseError } = await supabase
			.from('HPSecretaryData')
			.select('user_name, personalization_prompt, voice_provider, voice_name, composio_id')
			.eq('phone_number', callerNumberRaw) 
			.single();

		if (supabaseError) {
			console.error('[Personalization] Error querying Supabase:', supabaseError);
			return res.status(500).json({ error: 'Failed to retrieve custom prompt from database' });
		}

		if (!data) {
			console.error('[Personalization] No data returned from Supabase for phone number:', callerNumber);
			return res.status(404).json({ error: 'No custom prompt found for this phone number' });
		}

		let personalizationPrompt = data!.personalization_prompt;
		if (!personalizationPrompt) {
			console.log('[Personalization] No personalization prompt found for phone number:', callerNumber);
			personalizationPrompt = '';
		}
		
		console.log(`[Personalization] Retrieved custom prompt: ${personalizationPrompt}`);

		const now = new Date();
		const modelPrompt = ''
			+ 'You are receiving this call on '
			+ now.toLocaleString('en-US', { timeZoneName: 'short' })
			+ ' You are a personal assistant to ' + data!.user_name + '. ' 
			+ personalizationPrompt
			+ toolPrompt
			+ '\n\nBelow is this users secrets for your tools\n'
			+ 'Composio ID: ' + data!.composio_id;

		// First, get the current assistant to preserve existing model configuration
		const currentAssistant = await vapi.assistants.get(CONFIG.VAPI_ASSISTANT_ID!);
		
		if (!currentAssistant.model) {
			console.error('[Personalization] Assistant does not have a model configuration');
			return res.status(500).json({ error: 'Assistant model configuration not found' });
		}
		
		// Prepare voice configuration (from Supabase or use defaults from environment)
		const voiceProvider = data!.voice_provider || CONFIG.DEFAULT_VOICE_PROVIDER;
		const voiceId = data!.voice_name || CONFIG.DEFAULT_VOICE_ID;
		
		console.log(`[Personalization] Using voice: ${voiceProvider} - ${voiceId}`);
		
		// Update the assistant with the custom prompt and voice
		await vapi.assistants.update(CONFIG.VAPI_ASSISTANT_ID!, {
			model: {
				...currentAssistant.model,
				messages: [
					{
						role: 'system',
						content: modelPrompt
					}
				]
			} as any,
			voice: {
				provider: voiceProvider,
				voiceId: voiceId,
				speed: 1.5,
			},
			firstMessage: '', // Empty for silent transfers
			firstMessageMode: 'assistant-speaks-first-with-model-generated-message', // Silent transfer mode
			backgroundSound: "off",
		});

		console.log(`[Personalization] Successfully updated assistant ${CONFIG.VAPI_ASSISTANT_ID!} with custom prompt`);

		// For silent transfer, respond to assistant-request with the assistant ID
		res.status(200).json({
			assistantId: CONFIG.VAPI_ASSISTANT_ID!
		});

		console.log(`[Personalization] Silent transfer initiated - call ${call.id} will continue with assistant ${CONFIG.VAPI_ASSISTANT_ID!}`);

	} catch (error: any) {
		console.error('[Personalization] Error updating assistant:', error);
		res.status(500).json({ 
			error: 'Failed to update assistant',
			details: error.message 
		});
	}
});

// =============================================================================
// OUTBOUND CALL ENDPOINTS
// =============================================================================

// Outbound: direct start endpoint
// POST /tools/outbound/start
// Body: { customerNumber: string, instructions: string, schedulePlan?: { earliestAt: string, latestAt?: string } }
app.post('/tools/outbound/start', async (req: Request, res: Response) => {
	const parsed = OutboundCallRequestSchema.safeParse(req.body);
	if (!parsed.success) {
		return res.status(400).json({ error: parsed.error.flatten() });
	}
	const { customerNumber, instructions, schedulePlan } = parsed.data;
	try {
		if (CONFIG.VAPI_FORCE_PHONE_PATCH) {
			try {
				await patchSecondPhoneNumberDestination(customerNumber);
			} catch (e: any) {
				console.warn('Phone number PATCH failed (continuing):', e?.message || String(e));
			}
		}
		const data = await createOutboundCall(customerNumber, instructions, schedulePlan);
		return res.json(data);
	} catch (err: any) {
		return res.status(500).json({ error: 'Outbound call failed', details: err?.message || String(err) });
	}
});

// Outbound: Vapi custom tool webhook
// Configure in Vapi Dashboard:
// - Tool type: function
// - Function name: make_outbound_call
// - Parameters: { customerNumber: string, instructions: string }
// - Server URL: https://<your-public-host>/tools/outbound/webhook
app.post('/tools/outbound/webhook', async (req: Request, res: Response) => {
	const message = req.body?.message ?? req.body;
	const maybeLists = [
		message?.toolCallList,
		message?.toolCalls,
		message?.toolWithToolCallList
	].filter((x: unknown) => Array.isArray(x)) as any[][];

	if (maybeLists.length === 0) {
		return res.status(400).json({ error: 'Invalid Vapi tool call payload: no tool call list' });
	}

	const toolCalls = maybeLists[0];
	const results: Array<{ toolCallId: string; result: unknown }> = [];

	for (const toolCall of toolCalls) {
		const toolCallId = (toolCall?.id || toolCall?.toolCallId) as string | undefined;
		const name: string | undefined = (toolCall?.name || toolCall?.function?.name) as string | undefined;

		let args: any = toolCall?.arguments ?? toolCall?.function?.arguments ?? toolCall?.function?.parameters ?? {};
		if (typeof args === 'string') {
			try {
				args = JSON.parse(args);
			} catch {}
		}

		if (!toolCallId) {
			continue;
		}
		if (name !== 'make_outbound_call') {
			results.push({ toolCallId, result: { error: 'Unknown tool function', name } });
			continue;
		}

		const parsed = OutboundCallRequestSchema.safeParse({
			customerNumber: args?.customerNumber,
			instructions: args?.instructions,
			schedulePlan: args?.schedulePlan
		});
		if (!parsed.success) {
			results.push({ toolCallId, result: { error: 'Invalid arguments', details: parsed.error.flatten() } });
			continue;
		}

		const { customerNumber, instructions, schedulePlan } = parsed.data;
		try {
			if (CONFIG.VAPI_FORCE_PHONE_PATCH) {
				try {
					await patchSecondPhoneNumberDestination(customerNumber);
				} catch (e: any) {
					console.warn('Phone number PATCH failed (continuing):', e?.message || String(e));
				}
			}
			const data = await createOutboundCall(customerNumber, instructions, schedulePlan);
			results.push({ toolCallId, result: data });
		} catch (err: any) {
			results.push({ toolCallId, result: { error: 'Outbound call failed', details: err?.message || String(err) } });
		}
	}

	return res.json({ results });
});


// =============================================================================
// AUTO-SETUP ALL TOOLS
// =============================================================================
// Automatically create and attach all tools to the assistant on startup
void (async () => {
	try {
		const vapiKey = CONFIG.VAPI_API_KEY;
		const assistantId = CONFIG.VAPI_ASSISTANT_ID;
		const publicBaseUrl = CONFIG.PUBLIC_BASE_URL;
		
		if (!vapiKey || !assistantId || !publicBaseUrl) {
			console.log('⚠ Tool auto-setup skipped: missing VAPI_API_KEY, VAPI_ASSISTANT_ID, or PUBLIC_BASE_URL');
			return;
		}

		console.log('🔧 Starting auto-setup for all VAPI tools...');

		const headers = {
			'Authorization': `Bearer ${vapiKey}`,
			'Content-Type': 'application/json'
		};

		// Define all tools
		const tools = [
			{
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
				},
				serverUrl: `${publicBaseUrl.replace(/\/+$/, '')}/tools/exa/webhook`
			},
			{
				name: 'exa_get_contents',
				description: 'Retrieve full web page contents from one or more URLs.',
				parameters: {
					type: 'object',
					properties: {
						urls: { 
							type: 'array', 
							items: { type: 'string' },
							description: 'Array of URLs to fetch content from' 
						},
						getText: { type: 'boolean', description: 'Whether to include text content (default: true)' },
						getHighlights: { type: 'boolean', description: 'Whether to include highlights (default: false)' }
					},
					required: ['urls']
				},
				serverUrl: `${publicBaseUrl.replace(/\/+$/, '')}/tools/exa/contents/webhook`
			},
			{
				name: 'make_outbound_call',
				description: 'Place an outbound call to a phone number with custom instructions. Can be scheduled for later or immediate.',
				parameters: {
					type: 'object',
					properties: {
						customerNumber: { type: 'string', description: 'Phone number to call (E.164 format, e.g., +1234567890)' },
						instructions: { type: 'string', description: 'Detailed instructions for the AI agent making the call' },
						schedulePlan: {
							type: 'object',
							description: 'Optional: Schedule the call for later',
							properties: {
								earliestAt: { type: 'string', description: 'ISO 8601 timestamp for earliest call time' },
								latestAt: { type: 'string', description: 'ISO 8601 timestamp for latest call time (optional)' }
							}
						}
					},
					required: ['customerNumber', 'instructions']
				},
				serverUrl: `${publicBaseUrl.replace(/\/+$/, '')}/tools/outbound/webhook`
			},
			{
				name: 'get_call_status',
				description: 'Get the current status of an outbound call by call ID.',
				parameters: {
					type: 'object',
					properties: {
						callId: { type: 'string', description: 'The call ID to check status for' }
					},
					required: ['callId']
				},
				serverUrl: `${publicBaseUrl.replace(/\/+$/, '')}/tools/call/status/webhook`
			},
			{
				name: 'get_call_messages',
				description: 'Retrieve the conversation messages/transcript from a completed call.',
				parameters: {
					type: 'object',
					properties: {
						callId: { type: 'string', description: 'The call ID to get messages for' }
					},
					required: ['callId']
				},
				serverUrl: `${publicBaseUrl.replace(/\/+$/, '')}/tools/call/messages/webhook`
			}
		];

		// Get or create each tool
		const toolIds: string[] = [];
		for (const toolDef of tools) {
			let toolId: string | undefined;

			// Try to find existing tool by name
			try {
				const listRes = await fetch('https://api.vapi.ai/tool', { headers });
				if (listRes.ok) {
					const existingTools = await listRes.json();
					if (Array.isArray(existingTools)) {
						const existing = existingTools.find((t: any) => t?.function?.name === toolDef.name);
						if (existing?.id) {
							toolId = existing.id;
							console.log(`  ✓ Found existing tool: ${toolDef.name} (${toolId})`);
						}
					}
				}
			} catch (e) {
				console.warn(`  ⚠ Error finding tool ${toolDef.name}:`, e);
			}

			// Create tool if not found
			if (!toolId) {
				try {
					const createRes = await fetch('https://api.vapi.ai/tool', {
						method: 'POST',
						headers,
						body: JSON.stringify({
							type: 'function',
							function: {
								name: toolDef.name,
								description: toolDef.description,
								parameters: toolDef.parameters
							},
							server: { url: toolDef.serverUrl }
						})
					});

					if (createRes.ok) {
						const created = await createRes.json();
						toolId = created?.id;
						console.log(`  ✓ Created new tool: ${toolDef.name} (${toolId})`);
					} else {
						const text = await createRes.text();
						console.warn(`  ✗ Failed to create tool ${toolDef.name}:`, text);
					}
				} catch (e) {
					console.warn(`  ✗ Error creating tool ${toolDef.name}:`, e);
				}
			}

			if (toolId) {
				toolIds.push(toolId);
			}
		}

		if (toolIds.length === 0) {
			console.warn('⚠ No tools were created or found');
			return;
		}

		// Get current assistant
		const getAsstRes = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, { headers });
		if (!getAsstRes.ok) {
			const text = await getAsstRes.text();
			console.warn('✗ Failed to fetch assistant:', text);
			return;
		}

		const assistant = await getAsstRes.json();
		const modelObj = assistant?.model ?? {};
		const currentToolIds: string[] = Array.isArray(modelObj?.toolIds) ? modelObj.toolIds : [];

		// Merge tool IDs (avoid duplicates)
		const allToolIds = [...new Set([...currentToolIds, ...toolIds])];
		const newToolsCount = allToolIds.length - currentToolIds.length;

		if (newToolsCount === 0) {
			console.log('✓ All tools already attached to assistant');
			return;
		}

		// Update assistant with all tools
		const patchRes = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
			method: 'PATCH',
			headers,
			body: JSON.stringify({
				model: { ...modelObj, toolIds: allToolIds }
			})
		});

		if (patchRes.ok) {
			console.log(`✓ Successfully attached ${newToolsCount} new tool(s) to assistant`);
			console.log(`  Total tools on assistant: ${allToolIds.length}`);
		} else {
			const text = await patchRes.text();
			console.warn('✗ Failed to attach tools to assistant:', text);
		}

	} catch (e: any) {
		console.warn('✗ Tool auto-setup error:', e?.message || String(e));
	}
})();

app.listen(CONFIG.PORT, () => {
	console.log(`Server listening on http://localhost:${CONFIG.PORT}`);
	console.log('Exa tool endpoint (direct): POST /tools/exa/search');
	console.log('Vapi tool webhook (exa_search): POST /tools/exa/webhook');
	console.log('Exa contents endpoint (direct): POST /tools/exa/contents');
	console.log('Vapi tool webhook (exa_get_contents): POST /tools/exa/contents/webhook');
	console.log('Outbound tool endpoint (direct): POST /tools/outbound/start');
	console.log('Vapi tool webhook (make_outbound_call): POST /tools/outbound/webhook');
	console.log('Call status endpoint (direct): GET /tools/call/status/:callId');
	console.log('Vapi tool webhook (get_call_status): POST /tools/call/status/webhook');
	console.log('Call messages endpoint (direct): GET /tools/call/messages/:callId');
	console.log('Vapi tool webhook (get_call_messages): POST /tools/call/messages/webhook');
	console.log('\nGmail webhooks:');
	console.log('Vapi tool webhook (gmail_fetch_emails): POST /tools/gmail/fetch-emails/webhook');
	console.log('Vapi tool webhook (gmail_list_threads): POST /tools/gmail/list-threads/webhook');
	console.log('Vapi tool webhook (gmail_fetch_message_by_id): POST /tools/gmail/fetch-message-by-id/webhook');
	console.log('Vapi tool webhook (gmail_fetch_message_by_thread): POST /tools/gmail/fetch-message-by-thread/webhook');
	console.log('Vapi tool webhook (gmail_send_email): POST /tools/gmail/send-email/webhook');
	console.log('Vapi tool webhook (gmail_reply_to_thread): POST /tools/gmail/reply-to-thread/webhook');
	console.log('Vapi tool webhook (gmail_create_draft): POST /tools/gmail/create-draft/webhook');
	console.log('Vapi tool webhook (gmail_send_draft): POST /tools/gmail/send-draft/webhook');
	console.log('Vapi tool webhook (gmail_list_drafts): POST /tools/gmail/list-drafts/webhook');
	console.log('\nPersonalization webhook:');
	console.log('Personalization webhook: POST /personalization/webhook');
});
