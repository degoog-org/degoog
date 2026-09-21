import { Raw } from "../../shared/ui/core/raw";

export const ImageCard = ({
  href,
  html,
}: {
  href: string;
  html: string;
}): JSX.Element => (
  <a class="image-card" href={href} rel="noopener noreferrer">
    <Raw html={html} />
  </a>
);
