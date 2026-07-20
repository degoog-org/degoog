export const EXPORT_SELECT_SQL = `
  SELECT h.query_norm, h.engine_type, u.url, u.url_norm, u.source_engine,
         u.title, u.snippet, u.thumbnail, u.image_url, u.is_gif, u.duration,
         u.extras_json, h.first_seen, h.last_seen, NULL AS source_instance,
         h.best_position, h.pos_sum, h.hit_count,
         h.sources_json, h.filters_json, h.meta_json
  FROM query_hits h
  JOIN urls u ON u.id = h.url_id
`;

export const EXPORT_SELECT_COLUMNS = `
  h.query_norm, h.engine_type, u.url, u.url_norm, u.source_engine,
  u.title, u.snippet, u.thumbnail, u.image_url, u.is_gif, u.duration,
  u.extras_json, h.first_seen, h.last_seen, NULL AS source_instance,
  h.best_position, h.pos_sum, h.hit_count,
  h.sources_json, h.filters_json, h.meta_json
` as const;
