import {
  SlotPanelPosition,
  type SettingField,
  type SlotPlugin,
} from "../../../../types";
import { getSettings, asString } from "../../../../utils/plugin-settings";

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
    description: "Model name (e.g. gpt-4o-mini, llama3, mistral)",
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
  enabled: boolean;
  baseUrl: string;
  model: string;
  apiKey: string;
  timeoutMs: number;
  systemPrompt: string;
}

export async function getAISummarySettings(): Promise<AISummarySettings> {
  const stored = await getSettings(AI_SUMMARY_ID);
  const timeoutSeconds =
    parseFloat(asString(stored["timeoutSeconds"]) || "") || 30;
  return {
    enabled: asString(stored["enabled"]) === "true",
    baseUrl: asString(stored["baseUrl"]),
    model: asString(stored["model"]),
    apiKey: asString(stored["apiKey"]),
    timeoutMs: Math.max(5, timeoutSeconds) * 1000,
    systemPrompt: asString(stored["systemPrompt"]),
  };
}

interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenAIChatResponse {
  choices?: { message?: { content?: string } }[];
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
  maxTokens = 256,
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
        max_tokens: maxTokens,
      }),
      signal: AbortSignal.timeout(settings.timeoutMs),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as OpenAIChatResponse;
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}

export async function generateAISummary(
  query: string,
  results: { title: string; url: string; snippet: string }[],
): Promise<string | null> {
  const settings = await getAISummarySettings();
  if (!settings.enabled || !settings.baseUrl || !settings.model) return null;

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
  if (!settings.enabled || !settings.baseUrl || !settings.model) return null;
  return chatComplete(settings, history, 512);
}

const aiSummarySlot: SlotPlugin = {
  id: AI_SUMMARY_ID,
  settingsId: AI_SUMMARY_ID,
  name: "AI Summary",
  description:
    "Replaces At a Glance with a brief AI-generated summary using any OpenAI-compatible provider",
  position: SlotPanelPosition.AtAGlance,
  async trigger(): Promise<boolean> {
    const settings = await getAISummarySettings();
    return settings.enabled && !!settings.baseUrl && !!settings.model;
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
        '<span class="glance-ai-badge">AI Summary</span>' +
        '<button class="glance-ai-dive" type="button">Dive deeper</button>' +
        "</div>" +
        '<div class="glance-ai-chat" hidden>' +
        '<textarea class="glance-ai-input" placeholder="Ask a follow-up\u2026" rows="1"></textarea>' +
        "</div>" +
        "</div>",
    };
  },
  settingsSchema: aiSummarySettingsSchema,
};

export const slot = aiSummarySlot;
