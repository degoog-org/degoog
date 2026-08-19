import importlib.util
import json
import os
import sys

from . import config, shims
from .runtime import EngineCache, EngineTraits, Logger

GROUPING_CATEGORY = "web"
GENERAL_CATEGORY = "general"
FALLBACK_TYPE = "web"
FALLBACK_CATEGORY = "other"
TRAITS_SUFFIX = ".traits.json"
CONFIG_ATTR = "_degoog_config"

ENGINE_DEFAULTS = {
    "play_categ": "apps",
}


def code_of(path):
    return os.path.splitext(os.path.basename(path))[0]


def _import(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    if not spec or not spec.loader:
        raise RuntimeError("could not load engine")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


def _traits(path):
    found = os.path.splitext(path)[0] + TRAITS_SUFFIX
    try:
        with open(found, "r", encoding="utf-8") as handle:
            return EngineTraits(json.load(handle))
    except (OSError, ValueError):
        return EngineTraits()


def _adopt(mod, path, overrides):
    if not hasattr(mod, "logger"):
        setattr(mod, "logger", Logger())
    if not hasattr(mod, "CACHE"):
        setattr(mod, "CACHE", EngineCache())
    if not hasattr(mod, "traits"):
        setattr(mod, "traits", _traits(path))
    about = getattr(mod, "about", {})
    website = str(about.get("website", "")).rstrip("/") if isinstance(about, dict) else ""
    base = getattr(mod, "base_url", None)
    if (base is None or base == []) and website:
        setattr(mod, "base_url", website)
    for key, value in ENGINE_DEFAULTS.items():
        if not hasattr(mod, key) or getattr(mod, key) is None:
            setattr(mod, key, value)
    setattr(mod, CONFIG_ATTR, config.fields(mod, path))
    config.apply(mod, overrides)


def categories(mod):
    raw = getattr(mod, "categories", None)
    if isinstance(raw, list):
        found = [str(x) for x in raw if str(x).strip()]
        if found:
            return found
    if isinstance(raw, str) and raw.strip():
        return [raw.strip()]
    return [FALLBACK_CATEGORY]


def types_of(names):
    mapped = []
    for name in names:
        value = name.lower()
        if value == GROUPING_CATEGORY:
            continue
        if value == GENERAL_CATEGORY:
            value = FALLBACK_TYPE
        if value not in mapped:
            mapped.append(value)
    return mapped or [FALLBACK_TYPE]


def _setup(mod, name):
    setup = getattr(mod, "setup", None)
    if not callable(setup):
        return
    try:
        setup({"name": name, "categories": categories(mod)})
    except Exception:
        pass


def load(path, overrides=None):
    shims.install(os.path.dirname(path))
    name = "searx.engines." + code_of(path)
    mod = _import(path, name)
    engines = sys.modules.get("searx.engines")
    if engines is not None:
        getattr(engines, "engines", {})[code_of(path)] = mod
    _adopt(mod, path, overrides)
    _setup(mod, name)
    return mod


def describe(path, overrides=None):
    mod = load(path, overrides)
    about = getattr(mod, "about", {})
    about = about if isinstance(about, dict) else {}
    found = categories(mod)
    return {
        "path": path,
        "id": code_of(path),
        "name": about.get("name") or code_of(path).replace("_", " ").title(),
        "categories": found,
        "types": types_of(found),
        "paging": bool(getattr(mod, "paging", False)),
        "maxPage": int(getattr(mod, "max_page", 0) or 0),
        "timeRangeSupport": bool(getattr(mod, "time_range_support", False)),
        "languageSupport": bool(getattr(mod, "language_support", False)),
        "safesearch": bool(getattr(mod, "safesearch", False)),
        "offline": not callable(getattr(mod, "request", None)),
        "config": getattr(mod, CONFIG_ATTR, []),
    }


def _requested(item):
    if isinstance(item, dict):
        return item.get("path"), item.get("overrides")
    return item, None


def describe_all(items):
    found = []
    for item in items:
        path, overrides = _requested(item)
        try:
            found.append(describe(path, overrides))
        except Exception as exc:
            found.append({"path": path, "error": str(exc)})
    return {"engines": found}
