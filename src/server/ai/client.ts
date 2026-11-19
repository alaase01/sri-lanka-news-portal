import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { aiEnv } from "@/config/env";

/**
 * The only place that talks to the Anthropic API. The API key is read from the
 * server environment and passed straight to the official SDK; it is never
 * returned, logged or sent anywhere else.
 */

/** Server-side research tools run by Anthropic (web search is billed per search; fetch only by tokens). */
export type AiTools = {
  search?: { maxUses: number; allowedDomains: string[] };
  fetch?: { maxUses: number; allowedDomains: string[]; maxContentTokens: number };
};

export type AiRequest = {
  model: string;
  system: string;
  user: string;
  schema: Record<string, unknown>;
  maxTokens: number;
  tools?: AiTools;
  effort?: "low" | "medium" | "high";
};

/** A search result the model actually received (used to reject invented sources). */
export type SearchHit = { url: string; title: string; pageAge: string | null };
/** A page the model actually read. The text is used only in memory, for the similarity check; it is never stored. */
export type FetchedPage = { url: string; title: string | null; text: string; retrievedAt: string | null };

export type AiResponse = {
  /** The model's JSON reply as text. */
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** "max_tokens" means the reply was cut off. */
  stopReason: string | null;
  webSearchRequests?: number;
  webFetchRequests?: number;
  searchHits?: SearchHit[];
  fetchedPages?: FetchedPage[];
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

/**
 * One line for the server log with the provider's error type and message, so failures can be
 * diagnosed. Anthropic error messages describe the request, never the API key.
 */
export function describeError(e: unknown): string {
  if (e instanceof Anthropic.APIError) {
    const body = e.error as { error?: { type?: string; message?: string } } | undefined;
    return `status ${e.status ?? "-"} ${body?.error?.type ?? ""}: ${(body?.error?.message ?? e.message).slice(0, 500)}`;
  }
  return e instanceof Error ? e.message.slice(0, 500) : String(e).slice(0, 200);
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
    // Basic tool versions: results come back in full, so sources can be checked by code.
    const tools: Anthropic.Messages.ToolUnion[] = [];
    if (req.tools?.search) {
      tools.push({
        type: "web_search_20250305",
        name: "web_search",
        max_uses: req.tools.search.maxUses,
        allowed_domains: req.tools.search.allowedDomains,
        // Called directly, not from code execution (required for models without programmatic tool calling).
        allowed_callers: ["direct"],
      });
    }
    if (req.tools?.fetch) {
      tools.push({
        type: "web_fetch_20250910",
        name: "web_fetch",
        max_uses: req.tools.fetch.maxUses,
        allowed_domains: req.tools.fetch.allowedDomains,
        max_content_tokens: req.tools.fetch.maxContentTokens,
        allowed_callers: ["direct"],
      });
    }

    const user = tools.length
      ? `${req.user}\n\nWhen you have finished searching and reading, reply with ONLY one JSON object (no other text, no code fences) that matches this JSON schema:\n${JSON.stringify(req.schema)}`
      : req.user;
    const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: user }];
    const out: AiResponse = { text: "", model: req.model, inputTokens: 0, outputTokens: 0, stopReason: null, webSearchRequests: 0, webFetchRequests: 0, searchHits: [], fetchedPages: [] };

    // Long tool sessions can pause; continue a limited number of times.
    for (let turn = 0; turn < 4; turn++) {
      const res = await this.sdk.messages.create({
        model: req.model,
        max_tokens: req.maxTokens,
        system: req.system,
        messages,
        ...(tools.length ? { tools } : {}),
        // Structured outputs cannot be combined with the citations that web search adds, so with
        // tools the JSON shape is requested in the prompt and checked by the caller instead.
        output_config: tools.length ? { effort: req.effort ?? aiEnv.effort } : { effort: req.effort ?? aiEnv.effort, format: { type: "json_schema", schema: req.schema } },
      });
      out.model = res.model;
      out.inputTokens += res.usage.input_tokens + (res.usage.cache_creation_input_tokens ?? 0) + (res.usage.cache_read_input_tokens ?? 0);
      out.outputTokens += res.usage.output_tokens;
      out.webSearchRequests! += res.usage.server_tool_use?.web_search_requests ?? 0;
      out.webFetchRequests! += res.usage.server_tool_use?.web_fetch_requests ?? 0;
      out.stopReason = res.stop_reason;
      for (const b of res.content) {
        if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
          for (const r of b.content) out.searchHits!.push({ url: r.url, title: r.title, pageAge: r.page_age ?? null });
        }
        if (b.type === "web_fetch_tool_result" && b.content.type === "web_fetch_result") {
          const src = b.content.content.source;
          out.fetchedPages!.push({ url: b.content.url, title: b.content.content.title, text: src.type === "text" ? src.data : "", retrievedAt: b.content.retrieved_at });
        }
      }
      const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
      if (res.stop_reason !== "pause_turn") {
        out.text = text;
        break;
      }
      messages.push({ role: "assistant", content: res.content as Anthropic.Messages.ContentBlockParam[] });
    }
    return out;
  }
}

let shared: AnthropicClient | null = null;

/** The real client, or null when no API key is configured. */
export function defaultClient(): AiClient | null {
  if (!aiEnv.apiKey) return null;
  shared ??= new AnthropicClient(aiEnv.apiKey);
  return shared;
}
