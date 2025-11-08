#!/bin/bash

# Attach a tool to VAPI assistant
# Usage: ./attach-tool-to-assistant.sh <TOOL_ID>

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

if [ -z "$VAPI_ASSISTANT_ID" ]; then
    echo "Error: VAPI_ASSISTANT_ID not set in .env file"
    exit 1
fi

# Check for tool ID argument
TOOL_ID=$1
if [ -z "$TOOL_ID" ]; then
    echo "Error: Tool ID is required"
    echo "Usage: $0 <TOOL_ID>"
    exit 1
fi

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}Fetching current assistant configuration...${NC}"

# Fetch current assistant
RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "https://api.vapi.ai/assistant/$VAPI_ASSISTANT_ID" \
    -H "Authorization: Bearer $VAPI_API_KEY")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" != "200" ]; then
    echo -e "${RED}Error fetching assistant: HTTP $HTTP_CODE${NC}"
    echo "$BODY"
    exit 1
fi

# Check if tool is already attached
IS_ATTACHED=$(echo "$BODY" | node -e "
    const data = JSON.parse(require('fs').readFileSync(0, 'utf-8'));
    const toolIds = data?.model?.toolIds || [];
    console.log(toolIds.includes('$TOOL_ID') ? 'yes' : 'no');
")

if [ "$IS_ATTACHED" = "yes" ]; then
    echo -e "${YELLOW}⚠ Tool $TOOL_ID is already attached to assistant${NC}"
    exit 0
fi

# Add tool to toolIds array
PATCH_BODY=$(echo "$BODY" | node -e "
    const data = JSON.parse(require('fs').readFileSync(0, 'utf-8'));
    const toolIds = data?.model?.toolIds || [];
    toolIds.push('$TOOL_ID');
    const patchBody = { model: { ...data.model, toolIds } };
    console.log(JSON.stringify(patchBody));
")

echo -e "${BLUE}Attaching tool $TOOL_ID to assistant...${NC}"

# Send PATCH request
UPDATE_RESPONSE=$(curl -s -w "\n%{http_code}" -X PATCH "https://api.vapi.ai/assistant/$VAPI_ASSISTANT_ID" \
    -H "Authorization: Bearer $VAPI_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$PATCH_BODY")

UPDATE_HTTP_CODE=$(echo "$UPDATE_RESPONSE" | tail -n1)
UPDATE_BODY=$(echo "$UPDATE_RESPONSE" | head -n-1)

if [ "$UPDATE_HTTP_CODE" != "200" ]; then
    echo -e "${RED}Error attaching tool: HTTP $UPDATE_HTTP_CODE${NC}"
    echo "$UPDATE_BODY"
    exit 1
fi

echo -e "${GREEN}✓ Tool attached successfully!${NC}"
echo ""
echo "Updated assistant:"
echo "$UPDATE_BODY" | node -e "const data=JSON.parse(require('fs').readFileSync(0,'utf-8')); console.log('Tool IDs:', data?.model?.toolIds || [])"

