import Anthropic from '@anthropic-ai/sdk';
import { getApiKey } from './storage.js';

/** Robustly extract JSON from Claude's response regardless of fences or preamble text */
export function parseJson(text) {
  try { return JSON.parse(text.trim()); } catch {}
  const stripped = text.replace(/^```(?:json)?\s*/im, '').replace(/```\s*$/m, '').trim();
  try { return JSON.parse(stripped); } catch {}
  // Find the first complete JSON object or array
  const match = stripped.match(/([{\[][\s\S]*[}\]])/);
  if (match) return JSON.parse(match[0]);
  throw new SyntaxError('No valid JSON found in Claude response');
}

/** Call the Claude API, returns the raw text response */
export async function callClaude(systemPrompt, userContent, {
  model = 'claude-sonnet-4-20250514',
  maxTokens = 2048,
} = {}) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('No API key set. Tap ⚙️ to add your Claude API key.');
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const msg = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  });
  return msg.content[0].text;
}
