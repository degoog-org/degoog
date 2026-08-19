import json
import os
import sys
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from bridge import actions, rpc

try:
    rpc.emit({"ok": True, "data": actions.run(json.loads(sys.stdin.readline() or "{}"))})
except Exception as exc:
    rpc.emit({"ok": False, "error": str(exc) or type(exc).__name__, "trace": traceback.format_exc()})
    sys.exit(1)
