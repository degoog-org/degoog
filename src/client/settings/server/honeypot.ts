import { getBase } from "../../utils/base-url";
import { authHeaders } from "../../utils/request";

const t = window.scopedT("core");

const _fmtDate = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
};

const _appendEmpty = (wrap: HTMLElement): void => {
  const empty = document.createElement("p");
  empty.className = "settings-desc";
  empty.textContent = t("settings-page.server.honeypot-blocklist-empty");
  wrap.appendChild(empty);
};

const _loadBlocklist = async (getToken: () => string | null): Promise<void> => {
  const wrap = document.getElementById("settings-honeypot-blocklist-rows");
  if (!wrap) return;
  try {
    const res = await fetch(`${getBase()}/api/settings/honeypot/blocklist`, {
      headers: authHeaders(getToken),
    });
    if (!res.ok) return;
    const data = (await res.json()) as {
      entries: { ip: string; time: string }[];
      banHours: number;
    };
    wrap.innerHTML = "";
    if (data.entries.length === 0) {
      _appendEmpty(wrap);
      return;
    }
    for (const entry of data.entries) {
      const row = document.createElement("div");
      row.className = "settings-honeypot-ban-entry";

      const info = document.createElement("span");
      info.className = "settings-proxy-urls-label";
      const banned = new Date(entry.time);
      const expiry =
        data.banHours > 0
          ? _fmtDate(new Date(banned.getTime() + data.banHours * 3_600_000))
          : t("settings-page.server.honeypot-ban-permanent");
      info.textContent = `${entry.ip} - ${t("settings-page.server.honeypot-ban-since")} ${_fmtDate(banned)} · ${t("settings-page.server.honeypot-ban-expires")} ${expiry}`;

      const unbanBtn = document.createElement("button");
      unbanBtn.type = "button";
      unbanBtn.className = "degoog-btn degoog-btn--sm degoog-btn--danger";
      unbanBtn.ariaLabel = t("settings-page.server.honeypot-unban");
      unbanBtn.innerHTML = `<i class="fa-solid fa-trash"></i>`;
      unbanBtn.addEventListener("click", async () => {
        try {
          await fetch(`${getBase()}/api/settings/honeypot/unban`, {
            method: "POST",
            headers: {
              ...authHeaders(getToken),
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ ip: entry.ip }),
          });
          row.remove();
          if (!wrap.querySelector(".settings-honeypot-ban-entry")) {
            _appendEmpty(wrap);
          }
        } catch {}
      });

      row.append(info, unbanBtn);
      wrap.appendChild(row);
    }
  } catch {}
};

export const initHoneypot = (getToken: () => string | null): void => {
  void _loadBlocklist(getToken);

  document
    .getElementById("settings-honeypot-ban-add")
    ?.addEventListener("click", async () => {
      const input = document.getElementById(
        "settings-honeypot-ban-ip",
      ) as HTMLInputElement | null;
      const ip = input?.value.trim() ?? "";
      if (!ip) return;
      try {
        const res = await fetch(`${getBase()}/api/settings/honeypot/ban`, {
          method: "POST",
          headers: {
            ...authHeaders(getToken),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ip }),
        });
        if (res.ok) {
          if (input) input.value = "";
          await _loadBlocklist(getToken);
        }
      } catch {}
    });
};
