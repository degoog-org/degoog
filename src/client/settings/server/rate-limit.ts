import { el } from "./fields";

export const getRateLimitPayload = (): Record<string, string> => {
  const enabled = el("rate-limit-enabled")?.checked;
  const payload: Record<string, string> = {
    rateLimitEnabled: enabled ? "true" : "false",
  };

  if (enabled) {
    const _rl = (id: string) => {
      const input = el(id);
      return input?.value.trim() || input?.placeholder || "";
    };
    Object.assign(payload, {
      rateLimitBurstWindow: _rl("rate-limit-burst-window"),
      rateLimitBurstMax: _rl("rate-limit-burst-max"),
      rateLimitLongWindow: _rl("rate-limit-long-window"),
      rateLimitLongMax: _rl("rate-limit-long-max"),
    });

    const suggestEnabled = el("rate-limit-suggest-enabled")?.checked;
    payload.rateLimitSuggestEnabled = suggestEnabled ? "true" : "false";
    if (suggestEnabled) {
      Object.assign(payload, {
        rateLimitSuggestBurstWindow: _rl("rate-limit-suggest-burst-window"),
        rateLimitSuggestBurstMax: _rl("rate-limit-suggest-burst-max"),
        rateLimitSuggestLongWindow: _rl("rate-limit-suggest-long-window"),
        rateLimitSuggestLongMax: _rl("rate-limit-suggest-long-max"),
      });
    }
    payload.acDebounceMs = _rl("ac-debounce-ms");
  }

  return payload;
};
