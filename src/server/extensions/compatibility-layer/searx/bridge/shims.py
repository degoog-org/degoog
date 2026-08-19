import builtins
import functools
import json
import sys
import types

from . import rpc, text
from .errors import (
    SearxEngineAPIException,
    SearxEngineAccessDeniedException,
    SearxEngineCaptchaException,
    SearxEngineException,
    SearxEngineTooManyRequestsException,
    SearxEngineXPathException,
    raise_for_status,
)
from .http import Response
from .results import (
    Answer,
    EngineResults,
    KeyValue,
    LegacyResult,
    MainResult,
    Result,
    ResultTypes,
    Translations,
    WeatherAnswer,
)
from .runtime import EngineCache, EngineTraits, Logger, match_locale, user_agent

SETTINGS = {
    "general": {"debug": False},
    "search": {"safe_search": 0, "default_lang": "en-US"},
    "outgoing": {"request_timeout": 10.0},
    "server": {"secret_key": "degoog"},
    "brand": {},
    "engines": [],
    "categories_as_tabs": {},
    "ui": {},
}

HTTP_VERBS = ("get", "post", "put", "patch", "delete", "head", "options")


def _module(name):
    module = types.ModuleType(name)
    sys.modules[name] = module
    return module


def _fill(module, **members):
    for key, value in members.items():
        setattr(module, key, value)
    return module


def _exceptions():
    return _fill(
        _module("searx.exceptions"),
        SearxException=SearxEngineException,
        SearxEngineException=SearxEngineException,
        SearxEngineCaptchaException=SearxEngineCaptchaException,
        SearxEngineAPIException=SearxEngineAPIException,
        SearxEngineAccessDeniedException=SearxEngineAccessDeniedException,
        SearxEngineXPathException=SearxEngineXPathException,
        SearxEngineTooManyRequestsException=SearxEngineTooManyRequestsException,
    )


def _results():
    result_types = _fill(
        _module("searx.result_types"),
        EngineResults=EngineResults,
        MainResult=MainResult,
        WeatherAnswer=WeatherAnswer,
        KeyValue=KeyValue,
        LegacyResult=LegacyResult,
        Answer=Answer,
        Translations=Translations,
        Result=Result,
        Image=ResultTypes.Image,
        ImageRef=ResultTypes.ImageRef,
        __path__=[],
    )
    images = _fill(
        _module("searx.result_types.image"),
        Image=ResultTypes.Image,
        ImageRef=ResultTypes.ImageRef,
    )
    setattr(result_types, "image", images)
    return result_types


def _xpath_at(utils):
    def at_index(node, xpath, index=0, default=None):
        try:
            return utils.eval_xpath(node, xpath)[index]
        except Exception:
            return default

    return at_index


def _utils():
    utils = _fill(
        _module("searx.utils"),
        extract_text=text.as_text,
        eval_xpath=lambda node, xpath, *a, **k: node.xpath(xpath) if hasattr(node, "xpath") else [],
        extract_url=text.as_url,
        html_to_text=text.from_html,
        markdown_to_text=text.from_html,
        extr=text.extr,
        int_or_zero=text.as_int,
        humanize_number=text.as_str,
        humanize_bytes=text.as_str,
        remove_pua_from_str=text.as_str,
        ecma_unescape=text.as_str,
        to_string=lambda value, *a, **k: "" if value is None else str(value),
        gen_useragent=lambda *a, **k: user_agent(),
        searxng_useragent=lambda *a, **k: user_agent(),
        get_embeded_stream_url=lambda url, *a, **k: url,
        js_variable_to_python=lambda value, *a, **k: json.loads(value),
        get_string_replaces_function=lambda replaces, *a, **k: (lambda value, *aa, **kk: str(value)),
        parse_duration_string=lambda value, *a, **k: value,
        format_duration=text.duration,
        js_obj_str_to_json_str=text.js_to_json,
        js_obj_str_to_python=lambda value, *a, **k: json.loads(text.js_to_json(value)),
        load_module=lambda *a, **k: types.ModuleType("stub"),
        parse_url=lambda value, *a, **k: str(value),
        get_node=lambda node, *a, **k: node,
        sparql_string_escape=lambda value, *a, **k: str(value).replace('"', '\\"'),
        detect_language=lambda *a, **k: None,
        ElementType=object,
    )
    setattr(utils, "eval_xpath_list", lambda node, xpath, *a, **k: list(utils.eval_xpath(node, xpath)))
    setattr(utils, "eval_xpath_getindex", _xpath_at(utils))
    return utils


