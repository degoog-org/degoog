import { PULL_CLASS, SENTINEL_CLASS } from "./infinite-scroll-classes";

export const InfiniteSentinel = (): JSX.Element => (
  <div class={SENTINEL_CLASS}>
    <div class={PULL_CLASS}></div>
  </div>
);
