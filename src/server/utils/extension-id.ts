export const slugifyIdPart = (input: string): string =>
  input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "unknown";

const repoAuthorAndName = (repoUrl: string): { author: string; name: string } => {
  try {
    const u = new URL(repoUrl.replace(/\.git$/, ""));
    const parts = u.pathname.split("/").filter(Boolean);
    return {
      author: slugifyIdPart(parts[0] ?? "unknown"),
      name: slugifyIdPart((parts[1] ?? "repo").replace(/\.git$/, "")),
    };
  } catch {
    return { author: "unknown", name: "repo" };
  }
};

export const folderNameForItem = (repoUrl: string, itemPath: string): string => {
  const { author, name } = repoAuthorAndName(repoUrl);
  const itemFolder = itemPath.split("/").pop() ?? itemPath;
  return `${author}-${name}-${slugifyIdPart(itemFolder)}`;
};

export const rewriteThemePaths = (content: string, id: string): string =>
  content
    .replace(/__THEME_PATH__/g, `/themes/${id}`)
    .replace(/(["'(`\s])\/themes\/[\w-]+\//g, `$1/themes/${id}/`);

export const rewritePluginPaths = (code: string, id: string): string =>
  code.replace(/\/api\/plugin\/[\w-]+\//g, `/api/plugin/${id}/`);
