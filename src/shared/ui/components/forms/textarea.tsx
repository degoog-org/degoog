export interface TextareaProps {
  id: string;
  rows?: number;
  placeholder?: string;
}

export const Textarea = ({ id, rows, placeholder }: TextareaProps): JSX.Element => (
  <textarea
    id={id}
    class="settings-proxy-urls degoog-input"
    rows={rows ?? 5}
    placeholder={placeholder}
  ></textarea>
);
