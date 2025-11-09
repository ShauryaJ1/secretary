# Webhook Server Integration - Thought Process

## Current Architecture (Pull-Based)
Right now, the system works like this:
- **Frontend requests emails** → Backend → Composio → Gmail API → Returns emails
- User has to manually trigger email fetching
- System polls Gmail only when explicitly asked

## Why Add Webhooks? (Push-Based)
With webhooks, instead of asking "Do I have new emails?", Gmail would tell you:
- "Hey! You have a new email!"
- "Someone replied to your message!"
- "An email was marked as important!"

This enables **real-time notifications** and **event-driven workflows**.

---

## Architecture Options

### Option 1: Gmail → Your Webhook Server (Direct Integration)

**Flow:**
```
Gmail API → Google Cloud Pub/Sub → Your Webhook Server → Your Backend
```

**How it works:**
1. **Setup Push Notifications:**
   - Use Gmail's "watch" API to subscribe to inbox changes
   - Gmail sends notifications to Google Cloud Pub/Sub topic
   - Your webhook server subscribes to that Pub/Sub topic
   - When new email arrives → Pub/Sub publishes → Your server receives notification

2. **Authentication Challenge:**
   - Gmail requires OAuth tokens to set up watch subscriptions
   - You'd need to use Composio's stored tokens (or manage them yourself)
   - Each user needs their own watch subscription
   - Subscriptions expire after 7 days (need renewal)

3. **Webhook Server Responsibilities:**
   - Receive Pub/Sub messages (not raw Gmail webhooks)
   - Parse the notification (it tells you "something changed", not the actual email)
   - Extract user_id from the notification
   - Call your existing `/actions/fetch_emails` endpoint OR directly use Composio to fetch the new email
   - Process/store/notify as needed

**Pros:**
- Direct integration with Gmail
- Real-time notifications
- Full control over the flow

**Cons:**
- More complex setup (Pub/Sub, watch subscriptions)
- Need to manage subscription renewals
- Need to handle Gmail's notification format
- Each user needs individual watch subscription

---

### Option 2: Composio → Your Webhook Server (If Composio Supports Webhooks)

**Flow:**
```
Gmail → Composio (monitors) → Composio Webhook → Your Webhook Server → Your Backend
```

**How it works:**
1. **Composio as Middleman:**
   - Composio handles Gmail watch subscriptions on your behalf
   - Composio receives Gmail notifications
   - Composio forwards events to your webhook endpoint
   - You configure webhook URL in Composio dashboard

2. **Webhook Server Responsibilities:**
   - Receive events from Composio (pre-formatted)
   - Events include: `user_id`, `event_type` (new_email, reply, etc.), `email_id`
   - Authenticate incoming requests (Composio signature/token)
   - Process events using existing Composio tools

**Pros:**
- Much simpler - Composio handles Gmail complexity
- Pre-formatted events (easier to process)
- No need to manage Pub/Sub or watch subscriptions
- Composio handles token refresh and renewals

**Cons:**
- Depends on Composio supporting webhooks
- Less control over the exact notification format
- Additional dependency on Composio's infrastructure

---

### Option 3: Hybrid Approach (Polling + Webhooks)

**Flow:**
```
Gmail → Webhook Server (for immediate notifications)
     → Your Backend (for detailed fetching via Composio)
```

**How it works:**
1. **Webhook receives lightweight notifications:**
   - "User X has a new email" (just metadata)
   - Store notification in queue/database
   - Don't fetch full email yet

2. **Backend processes notifications:**
   - Worker process checks notification queue
   - Uses existing Composio tools to fetch full email details
   - Processes email (store, analyze, notify user, etc.)

**Pros:**
- Fast notifications (webhook is lightweight)
- Full email details fetched on your schedule (rate limit friendly)
- Can batch process multiple notifications
- Decouples notification from processing

**Cons:**
- More moving parts (webhook server + worker process)
- Slight delay between notification and full email data
- Need queue/worker infrastructure

---

## Key Design Considerations

