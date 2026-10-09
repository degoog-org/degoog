from . import engine
from .errors import raise_for_status
from .http import RequestEcho, Response, encode_body
from .runtime import set_agent

ANY_TIME_FILTER = (None, "any")
URL_SCHEMES = ("http://", "https://")
DEFAULT_TRANSLATE = ("English", "en", "english")


def _agent_from(payload):
    set_agent((payload.get("headers") or {}).get("User-Agent"))


def _params(payload):
    query = payload.get("query") or ""
    time_filter = payload.get("timeFilter")
    return {
        "query": query,
        "pageno": int(payload.get("page") or 1),
        "time_range": None if time_filter in ANY_TIME_FILTER else time_filter,
        "safesearch": int(payload.get("safesearch") or 0),
        "searxng_locale": payload.get("locale") or "all",
        "language": payload.get("locale") or "en-US",
        "category": payload.get("category") or "general",
        "engine_data": {},
        "data": {},
        "from_lang": list(DEFAULT_TRANSLATE),
        "to_lang": list(DEFAULT_TRANSLATE),
        "from": "USD",
        "to": "USD",
        "search_urls": {
            "data:image": "",
            "http": query if str(query).startswith(URL_SCHEMES) else "",
        },
        "headers": dict(payload.get("headers") or {}),
        "cookies": {},
        "raise_for_httperror": True,
    }


def _sent(mapping):
    return {str(key): str(value) for key, value in (mapping or {}).items() if value is not None}


def _echo_params(payload):
    params = _params(payload)
    echo = dict(payload.get("request") or {})
    form = echo.pop("form", None)
    params.update({key: value for key, value in echo.items() if value is not None})
    if form is not None:
        params["data"] = form
    return params


def build_request(payload):
    _agent_from(payload)
    mod = engine.load(payload["path"], payload.get("overrides"))
    request = getattr(mod, "request", None)
    if not callable(request):
        raise RuntimeError("engine does not export request")
    params = _params(payload)
    request(payload.get("query") or "", params)
    form = params.get("data") or params.get("body")
    data, headers = encode_body(
        params.get("headers"),
        data=form,
        json_body=params.get("json"),
        content=params.get("content"),
    )
    return {
        "url": params.get("url"),
        "method": params.get("method") or "GET",
        "headers": _sent(headers),
        "cookies": _sent(params.get("cookies")),
        "data": data,
        "form": form if isinstance(form, (dict, list)) else None,
        "raise_for_httperror": params.get("raise_for_httperror") is not False,
    }


def _published(value):
    if value is None:
        return None
    formatter = getattr(value, "strftime", None)
    if callable(formatter):
        return formatter("%Y-%m-%d")
    raw = str(value).strip()
    if len(raw) >= 10 and raw[4] == "-" and raw[7] == "-":
        return raw[:10]
    return None


def _one_result(item, source):
    if not isinstance(item, dict):
        return None
    if not item.get("url") and not item.get("title"):
        return None
    url = item.get("url") or ""
    out = {
        "title": str(item.get("title") or url),
        "url": str(url),
        "snippet": str(item.get("content") or item.get("snippet") or ""),
        "source": source,
    }
    image = item.get("img_src") or item.get("image_src") or item.get("image") or item.get("imageUrl")
    thumbnail = item.get("thumbnail_src") or item.get("thumbnail") or image
    if thumbnail:
        out["thumbnail"] = str(thumbnail)
    if image:
        out["imageUrl"] = str(image)
    length = item.get("length") or item.get("duration")
    if length:
        out["duration"] = str(length)
    published = _published(item.get("publishedDate") or item.get("publishedAt"))
    if published:
        out["publishedAt"] = published
    return out


def parse_response(payload):
    _agent_from(payload)
    mod = engine.load(payload["path"], payload.get("overrides"))
    response = getattr(mod, "response", None)
    if not callable(response):
        raise RuntimeError("engine does not export response")
    resp = Response(payload.get("response") or {})
    resp.search_params = _echo_params(payload)
    resp.request = RequestEcho(payload.get("request") or {})
    if resp.search_params.get("raise_for_httperror") is not False:
        raise_for_status(resp)
    raw = response(resp)
    source = payload.get("source") or engine.describe(payload["path"], payload.get("overrides"))["name"]
    results = [_one_result(item, source) for item in list(raw or [])]
    return {"results": [item for item in results if item]}


def run(payload):
    action = payload.get("action")
    if action == "discover_all":
        return engine.describe_all(payload.get("paths") or [])
    if action == "discover":
        return engine.describe(payload["path"], payload.get("overrides"))
    if action == "request":
        return build_request(payload)
    if action == "response":
        return parse_response(payload)
    raise RuntimeError("unknown action")
