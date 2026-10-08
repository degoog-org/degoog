import { getEngines } from "../engines";
import { getBase } from "../../net/base-url";
import { state } from "../../../state";
import { appendSearchAuthParams } from "../../net/request";
import { REGION_PARAM } from "../../../../shared/region";

const LUCKY_PATH = "/api/lucky";

function _postLucky(params: URLSearchParams): void {
  const form = document.createElement("form");
  form.method = "post";
  form.action = appendSearchAuthParams(`${getBase()}${LUCKY_PATH}`);
  form.hidden = true;
  for (const [key, value] of params) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = key;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

export async function performLucky(query: string): Promise<void> {
  if (!query.trim()) return;
  const engines = await getEngines();
  const params = new URLSearchParams({ q: query });
  for (const [key, val] of Object.entries(engines)) {
    params.set(key, String(val));
  }
  if (state.currentRegion) params.set(REGION_PARAM, state.currentRegion);
  if (state.postMethodEnabled) {
    _postLucky(params);
    return;
  }
  window.location.href = appendSearchAuthParams(
    `${getBase()}${LUCKY_PATH}?${params.toString()}`,
  );
}