### 1. **User Identification**
**Problem:** Webhook notifications need to map to the right user
**Solution:**
- Gmail notifications include email address or user identifier
- Map Gmail email → your user_id (which is also email in your system)
- Store mapping: `gmail_email → user_id → composio_connection_id`

### 2. **Authentication & Security**
**Problem:** How do you verify webhook requests are legitimate?

**For Gmail Pub/Sub:**
- Google signs Pub/Sub messages
- Verify signatures using Google's public keys
- Only accept messages from trusted Pub/Sub topics

**For Composio Webhooks:**
- Composio likely provides webhook secret/token
- Include secret in webhook URL or headers
- Validate on every request

**General Security:**
- Use HTTPS only
- Rate limiting (prevent abuse)
- IP whitelisting (if possible)
- Request signing/verification

### 3. **Event Types to Handle**
Different events require different actions:
- **New Email:** Fetch email, store, notify user, trigger AI analysis
- **Email Reply:** Fetch reply, link to original, update conversation thread
- **Email Read:** Update status, mark as processed
- **Email Deleted:** Remove from your system
- **Label Changed:** Update categorization

### 4. **Idempotency**
**Problem:** Webhooks can be delivered multiple times
**Solution:**
- Store processed event IDs
- Check if event already processed before acting
- Use event IDs from Gmail/Composio as unique keys
- Handle duplicate notifications gracefully

### 5. **Error Handling**
**Problem:** What if webhook processing fails?
**Solution:**
- Return appropriate HTTP status codes (200 = received, 500 = retry)
- Implement retry logic (exponential backoff)
- Dead letter queue for failed events
- Logging and monitoring
- Alert on repeated failures

