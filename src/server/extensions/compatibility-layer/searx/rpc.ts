import {
  runBridge,
  RPC_KIND,
  type RunnerSpec,
  type RpcCacheRequest,
  type RpcFetchReply,
  type RpcFetchRequest,
  type RpcHandlers,
} from "../rpc";

export { RPC_KIND };
export type { RpcCacheRequest, RpcFetchReply, RpcFetchRequest, RpcHandlers };

const _pythonSpec = (): RunnerSpec => ({
  bin: process.env.DEGOOG_PYTHON_BIN ?? "python3",
  args: [],
  label: "SearX",
});

export const runPython = <T>(
  runnerPath: string,
  payload: Record<string, unknown>,
  handlers: RpcHandlers = {},
): Promise<T> => runBridge<T>(_pythonSpec(), runnerPath, payload, handlers);
