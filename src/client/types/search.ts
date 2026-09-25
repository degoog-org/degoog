export interface ImageFilter {
  color?: string;
  size?: string;
  type?: string;
  layout?: string;
  nsfw?: string;
}

export interface AtAGlance {
  snippet: string;
  url: string;
  title: string;
  sources: string[];
}

export interface KnowledgePanel {
  title: string;
  description: string;
  image?: string;
  url: string;
}

export interface NewsItem {
  title: string;
  url: string;
  thumbnail?: string;
  sources?: string[];
}
