import { getBase } from "../../utils/net/base-url";
import type { StoreItem } from "../../types/store-tab";

export const screenshotUrls = (item: StoreItem): string[] => {
  const slug = item.path.split("/").pop() ?? "";
  return item.screenshots.map(
    (file) =>
      `${getBase()}/api/store/screenshots/${encodeURIComponent(item.repoSlug)}/${encodeURIComponent(item.type)}/${encodeURIComponent(slug)}/${encodeURIComponent(file)}`,
  );
};
