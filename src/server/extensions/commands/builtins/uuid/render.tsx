import { renderHtml } from "../../../../../shared/ui/tribute/html";
import { UuidList } from "./list";

export const renderUuidList = (uuids: string[], copyLabel?: string): string =>
  renderHtml(<UuidList uuids={uuids} copyLabel={copyLabel} />);
