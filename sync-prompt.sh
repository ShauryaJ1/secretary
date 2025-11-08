#!/bin/bash

# VAPI System Prompt Sync Script
# This script tracks changes to system_prompt.txt and updates VAPI when changes are detected

set -e

PROMPT_FILE="system_prompt.txt"
CHECKSUM_FILE=".system_prompt.checksum"
ASSISTANT_JSON="assistant.json"

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

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to calculate checksum
calculate_checksum() {
    if [ -f "$PROMPT_FILE" ]; then
        if command -v sha256sum &> /dev/null; then
            sha256sum "$PROMPT_FILE" | awk '{print $1}'
        elif command -v shasum &> /dev/null; then
            shasum -a 256 "$PROMPT_FILE" | awk '{print $1}'
        else
            echo -e "${RED}Error: Neither sha256sum nor shasum found${NC}" >&2
            exit 1
        fi
    else
        echo ""
    fi
}

# Function to read stored checksum
read_stored_checksum() {
    if [ -f "$CHECKSUM_FILE" ]; then
        cat "$CHECKSUM_FILE"
    else
        echo ""
    fi
}

# Function to save checksum
save_checksum() {
    local checksum=$1
    echo "$checksum" > "$CHECKSUM_FILE"
}

# Parse command line arguments
COMMAND=${1:-"check"}

