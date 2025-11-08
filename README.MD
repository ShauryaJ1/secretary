# Voice Secretary

AI secretary project using TypeScript and VAPI.

## Setup

1. Install dependencies:
```bash
pnpm install
```

2. Create a `.env` file with your API keys (see ENV.md for details):
```env
EXA_API_KEY=your_exa_api_key
VAPI_API_KEY=your_vapi_api_key
VAPI_ASSISTANT_ID=your_assistant_id
PUBLIC_BASE_URL=https://your-domain.ngrok-free.app
PORT=3000
```

3. Build and run:
```bash
pnpm build
pnpm start
```

Or for development with hot reload:
```bash
pnpm dev
```

## Available Tools

### Exa Search
- **Direct endpoint**: `POST /tools/exa/search`
- **Webhook**: `POST /tools/exa/webhook`
- Searches the web with Exa and returns results with content

### Exa Web Contents
- **Direct endpoint**: `POST /tools/exa/contents`
- **Webhook**: `POST /tools/exa/contents/webhook`
- Fetches full web page contents from URLs using Exa AI

### Outbound Calls
- **Direct endpoint**: `POST /tools/outbound/start`
- **Webhook**: `POST /tools/outbound/webhook`
- Places outbound phone calls with custom instructions

## VAPI System Prompt Management

This project includes a sync script to manage your VAPI assistant's system prompt locally.

**Requirements**: The script uses `curl` for API calls and Node.js for JSON parsing (both should already be available if you're running this project).

### Commands

```bash
# Fetch system prompt from VAPI
./sync-prompt.sh fetch
# or
pnpm prompt:fetch

# Check if local prompt has changed
./sync-prompt.sh check
# or
pnpm prompt:check

# Update VAPI with local changes
./sync-prompt.sh update
# or
pnpm prompt:update

# Auto-sync: only update if changes detected
./sync-prompt.sh sync
# or
pnpm prompt:sync
```

### Workflow

1. **Initial setup**: Fetch the current prompt from VAPI
   ```bash
   ./sync-prompt.sh fetch
   ```

2. **Edit locally**: Modify `system_prompt.txt` as needed

3. **Check status**: See if you have local changes
   ```bash
   ./sync-prompt.sh check
   ```

4. **Push changes**: Update VAPI with your changes
   ```bash
   ./sync-prompt.sh update
   ```

The script uses SHA256 checksums to track changes to `system_prompt.txt`. The checksum is stored in `.system_prompt.checksum` and automatically updated after fetch/update operations.

### Files

- `system_prompt.txt` - The system prompt text (local copy)
- `assistant.json` - Full assistant configuration (for reference)
- `.system_prompt.checksum` - SHA256 checksum for change detection

All of these files are gitignored by default.

## API Endpoints

### Health Check
- `GET /health` - Server health check

### Tool Management
- `GET /tools/exa/status` - Check Exa tool status
- `POST /tools/exa/attach` - Attach Exa search tool to assistant
- `POST /tools/exa/contents/attach` - Attach Exa contents tool to assistant
- `GET /tools/outbound/status` - Check outbound tool status
- `POST /tools/outbound/attach` - Attach outbound call tool to assistant
