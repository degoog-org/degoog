import {
  SlotPanelPosition,
  TranslateFunction,
  type SettingField,
  type SlotPlugin,
} from "../../../../types";
import { logger } from "../../../../utils/logger";
import { asString, getSettings } from "../../../../utils/plugin-settings";

export const AI_SUMMARY_ID = "ai-summary";

export const aiSummarySettingsSchema: SettingField[] = [
  {
    key: "baseUrl",
    label: "API Base URL",
    type: "url",
    required: true,
    placeholder: "https://api.openai.com/v1",
    description:
      "OpenAI-compatible base URL. Use http://localhost:11434/v1 for Ollama",
  },
  {
    key: "model",
    label: "Model",
    type: "text",
    required: true,
    placeholder: "gpt-4o-mini",
    description:
      "Model name (e.g. gpt-4o-mini, llama3, mistral). Note: reasoning/thinking models (e.g. qwen3, deepseek-r1) may not work well here as their chain-of-thought consumes the token budget before producing a summary. Increase Max Tokens if you must use one.",
  },
  {
    key: "apiKey",
    label: "API Key",
    type: "password",
    secret: true,
    placeholder: "Leave blank for local models (Ollama)",
    description: "API key for the provider. Not required for local Ollama.",
  },
  {
    key: "timeoutSeconds",
    label: "Timeout (seconds)",
    type: "text",
    placeholder: "30",
    description:
      "Max seconds to wait for an AI response before falling back to the standard result.",
  },
  {
    key: "maxTokens",
    label: "Max Tokens",
    type: "text",
    placeholder: "256",
    description:
      "Maximum tokens for the AI response. Bump this up (e.g. 1024+) if you use reasoning/thinking models.",
  },
  {
    key: "systemPrompt",
    label: "Custom System Prompt",
    type: "textarea",
    placeholder:
      "You are a helpful assistant that summarises web search results. Write a concise 2–3 sentence summary answering the query based on the provided snippets. Do not invent facts. Do not include citations.",
    description:
      "Override the default system prompt sent to the AI. Leave blank to use the default.",
  },
];

export interface AISummarySettings {
  baseUrl: string;
  model: string;
  apiKey: string;
  timeoutMs: number;
  systemPrompt: string;
  maxTokens: number;
}

export async function getAISummarySettings(): Promise<AISummarySettings> {
  const stored = await getSettings(AI_SUMMARY_ID);
  const timeoutSeconds =
    parseFloat(asString(stored["timeoutSeconds"]) || "") || 30;
  const maxTokens =
    parseInt(asString(stored["maxTokens"]) || "", 10) || 256;
  return {
    baseUrl: asString(stored["baseUrl"]),
    model: asString(stored["model"]),
    apiKey: asString(stored["apiKey"]),
    timeoutMs: Math.max(5, timeoutSeconds) * 1000,
    systemPrompt: asString(stored["systemPrompt"]),
    maxTokens: Math.max(16, maxTokens),
  };
}

interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenAIChatResponse {
  choices?: {
    message?: { content?: string; reasoning_content?: string };
    finish_reason?: string;
  }[];
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const DEFAULT_SYSTEM_PROMPT =
  "You are a helpful assistant that summarises web search results. Write a concise 2–3 sentence summary answering the query based on the provided snippets. Do not invent facts. Do not include citations.";

async function chatComplete(
  settings: AISummarySettings,
  messages: OpenAIMessage[],
  maxTokens?: number,
): Promise<string | null> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (settings.apiKey) headers["Authorization"] = `Bearer ${settings.apiKey}`;

  try {
    const res = await fetch(`${settings.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: settings.model,
        messages,
        max_tokens: maxTokens ?? settings.maxTokens,
      }),
      signal: AbortSignal.timeout(settings.timeoutMs),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as OpenAIChatResponse;
    const choice = data.choices?.[0];
    const content = choice?.message?.content?.trim();
    const reasoning = choice?.message?.reasoning_content?.trim();
    if (content) return content;
    if (reasoning) {
      logger.debug(
        AI_SUMMARY_ID,
        `empty content, falling back to reasoning_content (finish_reason=${choice?.finish_reason}). Consider increasing Max Tokens.`,
      );
      return reasoning;
    }
    logger.debug(
      AI_SUMMARY_ID,
      `model returned empty content and reasoning_content (finish_reason=${choice?.finish_reason}).`,
    );
    return null;
  } catch {
    return null;
  }
}

export async function generateAISummary(
  query: string,
  results: { title: string; url: string; snippet: string }[],
): Promise<string | null> {
  const settings = await getAISummarySettings();
  if (!settings.baseUrl || !settings.model) return null;

  const context = results
    .slice(0, 6)
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.snippet}`)
    .join("\n\n");

  const messages: OpenAIMessage[] = [
    {
      role: "system",
      content: settings.systemPrompt || DEFAULT_SYSTEM_PROMPT,
    },
    {
      role: "user",
      content: `Query: ${query}\n\nSearch results:\n${context}`,
    },
  ];

  return chatComplete(settings, messages);
}

export async function chatFollowUp(
  history: OpenAIMessage[],
): Promise<string | null> {
  const settings = await getAISummarySettings();
  if (!settings.baseUrl || !settings.model) return null;
  return chatComplete(settings, history, Math.max(settings.maxTokens, 512));
}

const aiSummarySlot: SlotPlugin = {
  id: AI_SUMMARY_ID,
  settingsId: AI_SUMMARY_ID,
  name: "AI Summary",
  waitForResults: true,
  get description(): string {
    return this.t!("ai-summary.description");
  },
  position: SlotPanelPosition.AtAGlance,

  t: TranslateFunction,

  async trigger(): Promise<boolean> {
    const settings = await getAISummarySettings();
    return !!settings.baseUrl && !!settings.model;
  },
  async execute(query, context): Promise<{ title?: string; html: string }> {
    const results = context?.results ?? [];
    if (results.length === 0) return { html: "" };
    const summary = await generateAISummary(query, results);
    if (!summary) return { html: "" };
    return {
      html:
        '<div class="glance-ai">' +
        '<div class="glance-ai-messages">' +
        '<div class="glance-snippet">' +
        escapeHtml(summary) +
        "</div>" +
        "</div>" +
        '<div class="glance-ai-footer">' +
        `<span class="glance-ai-badge">${this.t!("ai-summary.badge")}</span>` +
        `<button class="glance-ai-dive" type="button">${this.t!("ai-summary.dive-deeper")}</button>` +
        "</div>" +
        '<div class="glance-ai-chat" hidden>' +
        `<textarea class="glance-ai-input" placeholder="${this.t!("ai-summary.follow-up-placeholder")}" rows="1"></textarea>` +
        "</div>" +
        "</div>",
    };
  },
  settingsSchema: aiSummarySettingsSchema,
};

export const slot = aiSummarySlot;
