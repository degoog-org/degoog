import json
from urllib.parse import urlparse

from .errors import raise_for_status


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

    def raise_for_status(self):
        raise_for_status(self)
