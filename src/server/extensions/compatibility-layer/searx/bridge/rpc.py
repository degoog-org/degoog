import json
import sys

from .errors import raise_for_status
from .http import Response, encode_body

_NEXT_ID = 0


def emit(envelope):
    sys.stdout.write(json.dumps(envelope) + "\n")
    sys.stdout.flush()


def call(payload):
    global _NEXT_ID
    _NEXT_ID += 1
    payload["id"] = _NEXT_ID
    emit(payload)
    line = sys.stdin.readline()
    if not line:
        raise RuntimeError("Degoog bridge closed unexpectedly")
    reply = json.loads(line)
    if not reply.get("ok"):
        raise RuntimeError(reply.get("error") or "Degoog bridge call failed")
    return reply.get("data")


def fetch(method, url, *args, **kwargs):
    body, headers = encode_body(
        kwargs.get("headers"),
        data=kwargs.get("data", args[0] if args else None),
        json_body=kwargs.get("json"),
        content=kwargs.get("content"),
        multipart=kwargs.get("multipart"),
    )
    reply = call(
        {
            "rpc": "fetch",
            "url": str(url),
            "method": method,
            "headers": headers,
            "cookies": dict(kwargs.get("cookies") or {}),
            "data": body,
        }
    )
    resp = Response(reply or {})
    if kwargs.get("raise_for_httperror"):
        raise_for_status(resp)
    return resp
