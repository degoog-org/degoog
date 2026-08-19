import re

try:
    from lxml import html
except Exception:
    html = None


def as_text(node, *args, **kwargs):
    if node is None:
        return ""
    if isinstance(node, str):
        return node
    if isinstance(node, bytes):
        return node.decode("utf-8", "replace")
    if isinstance(node, list):
        return " ".join(as_text(x) for x in node if as_text(x)).strip()
    text_content = getattr(node, "text_content", None)
    if callable(text_content):
        return " ".join(str(text_content()).split())
    text = getattr(node, "text", None)
    return " ".join(str(text or "").split())


def extr(text, start, end, default="", *args, **kwargs):
    try:
        i = text.index(start) + len(start)
        j = text.index(end, i)
        return text[i:j]
    except ValueError:
        return default


def from_html(value, *args, **kwargs):
    if html is not None and isinstance(value, str):
        try:
            return as_text(html.fromstring(value))
        except Exception:
            pass
    return as_text(value)


def as_url(value, *args, **kwargs):
    if isinstance(value, list):
        value = value[0] if value else ""
    return as_text(value)


def as_int(value, *args, **kwargs):
    try:
        return int(str(value).replace(",", "").strip())
    except Exception:
        return 0


def as_str(value, *args, **kwargs):
    return str(value)


def duration(seconds, *args, **kwargs):
    try:
        total = int(float(seconds))
    except Exception:
        return str(seconds or "")
    hours, rest = divmod(max(total, 0), 3600)
    minutes, secs = divmod(rest, 60)
    if hours:
        return "%d:%02d:%02d" % (hours, minutes, secs)
    return "%d:%02d" % (minutes, secs)


def js_to_json(value, *args, **kwargs):
    text = str(value)
    text = re.sub(r"([{,]\s*)([A-Za-z_$][\w$]*)\s*:", r'\1"\2":', text)
    text = re.sub(r",\s*([}\]])", r"\1", text)
    return text.replace("'", '"')
