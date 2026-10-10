import { FilterSummary } from "../../../shared/filter/filter-summary";
import { findRepo } from "../../model";
import { subtypeLabel } from "../labels";
import { counted, st } from "../../format";
import type { StoreActions, StoreState, StoreStatus } from "../../../../types/store-tab";

const LIST_MAX = 2;

const STATUS_KEYS: Partial<Record<StoreStatus, string>> = {
  installed: "sub-installed",
  available: "sub-available",
  updates: "sub-updates",
  orphaned: "sub-orphaned",
};

const _RepoNames = ({ names }: { names: string[] }): JSX.Element => {
  const shown = names.length > LIST_MAX ? names.slice(0, LIST_MAX) : names;
  const rest = names.length - shown.length;
  return (
    <>
      {shown.map((name, index) => (
        <>
          {index === 0 ? "" : index === shown.length - 1 && !rest ? ` ${st("and")} ` : ", "}
          <b>{name}</b>
        </>
      ))}
      {rest ? ` ${st("and-more", { count: String(rest) })}` : ""}
    </>
  );
};

export const Substatus = ({
  state,
  count,
  actions,
}: {
  state: StoreState;
  count: number;
  actions: StoreActions;
}): JSX.Element | null => {
  const q = state.q.trim();
  const parts: string[] = [];
  if (q) parts.push(st("sub-matching", { q }));
  if (state.sub && state.kind !== "all")
    parts.push(st("sub-of-type", { type: subtypeLabel(state.kind, state.sub) }));
  const repoNames = state.repoSel.map((url) => findRepo(state, url)?.name ?? "");
  const status = STATUS_KEYS[state.status];
  const tail = status ? st(status) : "";
  if (!parts.length && !repoNames.length && !tail) return null;
  const before = [counted("extensions", count), parts.join(", ")].filter(Boolean).join(" ");
  return (
    <FilterSummary clearLabel={st("clear")} onClear={actions.clearFilters}>
      {before}
      {repoNames.length ? (
        <>
          {`${parts.length ? ", " : " "}${st("sub-from")} `}
          <_RepoNames names={repoNames} />
        </>
      ) : null}
      {tail ? `${parts.length || repoNames.length ? ", " : " "}${tail}` : ""}
    </FilterSummary>
  );
};
