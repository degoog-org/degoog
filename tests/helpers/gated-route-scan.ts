import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export const BASE_GATES = ["gandalf", "gandalfAtTheGate", "guardSettingsRoute", "settingsAuth"] as const;

const MUTATION_VERBS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const ROUTER_CALL = /\b(\w*[rR]outer|app)\s*\.\s*(post|put|patch|delete|all|on|use)\s*\(/g;
const REGEX_PRECEDERS = new Set(["", "(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+", "-", "*", "%", "<", ">", "~", "^"]);

export type ScannedRoute = {
  file: string;
  method: string;
  path: string;
  gated: boolean;
};

// Same-length copy of the source with comments and string contents blanked, so offsets map back to the original.
export const codeOnly = (src: string): string => {
  const out = src.split("");
  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k++) if (out[k] !== "\n") out[k] = " ";
  };
  const templateDepth: number[] = [];
  let depth = 0;
  let lastSig = "";
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];
    if (ch === "/" && next === "/") {
      const end = src.indexOf("\n", i);
      const stop = end === -1 ? src.length : end;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (ch === "/" && next === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? src.length : end + 2;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (ch === "/" && REGEX_PRECEDERS.has(lastSig)) {
      let j = i + 1;
      let inClass = false;
      while (j < src.length && src[j] !== "\n") {
        if (src[j] === "/" && !inClass) break;
        if (src[j] === "[") inClass = true;
        else if (src[j] === "]") inClass = false;
        j += src[j] === "\\" ? 2 : 1;
      }
      blank(i + 1, j);
      i = j + 1;
      lastSig = "/";
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== ch && src[j] !== "\n") j += src[j] === "\\" ? 2 : 1;
      blank(i + 1, j);
      i = j + 1;
      lastSig = ch;
      continue;
    }
    if (ch === "`" || (ch === "}" && templateDepth.length > 0 && templateDepth[templateDepth.length - 1] === depth)) {
      if (ch === "}") templateDepth.pop();
      let j = i + 1;
      while (j < src.length && src[j] !== "`" && !(src[j] === "$" && src[j + 1] === "{")) j += src[j] === "\\" ? 2 : 1;
      blank(i + 1, j);
      if (src[j] === "$") {
        templateDepth.push(depth);
        i = j + 2;
        lastSig = "{";
      } else {
        i = j + 1;
        lastSig = "`";
      }
      continue;
    }
    if (ch === "{" || ch === "(" || ch === "[") depth++;
    else if (ch === "}" || ch === ")" || ch === "]") depth--;
    if (!/\s/.test(ch)) lastSig = /[\w$]/.test(ch) ? "w" : ch;
    i++;
  }
  return out.join("");
};

const closingParen = (code: string, open: number): number => {
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    const ch = code[i];
    if (ch === "(" || ch === "{" || ch === "[") depth++;
    else if (ch === ")" || ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return code.length;
};

const splitTopLevel = (code: string, from: number, to: number): Array<[number, number]> => {
  const parts: Array<[number, number]> = [];
  let depth = 0;
  let start = from;
  for (let i = from; i < to; i++) {
    const ch = code[i];
    if (ch === "(" || ch === "{" || ch === "[") depth++;
    else if (ch === ")" || ch === "}" || ch === "]") depth--;
    else if (ch === "," && depth === 0) {
      parts.push([start, i]);
      start = i + 1;
    }
  }
  if (code.slice(start, to).trim()) parts.push([start, to]);
  return parts;
};

const mentionsAny = (code: string, names: Iterable<string>): boolean => {
  for (const name of names) {
    if (new RegExp(`(?<![\\w$.])${name}(?![\\w$])`).test(code)) return true;
  }
  return false;
};

type Declaration = { name: string; body: string; exported: boolean };

const STATEMENT_START = /^(export\s+)?(declare\s+)?(async\s+)?(const|let|var|function|interface|type|class|enum|import|for|if)\b/;
const DECL = /^(export\s+)?(?:(?:const|let|var)\s+([\w$]+)\s*[:=]|(?:async\s+)?function\s*\*?\s*([\w$]+))/;

// Top-level const/let/function declarations, so helpers that wrap a gate count as gates themselves.
const topLevelDeclarations = (code: string): Declaration[] => {
  const decls: Declaration[] = [];
  let depth = 0;
  let start = 0;
  const flush = (end: number) => {
    const text = code.slice(start, end).trim();
    const m = DECL.exec(text);
    if (m) decls.push({ name: m[2] ?? m[3], body: text, exported: Boolean(m[1]) });
    start = end + 1;
  };
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (ch === "(" || ch === "{" || ch === "[") depth++;
    else if (ch === ")" || ch === "}" || ch === "]") {
      depth--;
      if (depth === 0 && ch === "}" && /^(export\s+)?(async\s+)?function\b/.test(code.slice(start, i).trim())) flush(i);
    } else if (depth === 0 && ch === ";") flush(i);
    else if (depth === 0 && ch === "\n" && STATEMENT_START.test(code.slice(i + 1, i + 48))) flush(i);
  }
  return decls;
};

