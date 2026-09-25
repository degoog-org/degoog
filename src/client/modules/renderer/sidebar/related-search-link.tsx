export const RelatedSearchLink = ({ term }: { term: string }): JSX.Element => (
  <a class="related-search-link degoog-link" data-query={term}>
    {term}
  </a>
);
