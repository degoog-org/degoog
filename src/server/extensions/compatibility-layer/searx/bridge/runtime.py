import hashlib
import json
from datetime import timedelta

from . import rpc

DEFAULT_USER_AGENT = "Mozilla/5.0"
CACHE_ENVELOPE = "json:"

_user_agent = DEFAULT_USER_AGENT


def encode(value):
    try:
        return CACHE_ENVELOPE + json.dumps(value)
    except (TypeError, ValueError):
        return None


def decode(stored):
    if not isinstance(stored, str) or not stored.startswith(CACHE_ENVELOPE):
        return stored
    try:
        return json.loads(stored[len(CACHE_ENVELOPE):])
    except ValueError:
        return stored


def ttl_seconds(expire):
    if expire is None or isinstance(expire, bool):
        return None
    if isinstance(expire, timedelta):
        return int(expire.total_seconds())
    if isinstance(expire, (int, float)):
        return int(expire)
    return None


def user_agent():
    return _user_agent


def set_agent(value):
    global _user_agent
    if value:
        _user_agent = str(value)


class Logger:
    def getChild(self, *args, **kwargs):
        return self

    def debug(self, *args, **kwargs):
        pass

    def info(self, *args, **kwargs):
        pass

    def warning(self, *args, **kwargs):
        pass

    def warn(self, *args, **kwargs):
        pass

    def error(self, *args, **kwargs):
        pass


class EngineCache:
    def __init__(self, *args, **kwargs):
        self._local = {}

    def get(self, key, default=None):
        if key in self._local:
            return self._local[key]
        try:
            stored = rpc.call({"rpc": "cache", "op": "get", "key": str(key)})
        except Exception:
            return default
        if stored is None:
            return default
        value = decode(stored)
        self._local[key] = value
        return value

    def set(self, key=None, value=None, expire=None, **kwargs):
        if key is None:
            key = kwargs.get("name")
        self._local[key] = value
        stored = encode(value)
        if stored is None:
            return value
        try:
            rpc.call(
                {
                    "rpc": "cache",
                    "op": "set",
                    "key": str(key),
                    "value": stored,
                    "ttl": ttl_seconds(expire),
                }
            )
        except Exception:
            pass
        return value

    def secret_hash(self, value):
        return hashlib.sha256(str(value).encode("utf-8")).hexdigest()[:16]

    def delete(self, key):
        self._local.pop(key, None)


class TraitCustom(dict):
    def __missing__(self, key):
        self[key] = {}
        return self[key]


def match_locale(table, locale, default=None):
    if not isinstance(table, dict) or not table or not locale:
        return default
    key = str(locale).replace("_", "-")
    exact = table.get(key)
    if exact is not None:
        return exact
    lang, _, region = key.partition("-")
    by_lang = table.get(lang)
    if by_lang is not None:
        return by_lang
    for known in sorted(table):
        if region and known.rpartition("-")[2].upper() == region.upper():
            return table[known]
    return default


class EngineTraits:
    def __init__(self, data=None):
        found = data if isinstance(data, dict) else {}
        self.languages = found.get("languages") or {}
        self.regions = found.get("regions") or {}
        self.all_locale = found.get("all_locale")
        self.custom = TraitCustom(found.get("custom") or {})

    def get_language(self, locale, default=None):
        return self._pick(self.languages, locale, default)

    def get_region(self, locale, default=None):
        return self._pick(self.regions, locale, default)

    def _pick(self, table, locale, default):
        if not locale or locale == "all":
            return self.all_locale if self.all_locale is not None else default
        return match_locale(table, locale, default)
