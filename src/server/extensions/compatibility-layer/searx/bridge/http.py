import json
import uuid
from urllib.parse import urlencode, urlparse

from .errors import raise_for_status


FORM_TYPE = "application/x-www-form-urlencoded"
JSON_TYPE = "application/json"


def _text(value):
    if isinstance(value, bytes):
        return value.decode("utf-8", "replace")
    return "" if value is None else str(value)


def _has_type(headers):
    return any(str(key).lower() == "content-type" for key in headers)


def _multipart(parts):
    boundary = uuid.uuid4().hex
    chunks = []
    for name, value in parts.items():
        chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{_text(value)}\r\n')
    chunks.append(f"--{boundary}--\r\n")
    return "".join(chunks), f"multipart/form-data; boundary={boundary}"


def encode_body(headers, data=None, json_body=None, content=None, multipart=None):
    headers = dict(headers or {})
    if multipart is not None:
        body, kind = _multipart(getattr(multipart, "parts", multipart) or {})
    elif content:
        return _text(content), headers
    elif json_body:
        body, kind = json.dumps(json_body), JSON_TYPE
    elif isinstance(data, dict) and data:
        body, kind = urlencode({k: "" if v is None else v for k, v in data.items()}, doseq=True), FORM_TYPE
    elif isinstance(data, list) and data:
        body, kind = urlencode(data, doseq=True), FORM_TYPE
    elif data and not isinstance(data, (dict, list)):
        return _text(data), headers
    else:
        return None, headers
    if multipart is not None or not _has_type(headers):
        headers = {k: v for k, v in headers.items() if str(k).lower() != "content-type"}
        headers["Content-Type"] = kind
    return body, headers


class RespUrl:
    def __init__(self, raw):
        parsed = urlparse(raw)
        self.host = parsed.hostname or ""
        self.path = parsed.path or "/"
        self.raw = raw

    def __str__(self):
        return self.raw


class RequestEcho:
    def __init__(self, raw):
        self.url = RespUrl(raw.get("url") or "")
        self.method = raw.get("method") or "GET"
        self.headers = raw.get("headers") or {}
        self.content = (raw.get("data") or "").encode("utf-8")


class Response:
    def __init__(self, raw):
        self.url = RespUrl(raw.get("url") or "")
        self.status_code = int(raw.get("status") or 0)
        self.status = self.status_code
        self.text = raw.get("text") or ""
        self.content = self.text.encode("utf-8")
        self.headers = raw.get("headers") or {}
        self.cookies = raw.get("cookies") or {}
        self.ok = 200 <= self.status_code < 400
        self.encoding = "utf-8"

    def json(self):
        return json.loads(self.text or "null")

    def html(self):
        from lxml import html

        return html.fromstring(self.text)

    def raise_for_status(self):
        raise_for_status(self)
