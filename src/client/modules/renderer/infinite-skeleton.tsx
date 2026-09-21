import { Raw } from "../../../shared/ui/core/raw";
import { SKELETON_CLASS } from "./infinite-scroll-classes";

export const InfiniteSkeleton = ({ html }: { html: string }): JSX.Element => (
  <div class={SKELETON_CLASS}>
    <Raw html={html} />
  </div>
);
