import type { PluginManifest } from "../types/extension";

export const isPluginManifest = (val: unknown): val is PluginManifest =>
  typeof val === "object" &&
  val !== null &&
  typeof (val as PluginManifest).id === "string" &&
  (val as PluginManifest).id.length > 0 &&
  typeof (val as PluginManifest).name === "string";
