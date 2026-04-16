import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable is required");
    }
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

export interface ClaudeCallOptions {
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Single-turn Claude call. Returns the text content of the first message block.
 */
export async function callClaude(
  prompt: string,
  options: ClaudeCallOptions = {}
): Promise<string> {
  const client = getAnthropicClient();
  const { systemPrompt, maxTokens = 4096, temperature = 1 } = options;

  const messageParams: Anthropic.MessageCreateParams = {
    model: "claude-sonnet-4-5",
    max_tokens: maxTokens,
    temperature,
    messages: [{ role: "user", content: prompt }],
  };

  if (systemPrompt) {
    messageParams.system = systemPrompt;
  }

  const message = await client.messages.create(messageParams);

  const block = message.content[0];
  if (!block || block.type !== "text") {
    throw new Error("Claude returned no text content");
  }
  return block.text;
}

/**
 * Extract the first JSON object from a Claude response string.
 * Handles responses that include explanation text around the JSON.
 */
export function extractJson<T>(response: string): T {
  // Try to find a JSON object
  const objectMatch = response.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    return JSON.parse(objectMatch[0]) as T;
  }
  // Try to find a JSON array
  const arrayMatch = response.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    return JSON.parse(arrayMatch[0]) as T;
  }
  throw new Error(`Could not extract JSON from response: ${response.slice(0, 200)}`);
}
