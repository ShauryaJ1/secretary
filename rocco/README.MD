# Vapi Workflow Implementation

This project implements a workflow where an AI assistant can:
1. Receive a call from a user
2. If the user asks to check something with a restaurant/business, the assistant will:
   - Hang up on the user
   - Call the restaurant/business
   - Get the information
   - Call the user back with the results

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set your Vapi API key:
```powershell
$env:VAPI_API_KEY="your-api-key"
```

3. Set your existing assistant ID:
```powershell
$env:ASSISTANT_ID="your-assistant-id"
```

4. Configure your assistant in Vapi dashboard:
   - Add a function called `check_restaurant_availability` with parameters:
     - `restaurantNumber` (string): The phone number to call
     - `query` (string): What to ask the restaurant
   - Set the webhook URL to point to your webhook server

5. Set your webhook URL (for local testing, use ngrok):
```powershell
$env:WEBHOOK_URL="https://your-ngrok-url.ngrok.io/webhook"
```

## Running the Workflow

### Step 1: Start the Webhook Server

The webhook server handles the workflow orchestration:

```bash
npx ts-node webhook-server.ts
```

For local testing, expose it with ngrok:
```bash
ngrok http 3000
```

Then update your webhook URL in the Vapi dashboard to point to your ngrok URL.

### Step 2: Call Your Assistant

Call the phone number associated with your assistant and try asking:
- "Can you check if the restaurant at +15551234567 has availability for 2 people tonight?"

The workflow will:
1. The assistant will detect your request and call the `check_restaurant_availability` function
2. The webhook will end your call
3. The webhook will call the restaurant using your assistant
4. After the restaurant call ends, the webhook will call you back with the results

## How It Works

1. **User calls assistant** (inbound call) → Assistant answers
2. **User requests** → "Check restaurant availability"
3. **Assistant calls function** → `check_restaurant_availability(restaurantNumber, query)`
4. **Webhook receives** → Function call event
5. **Webhook ends call** → Current call is ended
6. **Webhook calls restaurant** → New outbound call to restaurant number using your existing assistant
7. **Restaurant call ends** → Webhook detects completion and extracts transcript
8. **Webhook calls user back** → New outbound call to original customer
9. **Assistant delivers result** → User receives the information from the restaurant

### For Dummy Numbers

If you're using a dummy phone number that just hangs up:
- The webhook will detect the short call duration
- It will still call you back with a message indicating the attempt was made
- You can modify the success logic in `webhook-server.ts` to handle dummy numbers differently

## Configuration

- **Assistant ID**: Set via `ASSISTANT_ID` environment variable or update the default in `webhook-server.ts`
- **Dummy Restaurant Number**: The default is `+15551234567` - you can specify a different number when asking the assistant

## Important Notes

- **Your assistant must have the function `check_restaurant_availability` configured** in the Vapi dashboard
- **The webhook URL must be set** in your assistant's configuration in the Vapi dashboard
- **Works with inbound calls** - when someone calls your assistant's phone number
- **Uses your existing assistant** - no need to create a new one

## Files

- `webhook-server.ts` - Express server that handles webhook events and orchestrates the workflow
- `tsconfig.json` - TypeScript configuration
