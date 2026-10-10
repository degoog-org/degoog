import { render } from "../../../shared/ui/tribute/dom";
import { getBase } from "../../utils/net/base-url";
import { authHeaders } from "../../utils/net/request";
import { BanList, type BanListEntry } from "./ban-list";

const t = window.scopedT("core");

const SHOWN_BANS = 8;

interface BlocklistResponse {
  entries: { ip: string; time: string }[];
  banHours: number;
}

const _fmtDate = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
};

const _meta = (time: string, banHours: number): string => {
  const banned = new Date(time);
  const expiry =
    banHours > 0
      ? _fmtDate(new Date(banned.getTime() + banHours * 3_600_000))
      : t("settings-page.server.honeypot-ban-permanent");
  return `${t("settings-page.server.honeypot-ban-since")} ${_fmtDate(banned)} · ${t("settings-page.server.honeypot-ban-expires")} ${expiry}`;
};

export const initHoneypot = (getToken: () => string | null): void => {
  const wrap = document.getElementById("settings-honeypot-blocklist-rows");
  const input = document.getElementById("settings-honeypot-ban-ip") as HTMLInputElement | null;
  const count = document.getElementById("settings-honeypot-ban-count");
  if (!wrap || !input) return;

  let entries: BanListEntry[] = [];
  let showAll = false;

  const draw = (): void => {
    const needle = input.value.trim();
    const matching = needle ? entries.filter((e) => e.ip.includes(needle)) : entries;
    if (count) {
      count.textContent = entries.length
        ? t("settings-page.server.honeypot-ban-count", { count: String(entries.length) })
        : "";
    }
    render(
      <BanList
        entries={matching}
        showAll={showAll || needle !== ""}
        limit={SHOWN_BANS}
        onUnban={(ip) => void unban(ip)}
        onShowAll={() => {
          showAll = true;
          draw();
        }}
      />,
      wrap,
    );
  };

  const load = async (): Promise<void> => {
    try {
      const res = await fetch(`${getBase()}/api/settings/honeypot/blocklist`, {
        headers: authHeaders(getToken),
      });
      if (!res.ok) return;
      const data = (await res.json()) as BlocklistResponse;
      entries = data.entries.map((e) => ({ ip: e.ip, meta: _meta(e.time, data.banHours) }));
      draw();
    } catch (err) {
      console.warn("[settings] honeypot blocklist load failed", err);
    }
  };

  const unban = async (ip: string): Promise<void> => {
    try {
      const res = await fetch(`${getBase()}/api/settings/honeypot/unban`, {
        method: "POST",
        headers: { ...authHeaders(getToken), "Content-Type": "application/json" },
        body: JSON.stringify({ ip }),
      });
      if (!res.ok) return;
      entries = entries.filter((e) => e.ip !== ip);
      draw();
    } catch (err) {
      console.warn("[settings] honeypot unban failed", err);
    }
  };

  const ban = async (): Promise<void> => {
    const ip = input.value.trim();
    if (!ip) return;
    try {
      const res = await fetch(`${getBase()}/api/settings/honeypot/ban`, {
        method: "POST",
        headers: { ...authHeaders(getToken), "Content-Type": "application/json" },
        body: JSON.stringify({ ip }),
      });
      if (!res.ok) return;
      input.value = "";
      await load();
    } catch (err) {
      console.warn("[settings] honeypot ban failed", err);
    }
  };

  input.addEventListener("input", draw);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void ban();
    }
  });
  document.getElementById("settings-honeypot-ban-add")?.addEventListener("click", () => void ban());
  void load();
};
