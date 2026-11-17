import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { aiEnv } from "@/config/env";

/**
 * The only place that talks to the Anthropic API. The API key is read from the
 * server environment and passed straight to the official SDK; it is never
 * returned, logged or sent anywhere else.
 */

export type AiRequest = {
  model: string;
  system: string;
  user: string;
  schema: Record<string, unknown>;
  maxTokens: number;
};

export type AiResponse = {
  /** The model's JSON reply as text. */
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** "max_tokens" means the reply was cut off. */
  stopReason: string | null;
};

/** Errors are reduced to a code; provider messages never reach the browser. */
export type AiErrorCode = "not_configured" | "timeout" | "rate_limited" | "overloaded" | "auth" | "bad_request" | "network" | "refused" | "truncated" | "bad_output" | "unknown";

export class AiError extends Error {
  constructor(
    readonly code: AiErrorCode,
    /** Real token usage when the API answered but the answer could not be used. */
    readonly usage: { inputTokens: number; outputTokens: number; model: string } | null = null,
  ) {
    super(`AI request failed: ${code}`);
    this.name = "AiError";
  }
}

export interface AiClient {
  complete(req: AiRequest): Promise<AiResponse>;
}

export function classifyError(e: unknown): AiErrorCode {
  if (e instanceof AiError) return e.code;
  if (e instanceof Anthropic.APIConnectionTimeoutError) return "timeout";
  if (e instanceof Anthropic.APIConnectionError) return "network";
  if (e instanceof Anthropic.RateLimitError) return "rate_limited";
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return "auth";
  if (e instanceof Anthropic.BadRequestError || e instanceof Anthropic.NotFoundError || e instanceof Anthropic.UnprocessableEntityError) return "bad_request";
  if (e instanceof Anthropic.APIError && (e.status === 529 || e.status === 503)) return "overloaded";
  if (e instanceof Anthropic.APIError && typeof e.status === "number" && e.status >= 500) return "overloaded";
  return "unknown";
}

class AnthropicClient implements AiClient {
  private sdk: Anthropic;

  constructor(apiKey: string) {
    // One automatic retry for connection problems and 429/5xx; more would multiply cost and waiting time.
    this.sdk = new Anthropic({ apiKey, timeout: aiEnv.timeoutMs, maxRetries: 1 });
  }

  async complete(req: AiRequest): Promise<AiResponse> {
    const res = await this.sdk.messages.create({
      model: req.model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: [{ role: "user", content: req.user }],
      output_config: { effort: aiEnv.effort, format: { type: "json_schema", schema: req.schema } },
    });
    const text = res.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    return {
      text,
      model: res.model,
      inputTokens: res.usage.input_tokens + (res.usage.cache_creation_input_tokens ?? 0) + (res.usage.cache_read_input_tokens ?? 0),
      outputTokens: res.usage.output_tokens,
      stopReason: res.stop_reason,
    };
  }
}

let shared: AnthropicClient | null = null;

/** The real client, or null when no API key is configured. */
export function defaultClient(): AiClient | null {
  if (!aiEnv.apiKey) return null;
  shared ??= new AnthropicClient(aiEnv.apiKey);
  return shared;
}
