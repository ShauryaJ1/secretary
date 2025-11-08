# Email Fetching Debug Guide

## Issue
Users are unable to retrieve emails. This guide helps diagnose and fix the issue.

## Common Issues

### 1. No Connected Account
**Error**: "No connected account found"

**Solution**:
1. Create a user with your email address
2. Click "Create Connection" 
3. Complete the OAuth flow in the popup window
4. Authorize Gmail access
5. Return to the app and click "Check Connection Status"
6. Once connection is confirmed, you can fetch emails

### 2. Testing Email Fetch

To see what emails are actually being returned, you can:

#### Option A: Use the Test Script
```bash
cd /Users/jasonhao/Documents/GitHub/secretary
python test_email_fetch.py your-email@example.com 5
```

This will show you:
- The exact response structure
- What data is being returned
- Any errors that occur

#### Option B: Check Browser Console
1. Open http://localhost:3000 in your browser
2. Open Developer Tools (F12)
3. Go to the Console tab
4. Try to fetch emails
5. Look for console.log outputs showing:
   - `Email fetch response:`
   - `Emails data:`
   - `Email 0:`, `Email 1:`, etc.

#### Option C: Check Network Tab
1. Open Developer Tools (F12)
2. Go to the Network tab
3. Try to fetch emails
4. Click on the `/actions/fetch_emails` request
5. Check the Response tab to see the raw data

## Expected Response Structure

The backend returns emails in this format:
```json
{
  "emails": [
    {
      "id": "email-id",
      "threadId": "thread-id",
      "snippet": "Email preview text...",
      "payload": {
        "headers": [
          {"name": "From", "value": "sender@example.com"},
          {"name": "To", "value": "recipient@example.com"},
          {"name": "Subject", "value": "Email subject"},
          {"name": "Date", "value": "Mon, 1 Jan 2024 00:00:00 +0000"}
        ],
        "body": {
          "data": "base64-encoded-email-body"
        }
      }
    }
  ]
}
```

## Debug Features Added

1. **Console Logging**: All email data is logged to the browser console
2. **Raw Data View**: If an email doesn't have a preview, you can view the raw JSON data
3. **Better Error Messages**: Errors now show the exact error message from the backend
4. **Connection Validation**: The backend now checks for connections before attempting to fetch emails

## Steps to Retrieve Emails

1. **Create User**
   - Enter your email address
   - Click "Create User"

2. **Create Gmail Connection**
   - Click "Create Connection"
   - Complete OAuth in popup
   - Authorize Gmail access

3. **Verify Connection**
   - Click "Check Connection Status"
   - Should show "Connection exists: Yes"

4. **Fetch Emails**
   - Set the number of emails to fetch
   - Click "Fetch Emails"
   - Emails should appear below

## If Emails Still Don't Show

1. Check the browser console for errors
2. Check the Network tab for the API response
3. Verify the backend is running on port 3001
4. Verify you completed the OAuth flow
5. Try the test script to see the raw response
6. Check backend logs: `tail -f /tmp/backend.log`

## Backend Logs

To see backend logs:
```bash
tail -f /tmp/backend.log
```

Look for:
- Email fetch requests
- Errors from Composio
- Connection status checks

## Contact

If issues persist, check:
1. Backend logs for errors
2. Browser console for frontend errors
3. Network tab for API response structure
4. Verify Gmail OAuth was completed successfully

