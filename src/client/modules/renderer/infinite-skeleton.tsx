import type { Child } from "../../../shared/ui/tribute/types";
import { SKELETON_CLASS } from "./infinite-scroll-classes";

export const InfiniteSkeleton = ({
  children,
}: {
  children?: Child;
}): JSX.Element => <div class={SKELETON_CLASS}>{children}</div>;
