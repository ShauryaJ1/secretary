# Testing Setup Guide

## Prerequisites

1. **Backend Dependencies**: The backend needs Python dependencies installed
2. **Environment Variables**: Backend needs API keys configured
3. **Ports**: 
   - Frontend: `http://localhost:3000`
   - Backend: `http://localhost:3001`

## Step 1: Setup Backend

```bash
cd composio-fastapi

# Create virtual environment (if not already created)
make env
source .venv/bin/activate

# Install dependencies
uv sync

# Make sure .env file exists with API keys
# COMPOSIO_API_KEY=your_key_here
# OPENAI_API_KEY=your_key_here

# Start backend server
python -m simple_gmail_agent.server.run --port 3001
```

The backend should start on `http://localhost:3001`

## Step 2: Setup Frontend

```bash
cd my-app

# Install dependencies (if not already installed)
npm install
# or
pnpm install

# Start frontend server
npm run dev
# or
pnpm dev
```

The frontend should start on `http://localhost:3000`

## Step 3: Test the Connection

1. Open `http://localhost:3000` in your browser
2. You should see the API test component
3. Enter an email address and click "Create User"
4. The frontend should successfully communicate with the backend

## Troubleshooting

### Backend not starting
- Make sure virtual environment is activated
- Check that dependencies are installed: `uv sync`
- Verify `.env` file exists with API keys
- Check if port 3001 is already in use: `lsof -i :3001`

### Frontend can't connect to backend
- Verify backend is running on port 3001
- Check browser console for CORS errors
- Verify `NEXT_PUBLIC_API_URL` is set to `http://localhost:3001` (or uses default)
- Check backend CORS configuration allows `http://localhost:3000`

### CORS Errors
- Backend CORS is configured to allow `http://localhost:3000` and `http://127.0.0.1:3000`
- If you see CORS errors, check the backend logs to see which origin is being blocked

## Quick Test with curl

Test backend directly:
```bash
curl -X POST http://localhost:3001/user/create \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'
```

Test CORS:
```bash
curl -X OPTIONS http://localhost:3001/user/create \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: POST" \
  -v
```

You should see `Access-Control-Allow-Origin: http://localhost:3000` in the response headers.

