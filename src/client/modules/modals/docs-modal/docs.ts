import { getStoredToken } from "../../settings/settings";
import { jsonHeaders } from "../../../utils/request";
import { getBase } from "../../../utils/base-url";
import { mountModalShell, type MountedModal } from "../../../../shared/ui/components/overlay/shell";

const MODAL_ID = "ext-docs";

let shell: MountedModal | null = null;

function _ensureMounted(): void {
  if (shell) return;

  shell = mountModalShell({
    id: MODAL_ID,
    wide: true,
    modalClass: "ext-docs-modal",
    bodyClass: "ext-docs-body",
  });

  shell.close.addEventListener("click", closeDocs);
  shell.overlay.addEventListener("click", (e) => {
    if (e.target === shell?.overlay) closeDocs();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && shell?.isOpen()) closeDocs();
  });
}

export function closeDocs(): void {
  shell?.hide();
  if (shell) shell.body.textContent = "";
}

export async function openExtensionDocs(options: {
  id: string;
  title: string;
}): Promise<void> {
  _ensureMounted();
  if (shell) {
    shell.title.textContent = options.title;
    shell.body.textContent = "Loading…";
    shell.open();
  }

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

    if (shell) shell.body.innerHTML = safe || "<p>(Empty README)</p>";
  } catch {
    if (shell)
      shell.body.innerHTML = '<p class="ext-docs-error">Failed to load docs.</p>';
  }

  setTimeout(() => shell?.close.focus(), 0);
}
