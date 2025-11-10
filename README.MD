# URSecretary

URSecretary is an AI Voice Assistant that can read and write emails, make phone calls, browse the web, and access your Google Account all to make your workflow that much simpler. It is able to track schedules, so like when a client is coming soon. It is also capable of summarizing and producing emails, all through voice command. If you are too busy to send a message or join a call queue, URSecretary is here to help and do all that for you.

[![Watch the video](https://www.youtube.com/watch?v=xbAlIz7LeWs&t=5s/default.jpg)](https://www.youtube.com/watch?v=xbAlIz7LeWs&t=5s)
## Features

- **Voice Assistant**: Powered by VAPI for natural voice interactions
- **Email Management**: Read, send, reply, and manage Gmail through Composio integration
- **Web Search**: Search the web and fetch content using Exa AI
- **Phone Calls**: Make outbound calls with custom instructions and scheduling
- **Personalization**: Dynamic assistant personalization based on caller phone number
- **Call Management**: Track call status and retrieve call transcripts
- **Google Calendar Integration**: Schedule and manage calendar events

## Tech Stack

- **Backend**: Express server in TypeScript
- **Database**: Supabase (PostgreSQL) for user data storage
- **Voice AI**: VAPI for voice agent capabilities
- **Web Search**: Exa AI for web search and content fetching
- **Email Integration**: Composio for Gmail integration
- **Frontend**: Next.js web application (in `web-app/` directory)

## Setup

### Prerequisites

- Node.js (v18 or higher)
- npm or pnpm
- A Supabase project
- VAPI account and API key
- Exa AI API key
- Composio API key

### Installation

1. Clone the repository:
```bash
git clone https://github.com/shauryaj1/secretary.git
cd HackPrinceton2025
```

2. Install dependencies:
```bash
npm install
# or
pnpm install
```

3. Create a `.env` file in the project root with the following environment variables:

### Environment Variables

#### Required Variables

- `EXA_API_KEY` - Your Exa AI API key (required for web search)
- `VAPI_API_KEY` - Your VAPI API key (required for voice agent operations)
- `VAPI_ASSISTANT_ID` or `ASSISTANT_ID` - Your VAPI assistant ID
- `PUBLIC_BASE_URL` - Your public server URL (e.g., `https://abcd-1234.ngrok-free.app`) for webhooks
- `COMPOSIO_API_KEY` - Your Composio API key (required for Gmail integration)
- `SUPABASE_URL` - Your Supabase project URL (required for personalization)
- `SUPABASE_KEY` - Your Supabase anon/service key (required for personalization)

#### Optional Variables

- `PORT` - Server port (default: `3000`)
- `EXA_API_BASE_URL` - Exa API base URL (default: `https://api.exa.ai`)
- `OUTBOUND_ASSISTANT_ID` - Assistant ID for outbound calls
- `VAPI_FROM_NUMBER_ID` or `SECOND_PHONE_NUMBER_ID` - Phone number ID for outbound calls
- `VAPI_FORCE_PHONE_PATCH` - Force phone number metadata update (default: `false`, set to `true` to enable)
- `DEFAULT_VOICE_PROVIDER` - Default voice provider (default: `11labs`)
- `DEFAULT_VOICE_ID` - Default voice ID (default: `cgSgspJ2msm6clMCkdW9`)

### Example `.env` File

```env
# Required
EXA_API_KEY=your_exa_api_key_here
VAPI_API_KEY=your_vapi_api_key_here
VAPI_ASSISTANT_ID=your_vapi_assistant_id_here
PUBLIC_BASE_URL=https://your-tunnel-url.ngrok-free.app
COMPOSIO_API_KEY=your_composio_api_key_here
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_supabase_key_here

# Optional
PORT=3000
EXA_API_BASE_URL=https://api.exa.ai
OUTBOUND_ASSISTANT_ID=your_outbound_assistant_id
VAPI_FROM_NUMBER_ID=your_phone_number_id
VAPI_FORCE_PHONE_PATCH=false
DEFAULT_VOICE_PROVIDER=11labs
DEFAULT_VOICE_ID=cgSgspJ2msm6clMCkdW9
```

### Running the Server

1. Start the development server:
```bash
npm run dev
# or
pnpm dev
```

2. The server will start on `http://localhost:3000` (or your configured PORT)

3. The server automatically sets up all VAPI tools on startup if the required environment variables are present.

### API Endpoints

#### Health Check
- `GET /health` - Server health check

#### Exa Web Search
- `POST /tools/exa/search` - Direct web search endpoint
- `POST /tools/exa/webhook` - VAPI webhook for `exa_search` tool
- `POST /tools/exa/contents` - Fetch web page contents
- `POST /tools/exa/contents/webhook` - VAPI webhook for `exa_get_contents` tool

#### Outbound Calls
- `POST /tools/outbound/start` - Start an outbound call
- `POST /tools/outbound/webhook` - VAPI webhook for `make_outbound_call` tool

#### Call Management
- `GET /tools/call/status/:callId` - Get call status
- `POST /tools/call/status/webhook` - VAPI webhook for `get_call_status` tool
- `GET /tools/call/messages/:callId` - Get call messages/transcript
- `POST /tools/call/messages/webhook` - VAPI webhook for `get_call_messages` tool

#### Gmail Integration
- `POST /tools/gmail/fetch-emails/webhook` - VAPI webhook for `gmail_fetch_emails`
- `POST /tools/gmail/list-threads/webhook` - VAPI webhook for `gmail_list_threads`
- `POST /tools/gmail/fetch-message-by-id/webhook` - VAPI webhook for `gmail_fetch_message_by_id`
- `POST /tools/gmail/fetch-message-by-thread/webhook` - VAPI webhook for `gmail_fetch_message_by_thread`
- `POST /tools/gmail/send-email/webhook` - VAPI webhook for `gmail_send_email`
- `POST /tools/gmail/reply-to-thread/webhook` - VAPI webhook for `gmail_reply_to_thread`
- `POST /tools/gmail/create-draft/webhook` - VAPI webhook for `gmail_create_draft`
- `POST /tools/gmail/send-draft/webhook` - VAPI webhook for `gmail_send_draft`
- `POST /tools/gmail/list-drafts/webhook` - VAPI webhook for `gmail_list_drafts`

#### Personalization
- `POST /personalization/webhook` - Dynamic assistant personalization based on caller phone number

## Inspiration

As students constantly looking to democratize certain aspects of the fast-paced world, we noticed that there is often a disconnect when it comes to personal assistants and maintaining a clear schedule. Often times, there is a lack of communication between people, stemming from a discrepancy in priorities -- but what if there was a way the aiding party could remember details and commands to every precise word? Similarly, now, more than ever, as technology moves faster and faster, the elderly are often ignored. For example, if my grandma wants to figure out some local hospitals near her, URSecretary can easily do it through her voice prompting; it avoids the whole hassle of scrambling through a computer and deal with nebulous commands that may or may not take the person to the place they want. The versatility of URSecretary does not just stop here, however. The implications of its capabilities is truly extensive as the AI agent has access to real-time data as well as personal information that the user allows it to use. From these, the agent knows what the user wants and helps them accomplish what they want to.

## What It Does

URSecretary is an AI Voice Assistant that can read and write emails, make phone calls, browse the web, and access your Google Account all to make your workflow that much simpler. It is able to track schedules, so like when a client is coming soon. It is also capable of summarizing and producing emails, all through voice command. If you are too busy to send a message or join a call queue, URSecretary is here to help and do all that for you. An example running would be to ask your assistant to send hourly macro updates, tailoring the importance towards market movements -- these would be imperative for a financial analyst. It's these simple reminders that allow people to save time and understand really fast what is happening in the sphere they want to be well-versed in.

## How We Built It

The app is run on an Express server in TypeScript that connects to a Supabase-interfaced PostgreSQL database storing user data, with API calls to the VAPI voice agent. Web capabilities are provided with EXA and emails through Composio.

## Challenges We Ran Into

Centrally getting the LLM behind the voice agent to behave the way we wanted it to. This mainly involved dynamically customizing the prompt and engineering the tool prompt to get the LLM to use the tools properly, including sending emails and making calls.

## Accomplishments That We're Proud of

Developing and successfully implementing the number of features the agent has; we were surprised by the amount of functionality our end product had, and could see ourselves using our app for our own purposes. Specifically, we were able to use Composio to connect our agent with a user's gmail, allowing them to gain fast access to their emails and even write their own. Additionally, our phone-call agent is able to receive specific instructions and coordinate calls, leading to one its well-paired abilities when it comes to google calendar scheduling.

## What We Learned

Rookie member learned about the fundamental concepts and implementation details surrounding an Express server written in Typescript, while all members developed a deeper understanding of the nature of LLMs and the tools that they can access, unlocking insight into the power in the simplicity and effectiveness of these budding technologies.

## What's Next for URSecretary

A feature we would like to add is browser interaction. For example, we would like to book flights and even purchase packages from Amazon. We would like more features and add adp for SMS for phone numbers to enhance to overall texting process.