export const gateNamesFor = (code: string, inherited: Iterable<string>): { local: Set<string>; exported: Set<string> } => {
  const gates = new Set(inherited);
  const exported = new Set<string>();
  const decls = topLevelDeclarations(code);
  let grew = true;
  while (grew) {
    grew = false;
    for (const d of decls) {
      if (gates.has(d.name)) continue;
      const others = [...gates].filter((g) => g !== d.name);
      if (mentionsAny(d.body.slice(d.body.indexOf(d.name) + d.name.length), others)) {
        gates.add(d.name);
        if (d.exported) exported.add(d.name);
        grew = true;
      }
    }
  }
  return { local: gates, exported };
};

const literalPath = (raw: string): string | null => {
  const m = /^(["'`])([^"'`$]*)\1$/.exec(raw.trim());
  return m ? m[2] : null;
};

const usePrefix = (raw: string | null): string => {
  if (raw === null || raw === "*") return "";
  return raw.endsWith("*") ? raw.slice(0, -1) : raw;
};

export const scanSource = (file: string, src: string, inheritedGates: Iterable<string> = BASE_GATES): ScannedRoute[] => {
  const code = codeOnly(src);
  const { local: gates } = gateNamesFor(code, inheritedGates);
  const routes: ScannedRoute[] = [];
  const gatedPrefixes: string[] = [];

  for (const m of code.matchAll(ROUTER_CALL)) {
    const verb = m[2];
    const open = m.index! + m[0].length - 1;
    const args = splitTopLevel(code, open + 1, closingParen(code, open));
    const rawArg = (k: number) => (args[k] ? src.slice(args[k][0], args[k][1]).trim() : "");
    const codeArgs = (from: number) => args.slice(from).map(([a, b]) => code.slice(a, b)).join(",");

    if (verb === "use") {
      const first = literalPath(rawArg(0));
      const handlersFrom = first === null && !/^[`"']/.test(rawArg(0)) ? 0 : 1;
      if (mentionsAny(codeArgs(handlersFrom), gates)) gatedPrefixes.push(usePrefix(first));
      continue;
    }

    let methods: string[];
    let pathIdx = 0;
    if (verb === "on") {
      methods = [...rawArg(0).matchAll(/[A-Za-z]+/g)].map((x) => x[0].toUpperCase());
      pathIdx = 1;
    } else {
      methods = [verb.toUpperCase()];
    }
    const gated = mentionsAny(codeArgs(pathIdx + 1), gates);
    for (const method of methods) {
      if (method !== "ALL" && !MUTATION_VERBS.has(method)) continue;
      routes.push({ file, method, path: rawArg(pathIdx), gated });
    }
  }

  for (const r of routes) {
    const lit = literalPath(r.path);
    if (!r.gated && gatedPrefixes.some((p) => p === "" || (lit !== null && lit.startsWith(p)))) r.gated = true;
  }
  return routes;
};

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx|js|mjs)$/.test(name) ? [full] : [];
  });

export const scanRoutesDir = (root: string): ScannedRoute[] => {
  const files = walk(root).sort();
  const sources = files.map((f) => ({ file: relative(root, f).split("\\").join("/"), src: readFileSync(f, "utf8") }));
  const exported = new Set<string>(BASE_GATES);
  for (const { src } of sources) for (const name of gateNamesFor(codeOnly(src), BASE_GATES).exported) exported.add(name);
  return sources.flatMap(({ file, src }) => scanSource(file, src, exported));
};

export const routeKey = (r: Pick<ScannedRoute, "file" | "method" | "path">): string => `${r.file}: ${r.method} ${r.path}`;
