import { VapiClient } from '@vapi-ai/server-sdk';
const vapi = new VapiClient({ token: process.env.VAPI_API_KEY! });
const assistant = await vapi.assistants.create({
  name: 'Customer Support Assistant',
  model: {
    provider: 'openai',
    model: 'gpt-4o',
    messages: [{ role: 'system', content: 'You are Alex, a customer service voice assistant for TechSolutions.' }]
  },
  voice: { provider: '11labs', voiceId: 'cgSgspJ2msm6clMCkdW9' },
  firstMessage: 'Hi there, this is Alex from TechSolutions customer support. How can I help you today?'
});
console.log(assistant.id);