### 6. **Scalability**
**Problem:** What if you have thousands of users?
**Solution:**
- Webhook server should be stateless
- Process events asynchronously (don't block webhook handler)
- Use message queue (Redis, RabbitMQ, etc.) for event processing
- Horizontal scaling (multiple webhook server instances)
- Database for event storage and tracking

---

## Integration Points with Existing System

### Where Webhook Server Fits:

```
┌─────────────┐
│   Gmail     │
└──────┬──────┘
       │ (notifications)
       ↓
┌─────────────────────┐
│  Webhook Server     │ ← New component
│  (receives events)  │
└──────┬──────────────┘
       │ (processes & stores)
       ↓
┌─────────────────────┐
│  Event Queue/DB     │ ← New component
│  (pending events)   │
└──────┬──────────────┘
       │ (worker processes)
       ↓
┌─────────────────────┐
│  Your Backend       │ ← Existing
│  (uses Composio)    │
└──────┬──────────────┘
       │
       ↓
┌─────────────────────┐
│  Composio           │ ← Existing
│  (fetches emails)   │
└──────┬──────────────┘
       │
       ↓
┌─────────────────────┐
│  Gmail API          │
└─────────────────────┘
```

### Webhook Server Endpoints:

1. **POST /webhooks/gmail** (or `/webhooks/composio`)
   - Receives incoming webhook events
   - Validates authentication
   - Parses event data
   - Stores event in queue/database
   - Returns 200 OK immediately

2. **Internal API: GET /webhooks/events/pending**
   - Worker process polls for pending events
   - Returns events ready for processing
   - Marks events as "processing"

3. **Internal API: POST /webhooks/events/{event_id}/complete**
   - Worker marks event as successfully processed
   - Updates event status

4. **Internal API: POST /webhooks/events/{event_id}/failed**
   - Worker marks event as failed
   - Increments retry count
   - Schedules retry or moves to dead letter queue

---

## Data Flow Example: New Email Arrives

### Step-by-Step:

1. **User receives email in Gmail**
   - Gmail detects new email
   - Gmail publishes notification to Pub/Sub (or Composio receives it)

2. **Webhook Server receives notification**
   - Pub/Sub → Webhook Server OR Composio → Webhook Server
   - Payload: `{"user_email": "user@example.com", "event": "new_email", "email_id": "abc123"}`

3. **Webhook Server validates & stores**
   - Verify request signature/authentication
   - Extract user_email → map to user_id
   - Store event: `{event_id, user_id, event_type, email_id, status: "pending", created_at}`

4. **Worker process picks up event**
   - Polls for pending events
   - Finds: "user@example.com has new email abc123"

5. **Worker fetches email details**
   - Calls existing backend: `POST /actions/fetch_emails` with `user_id` and specific `email_id`
   - OR directly calls Composio: `composio_client.tools.execute(user_id, "GMAIL_FETCH_EMAILS", {email_id: "abc123"})`

6. **Worker processes email**
   - Stores email in database
   - Triggers AI analysis (if needed)
   - Sends notification to frontend (WebSocket/SSE)
   - Updates user's email list

7. **Worker marks event complete**
   - Updates event status to "completed"
   - Logs processing time

---

## Composio Integration Considerations

### How Composio Fits In:

**Current Usage:**
- Composio stores OAuth tokens
- Composio provides tools to fetch emails
- Composio handles API calls to Gmail

**With Webhooks:**

1. **Token Access:**
   - Webhook server might need to access Composio tokens to set up Gmail watch subscriptions
   - OR Composio handles watch subscriptions internally

2. **Event Processing:**
   - When webhook receives notification, use Composio to fetch full email
   - Composio tools remain the primary way to interact with Gmail
   - Webhook just triggers the Composio tool calls

3. **User Context:**
   - Webhook notifications need user_id
   - Use Composio's connected_accounts to map Gmail email → user_id
   - Or maintain your own mapping: `gmail_email → user_id`

---

## Recommended Approach

### My Recommendation: **Option 2 (Composio Webhooks) if available, else Option 1 (Direct Gmail)**

**Reasoning:**

1. **If Composio supports webhooks:**
   - Simplest integration
   - Leverages existing Composio infrastructure
   - No need to manage Gmail watch subscriptions
   - Composio handles token refresh and renewals
   - Pre-formatted events

2. **If Composio doesn't support webhooks:**
   - Use Gmail's Pub/Sub directly
   - Use Composio's stored tokens to set up watch subscriptions
   - Webhook server receives Pub/Sub messages
   - Use Composio tools to fetch email details when notified

### Implementation Strategy:

**Phase 1: Webhook Infrastructure**
- Set up webhook endpoint
- Implement authentication/validation
- Set up event storage (database/queue)
- Add logging and monitoring

**Phase 2: Gmail Integration**
- Set up Gmail watch subscriptions (using Composio tokens)
- OR configure Composio webhooks
- Test with single user
- Verify notifications are received

**Phase 3: Event Processing**
- Build worker process to handle events
- Integrate with existing Composio tools
- Process new email events
- Store and notify users

**Phase 4: Production**
- Scale to multiple users
- Handle edge cases (duplicates, failures)
- Monitor and optimize
- Add more event types (replies, labels, etc.)

---

## Key Questions to Answer

Before implementing, you need to know:

1. **Does Composio support webhooks for Gmail events?**
   - Check Composio documentation
   - Contact Composio support
   - If yes → use Option 2
   - If no → use Option 1

2. **What events do you want to handle?**
   - New emails only?
   - Replies?
   - Label changes?
   - Deletions?
   - This determines webhook subscription scope

3. **How do you want to notify users?**
   - Real-time WebSocket/SSE?
   - Email notifications?
   - In-app notifications?
   - This determines frontend integration

4. **What's your scale?**
   - How many users?
   - Expected email volume?
   - This determines infrastructure needs (queues, workers, scaling)

5. **What's your infrastructure?**
   - Do you have Pub/Sub access?
   - Do you have message queue (Redis, RabbitMQ)?
   - Do you have worker process infrastructure?
   - This determines implementation complexity

---

## Summary

A webhook server would transform your system from **pull-based** (user requests emails) to **push-based** (system receives notifications about emails). The webhook server acts as the **entry point** for real-time events, then your existing backend (using Composio) handles the actual email fetching and processing. The key is maintaining the separation of concerns: webhook server handles events, your backend handles Gmail interactions via Composio.

