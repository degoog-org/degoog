import ast
import os
import typing

KIND_TEXT = "text"
KIND_NUMBER = "number"
KIND_BOOL = "bool"
KIND_LIST = "list"

TRUE_WORDS = ("true", "1", "yes", "on")

RESERVED = {
    "about",
    "categories",
    "disabled",
    "display_error_messages",
    "engine_type",
    "inactive",
    "language_support",
    "max_page",
    "name",
    "page_size",
    "paging",
    "results_per_page",
    "safesearch",
    "send_accept_language_header",
    "shortcut",
    "time_range_map",
    "time_range_dict",
    "time_range_support",
    "timeout",
    "tokens",
    "traits",
    "using_tor_proxy",
    "weight",
}


def _is_simple(value):
    if value is None or isinstance(value, (str, bool, int, float)):
        return True
    return isinstance(value, list) and all(isinstance(item, str) for item in value)


def _kind(value):
    if isinstance(value, bool):
        return KIND_BOOL
    if isinstance(value, (int, float)):
        return KIND_NUMBER
    if isinstance(value, list):
        return KIND_LIST
    return KIND_TEXT


def _text(value):
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, list):
        return "\n".join(value)
    return str(value)


def _options(mod, name):
    annotation = getattr(mod, "__annotations__", {}).get(name)
    if isinstance(annotation, str):
        try:
            annotation = eval(annotation, vars(mod))
        except Exception:
            return []
    try:
        found = typing.get_args(annotation)
    except Exception:
        return []
    if not found or not all(isinstance(item, str) for item in found):
        return []
    return list(found)


def _doc_of(nodes, index):
    following = nodes[index + 1] if index + 1 < len(nodes) else None
    if not isinstance(following, ast.Expr):
        return ""
    value = following.value
    if isinstance(value, ast.Constant) and isinstance(value.value, str):
        return " ".join(value.value.split())
    return ""


def _target_of(node):
    if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
        return node.target.id
    if isinstance(node, ast.Assign) and len(node.targets) == 1:
        target = node.targets[0]
        if isinstance(target, ast.Name):
            return target.id
    return None


def _declared(path):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            tree = ast.parse(handle.read(), os.path.basename(path))
    except (OSError, SyntaxError, ValueError):
        return []
    found = []
    seen = set()
    for index, node in enumerate(tree.body):
        name = _target_of(node)
        if not name or name in seen:
            continue
        seen.add(name)
        found.append((name, _doc_of(tree.body, index)))
    return found


def fields(mod, path):
    found = []
    for name, doc in _declared(path):
        if name.startswith("_") or not name.islower() or name in RESERVED:
            continue
        if not hasattr(mod, name):
            continue
        value = getattr(mod, name)
        if not _is_simple(value):
            continue
        found.append(
            {
                "name": name,
                "kind": _kind(value),
                "value": _text(value),
                "doc": doc,
                "options": _options(mod, name),
                "required": value is None,
            }
        )
    return found


def coerce(current, raw):
    if isinstance(current, bool):
        return str(raw).strip().lower() in TRUE_WORDS
    if isinstance(current, int) and not isinstance(current, bool):
        try:
            return int(str(raw).strip())
        except ValueError:
            return current
    if isinstance(current, float):
        try:
            return float(str(raw).strip())
        except ValueError:
            return current
    if isinstance(current, list):
        return [line.strip() for line in str(raw).splitlines() if line.strip()]
    return str(raw)


def apply(mod, overrides):
    for name, raw in (overrides or {}).items():
        if name not in RESERVED and hasattr(mod, name):
            setattr(mod, name, coerce(getattr(mod, name), raw))
