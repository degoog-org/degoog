interface TakeoverResult {
  url: string;
  title: string;
  snippet: string;
}

export const TakeoverResultItem = ({ result }: { result: TakeoverResult }): JSX.Element => (
  <div class="result-item degoog-result">
    <div class="result-item-inner degoog-result--inner">
      <div class="result-body degoog-result--body">
        <div class="result-url-row degoog-result--url-row">
          <cite class="result-cite degoog-result--cite">{result.url}</cite>
        </div>
        <a
          class="result-title degoog-result--title"
          href={result.url}
          rel="noopener noreferrer"
          target="_blank"
        >
          {result.title}
        </a>
        <p class="result-snippet degoog-result--snippet">{result.snippet}</p>
      </div>
    </div>
  </div>
);
