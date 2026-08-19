import json
import sys

from .errors import raise_for_status
from .http import Response

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


def _payload(args, kwargs):
    data = kwargs.get("data") or kwargs.get("content") or kwargs.get("json")
    if data is None and args:
        data = args[0]
    if isinstance(data, (dict, list)):
        data = json.dumps(data)
    if isinstance(data, bytes):
        data = data.decode("utf-8", "replace")
    return data


def fetch(method, url, *args, **kwargs):
    reply = call(
        {
            "rpc": "fetch",
            "url": str(url),
            "method": method,
            "headers": dict(kwargs.get("headers") or {}),
            "cookies": dict(kwargs.get("cookies") or {}),
            "data": _payload(args, kwargs),
        }
    )
    resp = Response(reply or {})
    if kwargs.get("raise_for_httperror"):
        raise_for_status(resp)
    return resp
