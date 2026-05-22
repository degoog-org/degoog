import type { PopoverAnchor } from "./dom";

export interface WizardStepLink {
  href: string;
  labelKey: string;
}

export interface WizardStep {
  tab?: string;
  selector?: string;
  titleKey: string;
  bodyKey: string;
  hintKey?: string;
  onEnter?: () => void | Promise<void>;
  navigateOnNext?: () => string | null;
  interactive?: boolean;
  popoverAnchor?: PopoverAnchor;
  liveCountSelector?: string;
  requireMin?: number;
  link?: WizardStepLink;
}

const setStoreFilter = (value: string): void => {
  const select =
    document.querySelector<HTMLSelectElement>(".store-filter-type");
  if (!select) return;
  if (select.value === value) return;
  select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
};

const settingsHref = (): string | null => {
  const link = document.getElementById(
    "nav-settings-top",
  ) as HTMLAnchorElement | null;
  if (!link) return null;
  return `${link.pathname}/store`;
};

const COMMUNITY_EXTENSIONS_URL =
  "https://degoog-org.github.io/community-extensions/";

const INSTALLED_GRID_SELECTOR = ".store-catalog-grid .store-btn-uninstall";

export const HOME_STEPS: readonly WizardStep[] = [
  {
    titleKey: "settings-page.wizard.welcome-title",
    bodyKey: "settings-page.wizard.welcome-body",
  },
  {
    selector: "#search-input",
    titleKey: "settings-page.wizard.search-title",
    bodyKey: "settings-page.wizard.search-body",
  },
  {
    selector: "#nav-settings-top",
    titleKey: "settings-page.wizard.goto-settings-title",
    bodyKey: "settings-page.wizard.goto-settings-body",
    navigateOnNext: settingsHref,
  },
] as const;

const storeInstallStep = (
  type: string,
  titleKey: string,
  bodyKey: string,
  hintKey?: string,
  extras: Partial<WizardStep> = {},
): WizardStep => ({
  tab: "store",
  selector: ".store-catalog-section",
  titleKey,
  bodyKey,
  hintKey,
  onEnter: () => setStoreFilter(type),
  interactive: true,
  popoverAnchor: "bottom-right",
  ...extras,
});

export const SETTINGS_STEPS: readonly WizardStep[] = [
  {
    tab: "store",
    selector: ".store-repos-header",
    titleKey: "settings-page.wizard.store-repos-title",
    bodyKey: "settings-page.wizard.store-repos-body",
    interactive: true,
    popoverAnchor: "bottom-right",
    link: {
      href: COMMUNITY_EXTENSIONS_URL,
      labelKey: "settings-page.wizard.store-repos-link",
    },
  },
  storeInstallStep(
    "engine",
    "settings-page.wizard.store-engines-title",
    "settings-page.wizard.store-engines-body",
    "settings-page.wizard.store-engines-hint",
    {
      liveCountSelector: INSTALLED_GRID_SELECTOR,
      requireMin: 1,
    },
  ),
  storeInstallStep(
    "autocomplete",
    "settings-page.wizard.store-autocomplete-title",
    "settings-page.wizard.store-autocomplete-body",
    "settings-page.wizard.store-autocomplete-hint",
    { liveCountSelector: INSTALLED_GRID_SELECTOR },
  ),
  storeInstallStep(
    "theme",
    "settings-page.wizard.store-themes-title",
    "settings-page.wizard.store-themes-body",
  ),
  storeInstallStep(
    "plugin",
    "settings-page.wizard.store-plugins-title",
    "settings-page.wizard.store-plugins-body",
  ),
  storeInstallStep(
    "transport",
    "settings-page.wizard.store-transports-title",
    "settings-page.wizard.store-transports-body",
  ),
  {
    tab: "engines",
    selector: '.settings-nav-item[data-tab="engines"]',
    titleKey: "settings-page.wizard.engines-title",
    bodyKey: "settings-page.wizard.engines-body",
    interactive: true,
    popoverAnchor: "bottom-right",
  },
  {
    tab: "autocomplete",
    selector: '.settings-nav-item[data-tab="autocomplete"]',
    titleKey: "settings-page.wizard.autocomplete-title",
    bodyKey: "settings-page.wizard.autocomplete-body",
    interactive: true,
    popoverAnchor: "bottom-right",
  },
  {
    tab: "server",
    selector: '.settings-nav-item[data-tab="server"]',
    titleKey: "settings-page.wizard.server-title",
    bodyKey: "settings-page.wizard.server-body",
    interactive: true,
    popoverAnchor: "bottom-right",
  },
  {
    titleKey: "settings-page.wizard.done-title",
    bodyKey: "settings-page.wizard.done-body",
  },
] as const;
