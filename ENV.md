Environment variables
=====================

Create a `.env` file at the project root using these keys:

- EXA_API_KEY: your Exa API key (required for /tools/exa/search)
- PORT: optional, defaults to 3000
- PUBLIC_BASE_URL: your public tunnel URL (e.g., https://abcd-1234.ngrok-free.app)
- VAPI_ASSISTANT_ID: your Vapi assistant id (e.g., a20961b0-f973-4fe3-986b-aad26152f0ee)

Example .env
------------

```
EXA_API_KEY=your_exa_api_key_here
PORT=3000
PUBLIC_BASE_URL=
VAPI_ASSISTANT_ID=your_vapi_assistant_id_here
```

Environment variables
=====================

Create a `.env` file at the project root using these keys:

- EXA_API_KEY: your Exa API key (required for /tools/exa/search)
- PORT: optional, defaults to 3000
- PUBLIC_BASE_URL: your public tunnel URL (e.g., https://abcd-1234.ngrok-free.app)
- VAPI_ASSISTANT_ID: your Vapi assistant id (e.g., a20961b0-f973-4fe3-986b-aad26152f0ee)

Example .env
------------

```
EXA_API_KEY=your_exa_api_key_here
PORT=3000
PUBLIC_BASE_URL=
VAPI_ASSISTANT_ID=your_vapi_assistant_id_here
```

Environment variables
=====================

Create a `.env` file at the project root using these keys:

- EXA_API_KEY: your Exa API key (required for /tools/exa/search)
- TOOL_WEBHOOK_PORT: port for tool webhook server (optional, defaults to 3000)
- PERSONALIZATION_WEBHOOK_PORT: port for personalization webhook server (optional, defaults to 3001)
- VAPI_API_KEY: optional, for future Vapi programmatic setup
- VAPI_PRIVATE_API_KEY: required for personalization webhook
- ASSISTANT_ID: your Vapi assistant id for personalization
- SUPABASE_URL: your Supabase project URL
- SUPABASE_KEY: your Supabase anon/service key
- VAPI_FROM_NUMBER_ID: optional, for outbound/scheduled calls later
- PUBLIC_BASE_URL: your public tunnel URL (e.g., https://abcd-1234.ngrok-free.app)
- VAPI_ASSISTANT_ID: your Vapi assistant id (e.g., a20961b0-f973-4fe3-986b-aad26152f0ee)

Example .env
------------

```
EXA_API_KEY=your_exa_api_key_here
TOOL_WEBHOOK_PORT=3000
PERSONALIZATION_WEBHOOK_PORT=3001
VAPI_API_KEY=
VAPI_PRIVATE_API_KEY=your_vapi_private_key_here
ASSISTANT_ID=your_assistant_id_here
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_supabase_key_here
VAPI_FROM_NUMBER_ID=
PUBLIC_BASE_URL=
VAPI_ASSISTANT_ID=your_vapi_assistant_id_here
```

## Quick Start with ngrok

1. Make sure your `.env` file has the required variables
2. Run `./start-dev.sh` (Git Bash/WSL) or `bash start-dev.sh`

This will:
- Start the unified webhook server (includes both tool webhooks and personalization)
- Create an ngrok tunnel
- Display the public URL

The server includes:
- Tool webhooks at `/tools/*` (Exa search, web contents, outbound calls)
- Personalization webhook at `/personalization/webhook`
- Health check at `/health`

Press Ctrl+C to stop all services.

Note: You only need ONE ngrok tunnel now since all webhooks are on the same server!


