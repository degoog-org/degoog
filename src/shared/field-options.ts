export interface FieldOption {
  value: string;
  label?: string;
}

export interface FieldOptionsResult {
  options: FieldOption[];
  notice?: string;
  value?: string;
}

export interface FieldOptionsSource {
  dependsOn?: string[];
  refreshLabel?: string;
  emptyHint?: string;
  auto?: boolean;
}
