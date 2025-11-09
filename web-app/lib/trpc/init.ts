import { initTRPC } from '@trpc/server';
import superjson from 'superjson';
import { createClient } from '@supabase/supabase-js';
import { Composio } from '@composio/core';
import { VercelProvider } from '@composio/vercel';
import { xai } from '@ai-sdk/xai';

// Create context for tRPC
export const createTRPCContext = async () => {
  // Initialize Supabase client
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_KEY!
  );

  // Initialize Composio client with Vercel AI SDK Provider
  const composio = new Composio({
    apiKey: process.env.COMPOSIO_API_KEY!,
    provider: new VercelProvider(),
    toolkitVersions: {
      gmail: '20251027_00',  // Use latest for development
    },
  });

  // AI SDK model - xAI Grok-4
  const model = xai('grok-4');

  return {
    supabase,
    composio,
    model,
  };
};

// Initialize tRPC
const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

