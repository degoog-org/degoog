import { Desc } from "../../../../shared/ui/components/forms/desc";

const t = window.scopedT("core");

export const SectionDesc = ({ k }: { k: string }): JSX.Element => <Desc text={t(k)} />;
