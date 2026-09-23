export const ImgFilterSuffix = ({ label }: { label: string }): JSX.Element => (
  <>
    {" "}
    <span class="degoog-img-filter-sep">·</span>{" "}
    <span class="degoog-img-filter-current">{label}</span>
  </>
);