def _locales():
    return _fill(
        _module("searx.locales"),
        language_tag=lambda locale, *a, **k: str(locale).replace("_", "-"),
        region_tag=lambda locale, *a, **k: str(locale).replace("_", "-"),
        get_official_locales=lambda country, languages=None, regional=True, *a, **k: [f"en-{country}"],
        LOCALE_BEST_MATCH={},
        get_engine_locale=lambda locale, traits=None, default=None: match_locale(traits, locale, default),
    )


def _engines(utils, engines_dir):
    engines = _fill(
        _module("searx.engines"),
        __path__=[engines_dir] if engines_dir else [],
        categories={},
        engines={},
    )
    _fill(
        _module("searx.engines.xpath"),
        extract_text=text.as_text,
        extract_url=text.as_url,
        eval_xpath=utils.eval_xpath,
        eval_xpath_list=utils.eval_xpath_list,
        eval_xpath_getindex=utils.eval_xpath_getindex,
    )
    return engines


def _enginelib():
    enginelib = _fill(
        _module("searx.enginelib"),
        EngineCache=EngineCache,
        EngineAbout=dict,
        Engine=object,
    )
    traits = _fill(
        _module("searx.enginelib.traits"),
        EngineTraits=EngineTraits,
        EngineTraitsMap=dict,
    )
    setattr(enginelib, "traits", traits)
    return enginelib


def _network():
    network = _module("searx.network")
    for verb in HTTP_VERBS:
        setattr(network, verb, functools.partial(rpc.fetch, verb.upper()))
    setattr(network, "request", lambda method, url, **kwargs: rpc.fetch(str(method).upper(), url, **kwargs))
    setattr(network, "raise_for_httperror", raise_for_status)
    return network


def _weather():
    class GeoLocation:
        latitude = 51.0
        longitude = -3.0

        @classmethod
        def by_query(cls, query):
            if not str(query).strip():
                raise ValueError("empty location")
            return cls()

    return _fill(
        _module("searx.weather"),
        Weather=dict,
        GeoLocation=GeoLocation,
        WeatherConditionType=str,
    )


def _bangs():
    return _fill(
        _module("searx.external_bang"),
        get_bang_url=lambda *a, **k: None,
        EXTERNAL_BANGS={},
        get_node=lambda *a, **k: (None, None, None),
    )


def _urls():
    return _fill(
        _module("searx.external_urls"),
        get_external_url=lambda url_id=None, item_id=None, default=None, *a, **k: default or str(item_id or ""),
        get_earth_coordinates_url=lambda *a, **k: "",
        area_to_osm_zoom=lambda *a, **k: 12,
    )


def _processors():
    processors = _fill(_module("searx.search.processors"), __path__=[])
    for stub in ("OnlineParams", "RequestParams", "OnlineDictParams", "OnlineCurrenciesParams"):
        setattr(processors, stub, dict)
    dictionary = _fill(_module("searx.search.processors.online_dictionary"), OnlineDictParams=dict)
    setattr(processors, "online_dictionary", dictionary)
    search = _fill(_module("searx.search"), __path__=[], processors=processors)
    return search


def _outsiders():
    _fill(
        _module("flask_babel"),
        gettext=lambda value, *a, **k: str(value),
        lazy_gettext=lambda value, *a, **k: str(value),
    )
    _fill(_module("isodate"), parse_duration=lambda value, *a, **k: value)
    _fill(_module("httpx"), Client=object, AsyncClient=object, Response=Response, DigestAuth=object)
    _fill(_module("valkey"), Valkey=object)


def install(engines_dir=None):
    searx = _fill(_module("searx"), __path__=[], settings=SETTINGS, logger=Logger())
    utils = _utils()
    _fill(
        searx,
        exceptions=_exceptions(),
        result_types=_results(),
        utils=utils,
        locales=_locales(),
        engines=_engines(utils, engines_dir),
        enginelib=_enginelib(),
        weather=_weather(),
        external_bang=_bangs(),
        search=_processors(),
    )
    _network()
    _urls()
    _outsiders()
    _fill(
        _module("searx.data"),
        WIKIDATA_UNITS={},
        ENGINE_TRAITS={},
        OSM_KEYS_TAGS={},
        CURRENCIES={},
    )
    _fill(_module("searx.extended_types"), SXNG_Response=Response, SXNG_Request=dict)
    builtins.logger = Logger()
    builtins.CACHE = EngineCache()
