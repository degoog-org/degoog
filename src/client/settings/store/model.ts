import { OFFICIAL_REPO_URL } from "../../../shared/official-repo";
import type {
  RepoInfo,
  StoreItem,
  StoreItemType,
  StoreState,
  StoreStatus,
} from "../../types/store-tab";
import { normalizeRepoUrl } from "./render/repo-url";

export const STORE_KINDS: readonly StoreItemType[] = [
  "engine",
  "plugin",
  "transport",
  "autocomplete",
  "favicon",
  "shortcut",
  "theme",
];

export const itemId = (item: StoreItem): string =>
  `${item.repoUrl}::${item.path}::${item.type}`;

export const repoKey = (url: string): string => normalizeRepoUrl(url);

export const isOfficial = (repo: RepoInfo): boolean =>
  repoKey(repo.url) === repoKey(OFFICIAL_REPO_URL);

export const repoBehind = (state: StoreState, repo: RepoInfo): number =>
  repo.error ? 0 : (state.behind[repoKey(repo.url)] ?? 0);

export const findRepo = (
  state: StoreState,
  url: string,
): RepoInfo | undefined => {
  const key = repoKey(url);
  return state.repos.find((r) => repoKey(r.url) === key);
};

export const isInstalled = (item: StoreItem): boolean => item.installed;

export const hasUpdate = (item: StoreItem): boolean =>
  item.installed && !item.orphaned && !!item.updateAvailable;

export const inCatalog = (state: StoreState, item: StoreItem): boolean =>
  !item.orphaned && !!findRepo(state, item.repoUrl);

export const itemSubtypes = (item: StoreItem): string[] => {
  if (item.type === "plugin") return item.pluginType ? [item.pluginType] : [];
  if (item.type === "engine")
    return item.engineTypes ?? (item.engineType ? [item.engineType] : []);
  return [];
};

export const repoItems = (state: StoreState, repo: RepoInfo): StoreItem[] => {
  const key = repoKey(repo.url);
  return state.items.filter((i) => !i.orphaned && repoKey(i.repoUrl) === key);
};

export const sortByName = (a: { name: string }, b: { name: string }): number =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

export const sortItems = (a: StoreItem, b: StoreItem): number =>
  (a.orphaned ? 1 : 0) - (b.orphaned ? 1 : 0) || sortByName(a, b);

export const scopeItems = (state: StoreState): StoreItem[] =>
  state.view === "installed"
    ? state.items.filter(isInstalled)
    : state.items.filter((i) => inCatalog(state, i));

export const inRepoSelection = (state: StoreState, item: StoreItem): boolean =>
  !state.repoSel.length || state.repoSel.includes(repoKey(item.repoUrl));

const _matchesQuery = (item: StoreItem, q: string, sub: string): boolean =>
  !q ||
  [item.name, item.description, item.author?.name, item.repoName, sub].some(
    (v) => !!v && v.toLowerCase().includes(q),
  );

const _passesStatus = (item: StoreItem, status: StoreStatus): boolean => {
  if (status === "installed") return isInstalled(item);
  if (status === "available") return !isInstalled(item);
  if (status === "updates") return hasUpdate(item);
  if (status === "orphaned") return !!item.orphaned;
  return true;
};

export const passes = (
  state: StoreState,
  item: StoreItem,
  subLabel: string,
  withKind = true,
): boolean => {
  if (!inRepoSelection(state, item)) return false;
  if (!_passesStatus(item, state.status)) return false;
  if (withKind && state.kind !== "all" && item.type !== state.kind)
    return false;
  if (withKind && state.sub && !itemSubtypes(item).includes(state.sub))
    return false;
  return _matchesQuery(item, state.q.trim().toLowerCase(), subLabel);
};

export const kindSubtypes = (state: StoreState): string[] => {
  if (state.kind !== "engine" && state.kind !== "plugin") return [];
  const set = new Set<string>();
  for (const item of scopeItems(state)) {
    if (item.type === state.kind) itemSubtypes(item).forEach((s) => set.add(s));
  }
  return [...set];
};

export const restartPending = (state: StoreState, item: StoreItem): boolean =>
  state.restartReasons.some((reason) =>
    reason.startsWith(`${item.type} "${item.name}" `),
  );
