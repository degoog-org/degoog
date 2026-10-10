import { authHeaders } from "../../utils/net/request";
import { getBase } from "../../utils/net/base-url";
import {
  isRestartState,
  type RestartState,
} from "../../../shared/restart-state";

// Server reasons read `plugin "Name" was installed`; this turns them into `Plugin - Name`.
const REASON_RE = /^(\w+) "(.+)" was \w+$/;

export const parseReason = (
  reason: string,
): { type: string; name: string } | null => {
  const parsed = REASON_RE.exec(reason);
  return parsed ? { type: parsed[1], name: parsed[2] } : null;
};

export const formatReason = (reason: string): string => {
  const parsed = parseReason(reason);
  if (!parsed) return reason;
  return `${parsed.type[0].toUpperCase()}${parsed.type.slice(1)} - ${parsed.name}`;
};

// Null means "unknown", so callers leave the restart hints hidden instead of guessing.
export const fetchRestartState = async (
  getToken: () => string | null,
): Promise<RestartState | null> => {
  try {
    const res = await fetch(`${getBase()}/api/settings/restart-state`, {
      headers: authHeaders(getToken),
    });
    if (!res.ok) return null;
    const payload: unknown = await res.json();
    if (!isRestartState(payload)) {
      console.debug("[settings] restart state payload invalid", payload);
      return null;
    }
    return payload;
  } catch (err) {
    console.debug("[settings] restart state fetch failed", err);
    return null;
  }
};
