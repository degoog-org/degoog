export const NojsLink = ({
  href,
  label,
}: {
  href: string;
  label: string;
}): JSX.Element => (
  <p>
    <a class="degoog-link" href={href}>
      {label}
    </a>
  </p>
);
