import { initTRPC } from '@trpc/server';
import superjson from 'superjson';
import { createClient } from '@supabase/supabase-js';
import { Composio } from '@composio/core';
import { OpenAIResponsesProvider } from '@composio/openai';
import { OpenAI } from 'openai';

// Create context for tRPC
export const createTRPCContext = async () => {
  // Initialize Supabase client
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_KEY!
  );

  // Initialize Composio client with OpenAI Responses Provider
  const composio = new Composio({
    apiKey: process.env.COMPOSIO_API_KEY!,
    provider: new OpenAIResponsesProvider(),
    toolkitVersions: {
      gmail: '20251027_00',  // Use latest for development
    },
  });

  // Initialize OpenAI client
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY!,
  });

  return {
    supabase,
    composio,
    openai,
  };
};

// Initialize tRPC
const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

