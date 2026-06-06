export interface ToggleOpts {
  id: string;
  labelKey: string;
  ariaKey?: string;
  titleKey?: string;
  checked?: boolean;
}

export interface TextareaOpts {
  id: string;
  labelKey: string;
  rows?: number;
  placeholder?: string;
  descKey?: string;
}

export interface NumberOpts {
  id: string;
  labelKey: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  inline?: boolean;
}

export interface SectionOpts {
  id?: string;
  icon?: string;
  headingKey: string;
  descKey?: string;
  content: string;
  noFieldset?: boolean;
  fieldsetClass?: string;
}
