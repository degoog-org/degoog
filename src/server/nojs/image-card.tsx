import { RawDogIt } from "../../shared/ui/tribute/rawdogit";

export const ImageCard = ({
  href,
  html,
}: {
  href: string;
  html: string;
}): JSX.Element => (
  <a class="image-card" href={href} rel="noopener noreferrer">
    <RawDogIt html={html} />
  </a>
);
