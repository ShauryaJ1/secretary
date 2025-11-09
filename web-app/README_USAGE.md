# Secretary Web App - Usage Guide

## Overview
This Next.js application provides a dashboard for managing user information and integrating with Gmail via Composio.

## Features
- **User Management**: Create and update user profiles with name, phone, and email
- **Gmail Integration**: Connect Gmail accounts via Composio OAuth
- **Email Fetching**: Validate connections and fetch the 5 most recent emails
- **Split-screen Layout**: Call history (placeholder) and user info sections

## Getting Started

### 1. Start the Development Server
```bash
cd secretary/web-app
pnpm dev
```

The app will be available at `http://localhost:3000`

### 2. Testing the Complete Flow

#### Step 1: Save User Information
1. Fill in the form with:
   - First Name
   - Last Name
   - Phone Number (used as unique identifier)
   - Email
2. Click "Save Information"
3. You should see a success message

#### Step 2: Connect Gmail
1. After saving user info, click "Connect Gmail"
2. A popup window will open with Google OAuth
3. Sign in with your Google account
4. Grant the necessary permissions
5. The popup will close after successful authentication
6. Wait a few seconds for the connection status to update

#### Step 3: Validate Connection and Fetch Emails
1. Once connected, the badge should show "ACTIVE" status
2. Click "Validate & Fetch Emails"
3. The 5 most recent emails from your Gmail will display below

## Technical Details

### Database Schema (HPSecretaryData)
- `composio_id`: Composio connected account ID
- `phone_number`: User's phone number (unique identifier)
- `user_name`: Format: `Firstname_Lastname`
- `created_at`: Timestamp
- `personalization_prompt`: (not used yet)
- `voice_provider`: (not used yet)
- `voice_name`: (not used yet)

### Architecture
- **Frontend**: Next.js 15+ with App Router
- **UI**: Shadcn UI + Tailwind CSS
- **API**: tRPC for type-safe API calls
- **Database**: Supabase
- **Integrations**: Composio for Gmail

### tRPC Routes

#### User Routes
- `user.upsert`: Create or update user information
- `user.getByPhone`: Get user by phone number
- `user.updateComposioId`: Update Composio connection ID

#### Composio Routes
- `composio.initiateConnection`: Start Gmail OAuth flow
- `composio.checkConnection`: Check connection status
- `composio.fetchEmails`: Fetch 5 most recent emails

## Environment Variables
All environment variables are configured in `.env`:
- Supabase credentials
- Composio API key
- Composio Auth Config ID
- OpenAI API key (for future use)

## Troubleshooting

### Connection Issues
- Ensure Supabase database is accessible
- Verify Composio API key is valid
- Check that auth config ID exists in Composio dashboard

### OAuth Popup Blocked
- Allow popups for localhost in your browser
- Alternatively, manually navigate to the redirect URL

### Emails Not Fetching
- Ensure the Gmail connection is ACTIVE
- Check that you've granted Gmail permissions during OAuth
- Verify the user exists in the database with a phone number

## Next Steps
- Add Google Calendar integration
- Implement call history functionality
- Add more email management features



