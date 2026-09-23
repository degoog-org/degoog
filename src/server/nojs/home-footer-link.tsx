export const HomeFooterLink = ({
  href,
  label,
}: {
  href: string;
  label: string;
}): JSX.Element => (
  <>
    <a class="home-footer-separator">|</a>
    <a href={href}>{label}</a>
  </>
);
