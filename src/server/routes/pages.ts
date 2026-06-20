import { Context, Hono } from "hono";
import { logger } from "../utils/logger";
import { SETTINGS_TABS } from "../../shared/settings-tabs";
import {
  getDefaultEngineConfig,
  listEngines,
} from "../extensions/engines/registry";
import { getThemeHtml } from "../extensions/themes/registry";
import * as cache from "../utils/cache";
import { getLocale } from "../utils/hono";
import { asBoolean } from "../utils/plugin-settings";
import { getAdminPath, isPublicInstance } from "../utils/public-instance";
import {
  canBalrogPass,
  hasGeneratedDefaultSettingsPassword,
  isDangerouslyNoPassword,
  isPasswordRequired,
  shouldServeSettingsGate,
  gandalf,
} from "./settings-auth";
import { ping, verifyToken } from "../utils/link-token";
import { getClientIp } from "../utils/request";
import { getBasePath, getBaseUrl } from "../utils/base-url";
import { FAKE_RESULTS } from "../../shared/fake-results";
import { getInstanceSettings } from "../utils/server-settings";
import {
  DEFAULT_THEME_DIR,
  applyPagePlaceholders,
  buildLayoutPage,
  buildPage,
  buildThemedLayoutPage,
  getCoreTranslator,
  getLayout,
  getTranslator,
  isFullDocument,
} from "./pages/render";

export { getCoreTranslator };

const BASE_URL = getBaseUrl();
const BASE_PATH = getBasePath();
const ADMIN_PATH = getAdminPath();

const router = new Hono();

function buildOpenSearchXml(origin: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <ShortName>degoog</ShortName>
  <Description>Search</Description>
  <InputEncoding>UTF-8</InputEncoding>
  <Image width="16" height="16" type="image/x-icon">${origin}/public/favicon/favicon.ico</Image>
  <Url type="text/html" template="${origin}/search?q={searchTerms}"/>
  <Url type="application/x-suggestions+json" template="${origin}/api/suggest/opensearch?q={searchTerms}"/>
</OpenSearchDescription>`;
}

router.get("/style/v/:token", async (c) => {
  const token = c.req.param("token");
  const ip = getClientIp(c);
  if (ip && verifyToken(token)) ping(ip);
  return new Response("", {
    status: 200,
    headers: { "Content-Type": "text/css", "Cache-Control": "no-store" },
  });
});

router.get("/", async (c) => {
  const q = c.req.query("q");
  if (q?.trim()) {
    const params = new URLSearchParams(c.req.url.split("?")[1] || "");
    return c.redirect(
      `${BASE_URL || BASE_PATH}/search?${params.toString()}`,
      302,
    );
  }
  const locale = getLocale(c);
  const override = await getThemeHtml("index");
  if (override) {
    if (isFullDocument(override)) {
      const t = await getTranslator(locale, true);
      return c.html(await applyPagePlaceholders(override, t, locale));
    }
    return c.html(await buildThemedLayoutPage(override, locale));
  }
  return c.html(await buildLayoutPage("index.html", locale));
});

const _buildResultActionsScript = async (c: Context): Promise<string> => {
  const token = canBalrogPass(c);
  const authenticated = await gandalf(token);
  let blockUi = false;
  let replaceUi = false;
  let scoreUi = false;
  if (authenticated) {
    const settings = await getInstanceSettings();
    blockUi = asBoolean(settings.domainBlockUiEnabled);
    replaceUi = asBoolean(settings.domainReplaceUiEnabled);
    scoreUi = asBoolean(settings.domainScoreUiEnabled);
  }
  const payload = JSON.stringify({
    authenticated,
    blockUi,
    replaceUi,
    scoreUi,
  }).replace(/<\//g, "<\\/");
  return `<script>window.__DEGOOG_RESULT_ACTIONS__=${payload}</script>`;
};

const _injectIntoHead = (html: string, fragment: string): string => {
  if (html.includes("</head>")) {
    return html.replace("</head>", `${fragment}\n  </head>`);
  }
  return `${fragment}\n${html}`;
};

const _escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const _buildSettingsGatePage = async (locale?: string): Promise<string> => {
  const html = await buildPage("settings-gate.html", locale);
  const t = await getCoreTranslator();
  const note = hasGeneratedDefaultSettingsPassword()
    ? `<p class="settings-auth-help">${_escapeHtml(t("settings-page.gate.generated-password-note", undefined, locale))}</p>`
    : "";
  return html.replace("__SETTINGS_AUTH_DEFAULT_PASSWORD_NOTE__", note);
};

router.get("/search", async (c) => {
  const locale = getLocale(c);
  const override = await getThemeHtml("search");
  const actionsScript = await _buildResultActionsScript(c);
  let html: string;
  if (override) {
    if (isFullDocument(override)) {
      const t = await getTranslator(locale, true);
      html = await applyPagePlaceholders(override, t, locale);
    } else {
      html = await buildThemedLayoutPage(override, locale, "has-results");
    }
  } else {
    html = await buildLayoutPage("search.html", locale, "has-results");
  }
  return c.html(_injectIntoHead(html, actionsScript));
});

router.get("/settings/", (c) =>
  c.redirect(`${BASE_URL || BASE_PATH}/settings`, 301),
);
router.get("/settings", async (c) => {
  const locale = getLocale(c);
  if (isPublicInstance())
    return c.html(await buildPage("settings-public.html", locale));
  if (ADMIN_PATH !== "settings")
    return c.redirect(`${BASE_URL || BASE_PATH}/${ADMIN_PATH}`, 302);
  if (await shouldServeSettingsGate(c)) {
    return c.html(await _buildSettingsGatePage(locale));
  }
  return c.html(await buildPage("settings.html", locale));
});

router.get("/settings/:tab", async (c) => {
  if (isPublicInstance())
    return c.redirect(`${BASE_URL || BASE_PATH}/settings`, 302);
  const tab = c.req.param("tab");
  if (ADMIN_PATH !== "settings") {
    const dest = (SETTINGS_TABS as readonly string[]).includes(tab)
      ? `${BASE_URL || BASE_PATH}/${ADMIN_PATH}/${tab}`
      : `${BASE_URL || BASE_PATH}/${ADMIN_PATH}`;
    return c.redirect(dest, 302);
  }
  if (!(SETTINGS_TABS as readonly string[]).includes(tab)) {
    return c.redirect(`${BASE_URL || BASE_PATH}/settings`, 302);
  }
  const locale = getLocale(c);
  if (await shouldServeSettingsGate(c)) {
    return c.html(await _buildSettingsGatePage(locale));
  }
  return c.html(await buildPage("settings.html", locale));
});

const _adminPaths = [ADMIN_PATH].filter((p) => p !== "settings");

for (const ap of _adminPaths) {
  router.get(`/${ap}/`, (c) =>
    c.redirect(`${BASE_URL || BASE_PATH}/${ap}`, 301),
  );

  router.get(`/${ap}`, async (c) => {
    if (isPublicInstance() && !isPasswordRequired() && !isDangerouslyNoPassword())
      return c.text("Not Found", 404);
    const locale = getLocale(c);
    if (await shouldServeSettingsGate(c)) {
      return c.html(await _buildSettingsGatePage(locale));
    }
    return c.html(await buildPage("settings.html", locale));
  });

  router.get(`/${ap}/:tab`, async (c) => {
    if (isPublicInstance() && !isPasswordRequired() && !isDangerouslyNoPassword())
      return c.text("Not Found", 404);
    const tab = c.req.param("tab");
    if (!(SETTINGS_TABS as readonly string[]).includes(tab)) {
      return c.redirect(`${BASE_URL || BASE_PATH}/${ap}`, 302);
    }
    const locale = getLocale(c);
    if (await shouldServeSettingsGate(c)) {
      return c.html(await _buildSettingsGatePage(locale));
    }
    return c.html(await buildPage("settings.html", locale));
  });
}

router.get("/api/engines", async (c) => {
  return c.json({
    engines: await listEngines(),
    defaults: getDefaultEngineConfig(),
  });
});

router.get("/opensearch.xml", (c) => {
  const proto =
    c.req.header("x-forwarded-proto") ||
    new URL(c.req.url).protocol.replace(":", "");
  const host =
    c.req.header("x-forwarded-host") ||
    c.req.header("host") ||
    new URL(c.req.url).host;
  const basePath = BASE_URL
    ? (() => {
        try {
          return new URL(BASE_URL).pathname.replace(/\/+$/, "");
        } catch (err) {
          logger.debug("pages", `invalid DEGOOG_BASE_URL "${BASE_URL}"`, err);
          return BASE_URL;
        }
      })()
    : "";
  return c.body(buildOpenSearchXml(`${proto}://${host}${basePath}`), 200, {
    "Content-Type": "application/opensearchdescription+xml; charset=utf-8",
  });
});

