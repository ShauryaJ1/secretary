This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

### Prerequisites

- Node.js and npm/pnpm/yarn
- Backend server running on port 3001 (see `../composio-fastapi/README.md`)

### Environment Setup

The frontend is configured to connect to the backend API. The API URL can be configured via environment variables:

Create a `.env.local` file in the root of this directory:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

If not set, it defaults to `http://localhost:3001`.

### Running the Development Server

First, make sure the backend server is running (see backend README for instructions).

Then, run the frontend development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

The page auto-updates as you edit the file.

## Backend Connection

The frontend is configured to communicate with the FastAPI backend running on port 3001. CORS is enabled on the backend to allow requests from `http://localhost:3000`.

### API Client

The API client is located in `lib/api.ts` and provides typed functions for all backend endpoints:

- `api.createUser()` - Create a new user
- `api.checkConnectionExists()` - Check if a connection exists
- `api.createConnection()` - Create a new Gmail connection
- `api.checkConnectionStatus()` - Check connection status
- `api.runGmailAgent()` - Run the Gmail agent
- `api.fetchEmails()` - Fetch emails directly

### Example Usage

```typescript
import { api } from '@/lib/api';

// Create a user
const user = await api.createUser({ email: 'user@example.com' });

// Check connection
const exists = await api.checkConnectionExists({ user_id: user.user_id });

// Create connection
const connection = await api.createConnection({ user_id: user.user_id });
```

## Project Structure

- `app/` - Next.js app directory with pages and components
- `lib/` - Utility functions and API client
- `public/` - Static assets

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
