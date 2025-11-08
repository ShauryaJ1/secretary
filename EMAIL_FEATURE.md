# Email Fetching Feature

## Overview
Added email fetching functionality to the Gmail Email Viewer application. Users who have established a Gmail connection can now fetch and view their emails directly from the frontend.

## Features

### 1. Email Fetching UI
- **Conditional Display**: The email fetching section only appears when a user has an active Gmail connection
- **Configurable Limit**: Users can specify how many emails to fetch (1-50)
- **Real-time Status**: Shows loading states and success/error messages

### 2. Email Display
- **Email Cards**: Each email is displayed in a clean, readable card format
- **Email Information**: Shows subject, from, to, and date
- **Snippet Preview**: Displays email snippet/preview text
- **Full Email View**: Expandable details section to view full email body
- **Responsive Design**: Works on all screen sizes with dark mode support

### 3. Data Handling
- **Flexible Data Structure**: Handles different email data formats from Gmail API
- **Safe Field Extraction**: Helper function to extract email fields from various structures
- **Error Handling**: Graceful error handling with user-friendly messages

## Usage

### Step-by-Step Process

1. **Create User**
   - Enter your email address
   - Click "Create User"

2. **Create Connection**
   - Click "Create Connection"
   - Complete OAuth flow in popup window
   - Authorize Gmail access

3. **Check Connection**
   - Click "Check Connection Status"
   - Verify connection is active

4. **Fetch Emails**
   - Once connection is confirmed, the email fetching section appears
   - Set the number of emails to fetch (default: 5)
   - Click "Fetch Emails"
   - View your emails in the list below

## API Integration

### Endpoint Used
```
POST /actions/fetch_emails
```

### Request
```json
{
  "user_id": "user@example.com",
  "limit": 5
}
```

### Response
```json
{
  "emails": [
    {
      "id": "email-id",
      "subject": "Email Subject",
      "from": "sender@example.com",
      "to": "recipient@example.com",
      "date": "2024-01-01T00:00:00Z",
      "snippet": "Email preview text...",
      "body": "Full email body..."
    }
  ]
}
```

## Technical Details

### Components
- **ApiTest Component**: Main component that handles all user interactions
- **Email Interface**: TypeScript interface for email data structure
- **API Client**: Typed API client with fetchEmails function

### State Management
- `emails`: Array of fetched emails
- `emailLimit`: Number of emails to fetch (default: 5)
- `connectionExists`: Boolean indicating if Gmail connection is active
- `loading`: Loading state for async operations
- `error`: Error messages
- `message`: Success/info messages

### Error Handling
- Validates user ID before fetching
- Checks for active connection
- Displays user-friendly error messages
- Handles API errors gracefully

## UI/UX Features

### Visual Design
- **Color Coding**: Green theme for email fetching section
- **Card Layout**: Clean card-based email display
- **Hover Effects**: Interactive hover states on email cards
- **Dark Mode**: Full dark mode support

### User Experience
- **Progressive Disclosure**: Email fetching only shown when connection exists
- **Expandable Content**: Full email body in collapsible section
- **Loading States**: Clear loading indicators
- **Empty States**: Helpful messages when no emails are found

## Future Enhancements

Potential improvements:
- Email filtering and search
- Pagination for large email lists
- Email threading
- Mark as read/unread
- Delete emails
- Compose new emails
- Email attachments display
- Refresh button for latest emails