router.post("/api/cache/clear", async (c) => {
  const token = canBalrogPass(c);
  if (!(await gandalf(token)))
    return c.json({ error: "You shall not pass!" }, 401);
  const requested = c.req.query("scope") ?? cache.CACHE_SCOPE.ALL;
  if (!cache.isCacheScope(requested)) {
    return c.json(
      {
        error: `Invalid scope. Expected one of: ${Object.values(cache.CACHE_SCOPE).join(", ")}`,
      },
      400,
    );
  }
  const cleared = await cache.clearByScope(requested);
  return c.json({ ok: true, scope: requested, cleared });
});

const renderTakeoverResults = (): string =>
  FAKE_RESULTS.map(
    (r) => `
    <div class="result-item degoog-result">
      <div class="result-item-inner degoog-result--inner">
        <div class="result-body degoog-result--body">
          <div class="result-url-row degoog-result--url-row">
            <cite class="result-cite degoog-result--cite">${r.url}</cite>
          </div>
          <a class="result-title degoog-result--title" href="${r.url}" rel="noopener noreferrer" target="_blank">${r.title}</a>
          <p class="result-snippet degoog-result--snippet">${r.snippet}</p>
        </div>
      </div>
    </div>`,
  ).join("\n");

router.get("/robots-takeover", async (c) => {
  const locale = getLocale(c);
  const override = await getThemeHtml("robots-takeover");
  const raw =
    override ??
    (await Bun.file(
      `${DEFAULT_THEME_DIR}/easter-eggs/robots-takeover.html`,
    ).text());
  const withResults = raw.replace(
    "__ROBOTS_RESULTS__",
    renderTakeoverResults(),
  );
  const layout = await getLayout();
  const html = layout
    .replace("__PAGE_CONTENT__", withResults)
    .replace("__BODY_CLASS__", 'class="has-results"');
  const t = await getTranslator(locale, !!override);
  return c.html(await applyPagePlaceholders(html, t, locale));
});

export const build404 = async (locale?: string): Promise<string> => {
  const override = await getThemeHtml("404");
  if (override) return buildThemedLayoutPage(override, locale);
  return buildLayoutPage("404.html", locale);
};

export const buildGandalf = async (locale?: string): Promise<string> => {
  const override = await getThemeHtml("gandalf");
  if (override) return buildThemedLayoutPage(override, locale);
  return buildLayoutPage("easter-eggs/gandalf.html", locale);
};

export default router;
