import { BanEntry } from "./ban-entry";

const t = window.scopedT("core");

export interface BanListEntry {
  ip: string;
  meta: string;
}

export interface BanListProps {
  entries: BanListEntry[];
  showAll: boolean;
  limit: number;
  onUnban: (ip: string) => void;
  onShowAll: () => void;
}

export const BanList = ({ entries, showAll, limit, onUnban, onShowAll }: BanListProps): JSX.Element => {
  if (entries.length === 0) {
    return <p class="settings-row-desc">{t("settings-page.server.honeypot-blocklist-empty")}</p>;
  }
  const shown = showAll ? entries : entries.slice(0, limit);
  return (
    <>
      {shown.map((entry) => (
        <BanEntry
          key={entry.ip}
          ip={entry.ip}
          meta={entry.meta}
          unbanLabel={t("settings-page.server.honeypot-unban")}
          onUnban={() => onUnban(entry.ip)}
        />
      ))}
      {shown.length < entries.length ? (
        <button type="button" class="settings-show-all" onClick={onShowAll}>
          {t("settings-page.server.show-all", { count: String(entries.length) })}
        </button>
      ) : null}
    </>
  );
};
