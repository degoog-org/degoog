import type { RawNode } from "./types";

/**
 * Wraps trusted, already-rendered HTML. The renderer injects it verbatim and
 * never diffs inside it, which is what plugin slot panels and extension-owned
 * subtrees need.
 */
export const raw = (html: string | null | undefined): RawNode => ({
  k: "raw",
  html: html ?? "",
});

export const Raw = (props: { html: string | null | undefined }): RawNode =>
  raw(props.html);