case "$COMMAND" in
    "fetch")
        echo -e "${BLUE}Fetching assistant from VAPI...${NC}"
        
        # Fetch assistant data
        RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "https://api.vapi.ai/assistant/$VAPI_ASSISTANT_ID" \
            -H "Authorization: Bearer $VAPI_API_KEY")
        
        HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
        BODY=$(echo "$RESPONSE" | head -n-1)
        
        if [ "$HTTP_CODE" != "200" ]; then
            echo -e "${RED}Error: HTTP $HTTP_CODE${NC}"
            echo "$BODY"
            exit 1
        fi
        
        # Save full assistant JSON and extract system prompt using Node.js
        SYSTEM_PROMPT=$(echo "$BODY" | node -e "
            const data = JSON.parse(require('fs').readFileSync(0, 'utf-8'));
            require('fs').writeFileSync('$ASSISTANT_JSON', JSON.stringify(data, null, 2));
            const messages = data?.model?.messages || [];
            const systemMsg = messages.find(m => m.role === 'system');
            console.log(systemMsg?.content || '');
        ")
        
        echo -e "${GREEN}✓ Saved assistant data to $ASSISTANT_JSON${NC}"
        
        if [ -z "$SYSTEM_PROMPT" ]; then
            echo -e "${YELLOW}⚠ No system message found in assistant${NC}"
        fi
        
        echo "$SYSTEM_PROMPT" > "$PROMPT_FILE"
        echo -e "${GREEN}✓ Saved system prompt to $PROMPT_FILE${NC}"
        
        # Show preview
        PREVIEW=$(echo "$SYSTEM_PROMPT" | head -c 200)
        echo -e "\n${BLUE}System prompt preview:${NC}"
        echo "$PREVIEW$([ ${#SYSTEM_PROMPT} -gt 200 ] && echo '...')"
        echo -e "\nTotal length: ${#SYSTEM_PROMPT} characters"
        
        # Save the new checksum
        NEW_CHECKSUM=$(calculate_checksum)
        save_checksum "$NEW_CHECKSUM"
        echo -e "${GREEN}✓ Checksum saved${NC}"
        ;;
        
    "update"|"push")
        if [ ! -f "$PROMPT_FILE" ]; then
            echo -e "${RED}Error: $PROMPT_FILE not found. Run './sync-prompt.sh fetch' first.${NC}"
            exit 1
        fi
        
        echo -e "${BLUE}Reading local system prompt...${NC}"
        NEW_PROMPT=$(cat "$PROMPT_FILE")
        
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
        
        # Update the system message in the messages array using Node.js
        # This updates or adds the system message while preserving other messages
        PATCH_BODY=$(echo "$BODY" | node -e "
            const data = JSON.parse(require('fs').readFileSync(0, 'utf-8'));
            const prompt = require('fs').readFileSync('$PROMPT_FILE', 'utf-8');
            const messages = data?.model?.messages || [];
            const systemMsgIndex = messages.findIndex(m => m.role === 'system');
            
            if (systemMsgIndex >= 0) {
                messages[systemMsgIndex].content = prompt;
            } else {
                messages.unshift({ role: 'system', content: prompt });
            }
            
            const patchBody = { model: { ...data.model, messages } };
            console.log(JSON.stringify(patchBody));
        ")
        
        echo -e "${BLUE}Updating assistant on VAPI...${NC}"
        
        # Send PATCH request
        UPDATE_RESPONSE=$(curl -s -w "\n%{http_code}" -X PATCH "https://api.vapi.ai/assistant/$VAPI_ASSISTANT_ID" \
            -H "Authorization: Bearer $VAPI_API_KEY" \
            -H "Content-Type: application/json" \
            -d "$PATCH_BODY")
        
        UPDATE_HTTP_CODE=$(echo "$UPDATE_RESPONSE" | tail -n1)
        UPDATE_BODY=$(echo "$UPDATE_RESPONSE" | head -n-1)
        
        if [ "$UPDATE_HTTP_CODE" != "200" ]; then
            echo -e "${RED}Error updating assistant: HTTP $UPDATE_HTTP_CODE${NC}"
            echo "$UPDATE_BODY"
            exit 1
        fi
        
        echo -e "${GREEN}✓ System prompt updated successfully${NC}"
        
        # Show preview
        PREVIEW=$(echo "$NEW_PROMPT" | head -c 200)
        echo -e "\n${BLUE}New prompt preview:${NC}"
        echo "$PREVIEW$([ ${#NEW_PROMPT} -gt 200 ] && echo '...')"
        echo -e "\nTotal length: ${#NEW_PROMPT} characters"
        
        # Save the new checksum after successful update
        NEW_CHECKSUM=$(calculate_checksum)
        save_checksum "$NEW_CHECKSUM"
        echo -e "${GREEN}✓ Checksum updated${NC}"
        ;;
        
    "check"|"status")
        if [ ! -f "$PROMPT_FILE" ]; then
            echo -e "${YELLOW}⚠ $PROMPT_FILE does not exist${NC}"
            echo -e "Run: ${BLUE}./sync-prompt.sh fetch${NC} to download it from VAPI"
            exit 0
        fi
        
        CURRENT_CHECKSUM=$(calculate_checksum)
        STORED_CHECKSUM=$(read_stored_checksum)
        
        if [ -z "$STORED_CHECKSUM" ]; then
            echo -e "${YELLOW}⚠ No stored checksum found${NC}"
            echo -e "This appears to be the first time tracking this file."
            echo -e "Run: ${BLUE}./sync-prompt.sh fetch${NC} to initialize tracking"
            exit 0
        fi
        
        if [ "$CURRENT_CHECKSUM" != "$STORED_CHECKSUM" ]; then
            echo -e "${YELLOW}✗ System prompt has CHANGED${NC}"
            echo -e "  Current:  $CURRENT_CHECKSUM"
            echo -e "  Stored:   $STORED_CHECKSUM"
            echo -e "\nTo push changes to VAPI, run: ${BLUE}./sync-prompt.sh update${NC}"
            exit 1
        else
            echo -e "${GREEN}✓ System prompt is up to date${NC}"
            echo -e "  Checksum: $CURRENT_CHECKSUM"
            exit 0
        fi
        ;;
        
    "sync")
        echo -e "${BLUE}Auto-sync mode: checking for changes...${NC}"
        
        if [ ! -f "$PROMPT_FILE" ]; then
            echo -e "${YELLOW}⚠ $PROMPT_FILE does not exist, fetching from VAPI...${NC}"
            $0 fetch
            exit 0
        fi
        
        CURRENT_CHECKSUM=$(calculate_checksum)
        STORED_CHECKSUM=$(read_stored_checksum)
        
        if [ -z "$STORED_CHECKSUM" ]; then
            echo -e "${YELLOW}⚠ No stored checksum, initializing...${NC}"
            save_checksum "$CURRENT_CHECKSUM"
            echo -e "${GREEN}✓ Checksum initialized${NC}"
            exit 0
        fi
        
        if [ "$CURRENT_CHECKSUM" != "$STORED_CHECKSUM" ]; then
            echo -e "${YELLOW}⚠ Changes detected, updating VAPI...${NC}"
            $0 update
        else
            echo -e "${GREEN}✓ No changes detected${NC}"
        fi
        ;;
        
    "help"|"--help"|"-h")
        echo "VAPI System Prompt Sync Tool"
        echo ""
        echo "Usage: ./sync-prompt.sh [command]"
        echo ""
        echo "Commands:"
        echo "  fetch          Download system prompt from VAPI"
        echo "  update|push    Upload local system prompt to VAPI"
        echo "  check|status   Check if local prompt has changed"
        echo "  sync           Auto-sync: update VAPI if changes detected"
        echo "  help           Show this help message"
        echo ""
        echo "Examples:"
        echo "  ./sync-prompt.sh fetch     # Download from VAPI"
        echo "  ./sync-prompt.sh check     # Check for local changes"
        echo "  ./sync-prompt.sh update    # Push changes to VAPI"
        echo "  ./sync-prompt.sh sync      # Auto-sync if changed"
        echo ""
        ;;
        
    *)
        echo -e "${RED}Unknown command: $COMMAND${NC}"
        echo "Run './sync-prompt.sh help' for usage"
        exit 1
        ;;
esac

