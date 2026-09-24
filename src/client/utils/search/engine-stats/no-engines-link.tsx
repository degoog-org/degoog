export const NoEnginesLink = ({
  href,
  label,
}: {
  href: string;
  label: string;
}): JSX.Element => (
  <a href={href} class="degoog-link">
    {label}
  </a>
);
