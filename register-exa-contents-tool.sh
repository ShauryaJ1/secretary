#!/bin/bash

# Register Exa Contents Tool on VAPI
# This script creates the exa_get_contents tool on VAPI using cURL

set -e

# Load environment variables from .env file
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Check for required environment variables
if [ -z "$VAPI_API_KEY" ]; then
    echo "Error: VAPI_API_KEY not set in .env file"
    exit 1
fi

if [ -z "$PUBLIC_BASE_URL" ]; then
    echo "Error: PUBLIC_BASE_URL not set in .env file"
    exit 1
fi

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

WEBHOOK_URL="${PUBLIC_BASE_URL}/tools/exa/contents/webhook"

echo -e "${BLUE}Creating Exa Contents tool on VAPI...${NC}"
echo -e "Webhook URL: $WEBHOOK_URL"

# Create the tool using cURL
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "https://api.vapi.ai/tool" \
    -H "Authorization: Bearer $VAPI_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{
        "type": "function",
        "function": {
            "name": "exa_get_contents",
            "description": "Fetch full web page contents from a list of URLs using Exa AI. Returns text and optional highlights from each URL.",
            "parameters": {
                "type": "object",
                "properties": {
                    "urls": {
                        "type": "array",
                        "items": { "type": "string" },
                        "description": "List of URLs to fetch contents from (1-20 URLs)"
                    },
                    "getText": {
                        "type": "boolean",
                        "description": "Whether to include full text content (default: true)"
                    },
                    "getHighlights": {
                        "type": "boolean",
                        "description": "Whether to include content highlights (default: false)"
                    }
                },
                "required": ["urls"]
            }
        },
        "server": {
            "url": "'"$WEBHOOK_URL"'"
        },
        "messages": [
            {
                "type": "request-start",
                "content": "Fetching web page contents..."
            },
            {
                "type": "request-complete",
                "content": "I'\''ve retrieved the page contents."
            },
            {
                "type": "request-failed",
                "content": "I couldn'\''t fetch the page contents right now."
            }
        ]
    }')

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ Tool created successfully!${NC}"
    echo ""
    echo "Response:"
    echo "$BODY" | node -e "console.log(JSON.stringify(JSON.parse(require('fs').readFileSync(0, 'utf-8')), null, 2))"
    
    # Extract and display tool ID
    TOOL_ID=$(echo "$BODY" | node -e "const data=JSON.parse(require('fs').readFileSync(0,'utf-8')); console.log(data.id || '')")
    if [ -n "$TOOL_ID" ]; then
        echo ""
        echo -e "${GREEN}Tool ID: $TOOL_ID${NC}"
        echo ""
        echo "To attach this tool to your assistant, run:"
        echo -e "${BLUE}./attach-tool-to-assistant.sh $TOOL_ID${NC}"
    fi
else
    echo -e "${RED}Error: HTTP $HTTP_CODE${NC}"
    echo "$BODY"
    exit 1
fi

