export type SearchQueryTrigger = {
  type: "search-query";
  match: (query: string) => boolean;
};

export type UovadipasquaTrigger = SearchQueryTrigger;

export type UovadipasquaContext = {
  query: string;
};

export type Uovadipasqua = {
  id: string;
  triggers: UovadipasquaTrigger[];
  run: (ctx: UovadipasquaContext) => void | Promise<void>;
};
