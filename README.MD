Project details
## Inspiration
As students constantly looking to democratize certain aspects of the fast-paced world, we noticed that there is often a disconnect when it comes to personal assistants and maintaining a clear schedule. Often times, there is a lack of communication between people, stemming from a discrepancy in priorities -- but what if there was a way the aiding party could remember details and commands to every precise word? Similarly, now, more than ever, as technology moves faster and faster, the elderly are often ignored. For example, if my grandma wants to figure out some local hospitals near her, URSecretary can easily do it through her voice prompting; it avoids the whole hassle of scrambling through a computer and deal with nebulous commands that may or may not take the person to the place they want. The versatility of URSecretary does not just stop here, however. The implications of its capabilities is truly extensive as the AI agent has access to real-time data as well as personal information that the user allows it to use. From these, the agent knows what the user wants and helps them accomplish what they want to.
## What it does
URSecretary is an AI Voice Assistant that can read and write emails, make phone calls, browse the web, and access your Google Account all to make your workflow that much simpler. It is able to track schedules, so like when a client is coming soon. It is also capable of summarizing and producing emails, all through voice command. If you are too busy to send a message or join a call queue, URSecretary is here to help and do all that for you. An example running would be to ask your assistant to send hourly macro updates, tailoring the importance towards market movements -- these would be imperative for a financial analyst. It's these simple reminders that allow people to save time and understand really fast what is happening in the sphere they want to be well-versed in.
## How we built it
The app is run on an Express server in TypeScript that connects to a Supabase-interfaced PostgreSQL database storing user data, with API calls to the VAPI voice agent. Web capabilities are provided with EXA and emails through Composio 
## Challenges we ran into
Centrally getting the LLM behind the voice agent to behave the way we wanted it to. This mainly involved dynamically customizing the prompt and engineering the tool prompt to get the LLM to use the tools properly, including sending emails and making calls. 

## Accomplishments that we're proud of
Developing and successfully implementing the number of features the agent has; we were surprised by the amount of functionality our end product had, and could see ourselves using our app for our own purposes.

## What we learned
Rookie member learned about the fundamental concepts and implementation details surrounding an Express server written in Typescript, while all members developed a deeper understanding of the nature of LLMs and the tools that they can access, unlocking insight into the power in the simplicity and effectiveness of these budding technologies.

## What's next for URSecretary:
A feature we would like to add is browser interaction. For example, we would like to book flights and even purchase packages from Amazon. We would like more features and add adp for SMS for phone numbers to enhance to overall texting process.
