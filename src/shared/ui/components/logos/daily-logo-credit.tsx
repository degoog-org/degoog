import type { DailyLogoAuthor } from "../../../daily-logo";

export const DailyLogoCredit = ({
  authors,
  prefix,
}: {
  authors: DailyLogoAuthor[];
  prefix: string;
}): JSX.Element => (
  <p class="daily-logo-credit">
    {`${prefix} `}
    {authors.map((author, index) => (
      <>
        {index > 0 ? ", " : ""}
        {author.url ? (
          <a href={author.url} target="_blank" rel="noopener noreferrer">
            {author.name}
          </a>
        ) : (
          author.name
        )}
      </>
    ))}
  </p>
);
