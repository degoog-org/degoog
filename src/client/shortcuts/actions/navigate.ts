import { getBase } from "../../utils/net/base-url";
import { showHome } from "../../utils/navigation/navigation";

export const goHome = (): void => showHome();

export const goSettings = (): void => {
  window.location.href = `${getBase()}/settings`;
};
