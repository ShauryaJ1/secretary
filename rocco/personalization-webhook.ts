import 'dotenv/config';
import express from 'express';
import { VapiClient } from '@vapi-ai/server-sdk';
import { createClient } from '@supabase/supabase-js';

const VAPI_PRIVATE_API_KEY = process.env.VAPI_PRIVATE_API_KEY;
const ASSISTANT_ID = process.env.ASSISTANT_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!VAPI_PRIVATE_API_KEY
    || !ASSISTANT_ID
    || !SUPABASE_URL
    || !SUPABASE_KEY
) {
    console.log("Missing environment variables. Ending process...");
    process.exit(1)
}

const app = express();
app.use(express.json());

const vapi = new VapiClient({ token: VAPI_PRIVATE_API_KEY });
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

app.post('/webhook', async (req, res) => {

    try {
        const message = req.body.message;
        const messageType = message?.type;

        // Only handle assistant-request messages (from assistantless phone numbers)
        if (messageType !== "assistant-request") {
            return res.status(200).json({ received: true });
        }

        console.log("Processing assistant-request message");

        // Extract call information from assistant-request
        const call = message.call;
        if (!call) {
            console.error("No call information in assistant-request");
            return res.status(400).json({ error: "No call information found" });
        }

        // Get caller's phone number
        const callerNumber = call.customer?.number || call.from || call.customer?.phoneNumber;
        
        if (!callerNumber) {
            console.error("No caller number found in call");
            return res.status(400).json({ error: "Caller number not found" });
        }

        console.log(`Processing call from: ${callerNumber}`);
        console.log(`Call ID: ${call.id}`);

        const callerNumberRaw = callerNumber.slice(-10)

        // Query Supabase to get custom prompt based on caller's phone number
        // Adjust the table name and column names based on your Supabase schema
        // const {data, error: supabaseError } = await supabase.from('HPSecretaryData').select('*')

        const { data, error: supabaseError } = await supabase
            .from('HPSecretaryData')
            .select('personalization_prompt, voice_provider, voice_name')
            .eq('phone_number', callerNumberRaw) 
            .single();

        if (supabaseError) {
            console.error("Error querying Supabase:", supabaseError);
            return res.status(500).json({ error: "Failed to retrieve custom prompt from database" });
        }

        if (!data) {
            console.error("No data returned from Supabase for phone number:", callerNumber);
            return res.status(404).json({ error: "No custom prompt found for this phone number" });
        }

        // // TypeScript control flow doesn't narrow properly, so we assert after null check
        let customPrompt = data!.personalization_prompt;
        if (!customPrompt) {
            console.error("No custom_prompt field in data for phone number:", callerNumber);
            return res.status(404).json({ error: "No custom prompt found for this phone number" });
        }
        
        console.log(`Retrieved custom prompt: ${customPrompt}`);

        const now = new Date();
        customPrompt += "You are receiving this call on" 
            + now.toLocaleString("en-US", { timeZoneName: "short" })

        // First, get the current assistant to preserve existing model configuration
        const currentAssistant = await vapi.assistants.get(ASSISTANT_ID);
        
        if (!currentAssistant.model) {
            console.error("Assistant does not have a model configuration");
            return res.status(500).json({ error: "Assistant model configuration not found" });
        }
        
        // Prepare voice configuration (from Supabase or use defaults from environment)
        const voiceProvider = data!.voice_provider || process.env.DEFAULT_VOICE_PROVIDER || '11labs';
        const voiceId = data!.voice_name || process.env.DEFAULT_VOICE_ID || 'cgSgspJ2msm6clMCkdW9';
        
        console.log(`Using voice: ${voiceProvider} - ${voiceId}`);
        
        // Update the assistant with the custom prompt and voice
        // Preserve the existing model provider and model type, only update messages
        // Also configure for silent transfers: empty firstMessage and model-generated first message
        await vapi.assistants.update(ASSISTANT_ID, {
            model: {
                ...currentAssistant.model,
                messages: [
                    {
                        role: 'system',
                        content: customPrompt
                    }
                ]
            } as any, // Type assertion needed because API accepts partial model updates
            voice: {
                provider: voiceProvider,
                voiceId: voiceId
            },
            firstMessage: "", // Empty for silent transfers
            firstMessageMode: "assistant-speaks-first-with-model-generated-message" // Silent transfer mode
        });

        console.log(`Successfully updated assistant ${ASSISTANT_ID} with custom prompt`);

        // For silent transfer, respond to assistant-request with the assistant ID
        // This continues the same call seamlessly with the updated assistant
        // The call will continue without the caller hearing any transfer announcements
        res.status(200).json({
            assistantId: ASSISTANT_ID
        });

        console.log(`Silent transfer initiated - call ${call.id} will continue with assistant ${ASSISTANT_ID}`);

    } catch (error: any) {
        console.error("Error updating assistant:", error);
        res.status(500).json({ 
            error: "Failed to update assistant",
            details: error.message 
        });
    }
});

const PORT = process.env.PERSONALIZATION_WEBHOOK_PORT || 3000;
app.listen(PORT, () => {
  console.log(`Personalization webhook server running on port ${PORT}`);
});

