import { z } from 'zod';
import { router, publicProcedure } from '../init';
import { generateText } from 'ai';

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

  // Direct tool execution - Send email without AI agent
  sendEmailDirect: publicProcedure
    .input(
      z.object({
        userId: z.string(),
        recipientEmail: z.string().email(),
        subject: z.string(),
        body: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        console.log('[Composio] Executing GMAIL_SEND_EMAIL directly for user:', input.userId);
        
        const result = await ctx.composio.tools.execute(
          'GMAIL_SEND_EMAIL',
          {
            userId: input.userId,
            arguments: {
              recipient_email: input.recipientEmail,
              subject: input.subject,
              body: input.body,
            },
          },
          {
            beforeExecute: ({ toolSlug, toolkitSlug, params }) => {
              console.log(`Executing ${toolSlug} from ${toolkitSlug}`);
              console.log('Parameters:', params);
              return params;
            },
            afterExecute: ({ toolSlug, toolkitSlug, result }) => {
              console.log(`Completed ${toolSlug}`);
              console.log('Result:', result);
              return result;
            },
          }
        );

        return {
          success: true,
          result,
        };
      } catch (error: any) {
        console.error('[Send Email Direct Error]:', error);
        throw new Error(`Failed to send email: ${error.message}`);
      }
    }),

  // Fetch recent emails using AI SDK
  fetchEmails: publicProcedure
    .input(
      z.object({
        userId: z.string(),
        prompt: z.string().optional(), // Optional custom prompt
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // Get specific Gmail tools for this user - limited to most useful subset
        const tools = await ctx.composio.tools.get(input.userId, {
          tools: [
            'GMAIL_FETCH_EMAILS',
            'GMAIL_LIST_THREADS',
            'GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID',
            'GMAIL_FETCH_MESSAGE_BY_THREAD_ID',
            'GMAIL_SEND_EMAIL',
            'GMAIL_REPLY_TO_THREAD',
            'GMAIL_CREATE_EMAIL_DRAFT',
            'GMAIL_SEND_DRAFT',
            'GMAIL_LIST_DRAFTS',
          ],
        });
        
        console.log('[Composio] Tools type:', typeof tools);
        console.log('[Composio] Tools keys:', Object.keys(tools || {}));
        console.log('[Composio] Got tools for user:', input.userId);

        // Use custom prompt or default one
        const promptContent = input.prompt || 'Use GMAIL_FETCH_EMAILS to get my 5 most recent emails about travel like Amtrak or United Airlines with full details including subject, sender, and body.';
        
        // System prompt with available Gmail tools
        const systemPrompt = `You are a helpful Gmail assistant with access to 9 specialized tools:

**📧 READING EMAILS & THREADS:**

1. GMAIL_FETCH_EMAILS
   • Purpose: Fetch a list of email messages with filtering, pagination, and optional full content retrieval
   • Parameters (ALL OPTIONAL):
     - query (string): Gmail search syntax for filtering emails
     - max_results (integer, default: 1): Number of emails to retrieve
     - verbose (boolean, default: True): Get full email details (subject, body, sender, timestamp)
     - include_payload (boolean, default: True): Include email payload/content
     - ids_only (boolean): Return only email IDs without content
     - include_spam_trash (boolean): Include emails from spam and trash
     - label_ids (array of strings): Filter by specific label IDs
     - page_token (string): For pagination
     - user_id (string, default: "me"): User identifier
   • Search syntax: "from:email@example.com", "subject:keyword", "is:unread", "after:2024/01/01"
   • Returns: List of email messages with full details when verbose=true
   • TIP: Always use verbose=true and set max_results to get multiple emails

2. GMAIL_LIST_THREADS
   • Purpose: Retrieve email threads (conversations) with filtering and pagination
   • Parameters:
     - query (string, OPTIONAL): Gmail search syntax for filtering threads
     - max_results (integer, OPTIONAL, default: 10): Number of threads to retrieve
     - verbose (boolean, OPTIONAL): Set to true for complete thread details including messages
     - page_token (string, OPTIONAL): For pagination to get next page of results
     - user_id (string, OPTIONAL, default: "me"): User identifier
   • Search syntax examples: "from:email@example.com", "subject:keyword", "is:unread", "after:2024/01/01"
   • Returns: List of threads with IDs, snippet, and if verbose=true, full message details
   • TIP: Always use verbose=true to get complete thread information with all messages

3. GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID
   • Purpose: Fetch a specific email message by its message ID
   • Parameters:
     - message_id (string, REQUIRED): The ID of the message to retrieve
     - format (string, OPTIONAL, default: "full"): Message format (full, metadata, minimal, raw)
     - user_id (string, OPTIONAL, default: "me"): User identifier
   • Returns: Full email including subject, body, sender, recipients, headers, attachments, labels, timestamp
   • Use this after getting message IDs from GMAIL_FETCH_EMAILS or GMAIL_LIST_THREADS

4. GMAIL_FETCH_MESSAGE_BY_THREAD_ID
   • Purpose: Retrieve all messages from a Gmail thread using its thread ID
   • Parameters:
     - thread_id (string, REQUIRED): The ID of the thread to retrieve messages from
     - page_token (string, OPTIONAL): For pagination
     - user_id (string, OPTIONAL, default: "me"): User identifier
   • Returns: All messages in the thread with complete details
   • Use this to get full conversation history for a thread

**✉️ SENDING EMAILS:**

5. GMAIL_SEND_EMAIL
   • Purpose: Send a new email immediately
   • Parameters:
     - recipient_email (string, REQUIRED*): Primary recipient email address
     - subject (string, REQUIRED*): Email subject line
     - body (string, REQUIRED*): Email body content
     - cc (array of strings, OPTIONAL): Carbon copy recipients
     - bcc (array of strings, OPTIONAL): Blind carbon copy recipients
     - is_html (boolean, OPTIONAL): Set to true if body contains HTML formatting
     - attachment (object, OPTIONAL): File attachment with s3key, mimetype, name
     - user_id (string, OPTIONAL, default: "me"): User identifier
   • *REQUIRED: At least ONE of (recipient_email, cc, or bcc) AND at least ONE of (subject or body)
   • TIP: Use is_html=true for formatted emails

6. GMAIL_REPLY_TO_THREAD
   • Purpose: Reply to an existing email thread, maintaining conversation context
   • Parameters:
     - thread_id (string, REQUIRED): The thread ID to reply to
     - message_body (string, OPTIONAL): The reply message content
     - recipient_email (string, REQUIRED*): Reply recipient
     - cc (array of strings, OPTIONAL): Carbon copy recipients
     - bcc (array of strings, OPTIONAL): Blind carbon copy recipients
     - is_html (boolean, OPTIONAL): Set to true for HTML formatted replies
     - attachment (object, OPTIONAL): File attachment
     - extra_recipients (array, OPTIONAL): Additional recipients
     - user_id (string, OPTIONAL, default: "me"): User identifier
   • *REQUIRED: At least ONE of (recipient_email, cc, or bcc)
   • Automatically uses the original thread's subject line with "Re:" prefix
   • TIP: Get thread_id from GMAIL_LIST_THREADS first

**📝 DRAFT MANAGEMENT:**

7. GMAIL_CREATE_EMAIL_DRAFT
   • Purpose: Create a draft email to send later
   • Parameters (ALL OPTIONAL):
     - recipient_email (string): Draft recipient
     - subject (string): Draft subject
     - body (string): Draft body content
     - cc (array of strings): Carbon copy recipients
     - bcc (array of strings): Blind carbon copy recipients
     - is_html (boolean): True for HTML formatted drafts
     - attachment (object): File attachment
     - user_id (string, default: "me"): User identifier
   • Perfect for preparing emails before sending
   • Returns: draft_id that can be used with GMAIL_SEND_DRAFT

8. GMAIL_SEND_DRAFT
   • Purpose: Send a previously created draft email
   • Parameters:
     - draft_id (string, REQUIRED): The ID of the draft to send
     - user_id (string, OPTIONAL, default: "me"): User identifier
   • Use after creating a draft with GMAIL_CREATE_EMAIL_DRAFT or finding one with GMAIL_LIST_DRAFTS

9. GMAIL_LIST_DRAFTS
   • Purpose: Retrieve a paginated list of email drafts
   • Parameters (ALL OPTIONAL):
     - max_results (integer, default: 1): Number of drafts to retrieve
     - verbose (boolean): Set to true for full draft details (subject, body, sender, timestamp)
     - page_token (string): For pagination
     - user_id (string, default: "me"): User identifier
   • TIP: Use verbose=true to see complete draft content before sending

**CRITICAL WORKFLOW INSTRUCTIONS:**
• YOU HAVE FULL ACCESS TO THE USER'S GMAIL ACCOUNT
• Use verbose=true and appropriate max_results when fetching emails/threads/drafts
• For reading emails: Use GMAIL_FETCH_EMAILS with query and max_results to get multiple emails
• For replying to emails: First use GMAIL_LIST_THREADS or GMAIL_FETCH_EMAILS with query to find the thread, then GMAIL_REPLY_TO_THREAD with thread_id
• For multi-step tasks: Retrieve data first with fetch/list tools, then take action with send/reply/draft tools
• Gmail search syntax: "from:email", "subject:keyword", "is:unread", "after:YYYY/MM/DD"
• MINIMIZE ASKING USER FOR INFO - Try your tools first and use available data!
• Continue using tools in sequence until the task is fully complete
• Always provide clear summaries of actions taken

Now complete the user's Gmail task!`;

        console.log('[AI SDK] Prompt content:', promptContent);
        
        // Use AI SDK with Composio tools (Vercel provider handles execution automatically)
        // AI SDK automatically handles multi-step tool calling until task completion
        const result = await generateText({
          model: ctx.model,
          tools: tools,
          system: systemPrompt,
          messages: [
            {
              role: 'user',
              content: promptContent,
            },
          ],
          maxOutputTokens: 50000,
        });

        console.log('[AI SDK] Assistant message:', result.text);
        console.log('[AI SDK] Total steps taken:', result.steps.length);
        
        // Log tool calls and results from each step's content array
        result.steps.forEach((step: any, stepIndex: number) => {
          console.log(`\n========== STEP ${stepIndex + 1} ==========`);
          console.log(`Step content array:`, JSON.stringify(step.content, null, 2));
          console.log(`Finish reason:`, step.finishReason);
          
          // Extract tool calls and results from content array
          const toolCallParts = (step.content || []).filter((part: any) => part.type === 'tool-call');
          const toolResultParts = (step.content || []).filter((part: any) => part.type === 'tool-result');
          
          // Log tool calls
          toolCallParts.forEach((toolCall: any, callIndex: number) => {
            console.log(`\n[Tool Call ${stepIndex + 1}.${callIndex + 1}]`);
            console.log(`  Tool: ${toolCall.toolName}`);
            console.log(`  Tool Call ID: ${toolCall.toolCallId}`);
            console.log(`  Arguments:`, JSON.stringify(toolCall.args, null, 2));
          });
          
          // Log tool results
          toolResultParts.forEach((toolResult: any, resultIndex: number) => {
            console.log(`\n[Tool Result ${stepIndex + 1}.${resultIndex + 1}]`);
            console.log(`  Tool: ${toolResult.toolName}`);
            console.log(`  Tool Call ID: ${toolResult.toolCallId}`);
            const resultString = JSON.stringify(toolResult.result, null, 2);
            console.log(`  Result (truncated):`, resultString ? resultString.substring(0, 500) : 'No result');
          });
        });

        // Extract tool results - AI SDK stores them directly
        const toolResultsData = await result.toolResults;
        const toolResults = toolResultsData.map((toolResult: any) => ({
          output: JSON.stringify(toolResult.result)
        }));

        return {
          success: true,
          emails: toolResults,
          assistantMessage: result.text,
        };
      } catch (error: any) {
        console.error('[Fetch Emails Error]:', error);
        throw new Error(`Failed to fetch emails: ${error.message}`);
      }
    }),
});

