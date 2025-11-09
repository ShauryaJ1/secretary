import { z } from 'zod';
import { router, publicProcedure } from '../init';

export const composioRouter = router({
  // Initiate Gmail connection
  initiateConnection: publicProcedure
    .input(
      z.object({
        userId: z.string(), // phone number used as userId
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const authConfigId = process.env.COMPOSIO_AUTH_CONFIG_ID;
        
        console.log('Auth Config ID:', authConfigId);
        console.log('User ID:', input.userId);
        
        if (!authConfigId) {
          throw new Error('COMPOSIO_AUTH_CONFIG_ID environment variable is not set');
        }
        
        // Initiate connection with the existing auth config
        // initiate(userId, authConfigId, options?)
        const connection = await ctx.composio.connectedAccounts.initiate(
          input.userId,
          authConfigId
        );

        return {
          success: true,
          connectionId: connection.id || (connection as any).connectionId,
          redirectUrl: connection.redirectUrl,
        };
      } catch (error: any) {
        throw new Error(`Failed to initiate connection: ${error.message}`);
      }
    }),

  // Check connection status
  checkConnection: publicProcedure
    .input(
      z.object({
        userId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        // List connected accounts for this user (userIds is an array)
        const accounts = await ctx.composio.connectedAccounts.list({
          userIds: [input.userId],
        });

        console.log('Connected accounts:', accounts.items);

        // Find active Gmail connection - check toolkit.slug, not appName
        const gmailAccount = accounts.items?.find(
          (account: any) =>
            account.toolkit?.slug?.toLowerCase() === 'gmail' &&
            account.status === 'ACTIVE'
        );

        if (gmailAccount) {
          console.log('Found Gmail account:', gmailAccount.id, gmailAccount.status);
        } else {
          console.log('No active Gmail account found in accounts list');
        }

        return {
          isConnected: !!gmailAccount,
          connectionId: gmailAccount?.id,
          status: gmailAccount?.status || 'NOT_CONNECTED',
        };
      } catch (error: any) {
        throw new Error(`Failed to check connection: ${error.message}`);
      }
    }),

  // Fetch recent emails using OpenAI provider pattern
  fetchEmails: publicProcedure
    .input(
      z.object({
        userId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // Get Gmail tools for this user
        const tools = await ctx.composio.tools.get(input.userId, {
          toolkits: ['gmail'],
        });

        console.log('[Composio] Got tools for user:', input.userId);

        // Use OpenAI Responses API to fetch emails
        const response = await ctx.openai.responses.create({
          model: 'gpt-5',
          tools: tools,
          input: [
            {
              role: 'user',
              content: 'Fetch my 5 most recent emails with full details including subject, sender, and body.',
            },
          ],
        });

        console.log('[OpenAI] Response output:', response.output);

        // Handle tool calls through Composio provider
        // Signature for Responses API: handleToolCalls(userId, response.output)
        const result = await ctx.composio.provider.handleToolCalls(
          input.userId,      // First param: userId
          response.output    // Second param: response.output (not full response)
        );

        console.log('[Composio] Tool execution result:', result);

        return {
          success: true,
          emails: result,
        };
      } catch (error: any) {
        console.error('[Fetch Emails Error]:', error);
        throw new Error(`Failed to fetch emails: ${error.message}`);
      }
    }),
});

