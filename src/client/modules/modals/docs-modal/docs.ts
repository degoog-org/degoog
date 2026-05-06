import { getStoredToken } from "../../settings/settings";
import { jsonHeaders } from "../../../utils/request";
import { getBase } from "../../../utils/base-url";

let overlay: HTMLDivElement | null = null;
let titleEl: HTMLHeadingElement | null = null;
let bodyEl: HTMLDivElement | null = null;
let closeBtn: HTMLButtonElement | null = null;

function _ensureMounted(): void {
  if (overlay) return;

  overlay = document.createElement("div");
  overlay.className = "ext-modal-overlay";
  overlay.id = "ext-docs-overlay";
  overlay.style.display = "none";

  const modal = document.createElement("div");
  modal.className = "ext-modal ext-docs-modal";
  modal.id = "ext-docs-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "ext-docs-title");

  const header = document.createElement("div");
  header.className = "ext-modal-header";
  titleEl = document.createElement("h2");
  titleEl.className = "ext-modal-title";
  titleEl.id = "ext-docs-title";
  closeBtn = document.createElement("button");
  closeBtn.className = "ext-modal-close";
  closeBtn.type = "button";
  closeBtn.innerHTML = "&times;";
  header.append(titleEl, closeBtn);

  bodyEl = document.createElement("div");
  bodyEl.className = "ext-modal-body ext-docs-body";
  bodyEl.id = "ext-docs-body";

  modal.append(header, bodyEl);
  overlay.append(modal);
  document.body.appendChild(overlay);

  closeBtn.addEventListener("click", closeDocs);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeDocs();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay?.style.display === "flex") closeDocs();
  });
}

export function closeDocs(): void {
  if (overlay) overlay.style.display = "none";
  if (bodyEl) bodyEl.textContent = "";
}

export async function openExtensionDocs(options: {
  id: string;
  title: string;
}): Promise<void> {
  _ensureMounted();
  if (titleEl) titleEl.textContent = options.title;
  if (bodyEl) bodyEl.textContent = "Loading…";
  if (overlay) overlay.style.display = "flex";

  try {
    const res = await fetch(
      `${getBase()}/api/extensions/${encodeURIComponent(options.id)}/readme`,
      { headers: jsonHeaders(getStoredToken) },
    );
    if (!res.ok) throw new Error("Failed");
    const data = (await res.json()) as { markdown?: string };
    const markdown = typeof data.markdown === "string" ? data.markdown : "";

    const [{ marked }, { default: DOMPurify }] = await Promise.all([
      import("marked"),
      import("dompurify"),
    ]);

    const html = marked.parse(markdown, { breaks: true }) as string;
    const safe = DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true },
    }) as string;

    if (bodyEl) bodyEl.innerHTML = safe || "<p>(Empty README)</p>";
  } catch {
    if (bodyEl)
      bodyEl.innerHTML = '<p class="ext-docs-error">Failed to load docs.</p>';
  }

  setTimeout(() => closeBtn?.focus(), 0);
}

