interface SearchImageDropzoneProps {
  title: string;
  hint: string;
}

export const SearchImageDropzone = ({
  title,
  hint,
}: SearchImageDropzoneProps): JSX.Element => (
  <div class="degoog-search-image-dropzone" aria-hidden="true">
    <i class="fa-regular fa-image degoog-search-image-dropzone-icon"></i>
    <div class="degoog-search-image-dropzone-title">{title}</div>
    <div class="degoog-search-image-dropzone-hint">{hint}</div>
  </div>
);
