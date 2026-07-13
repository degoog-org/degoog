import { EXPORT_SELECT_SQL } from "../../shared/export-select";

export const UPSERT_URL = `
  INSERT INTO urls (
    url_norm, url, source_engine, title, snippet,
    thumbnail, image_url, is_gif, duration, extras_json,
    first_seen, last_seen
  ) VALUES (
    $url_norm, $url, $source_engine, $title, $snippet,
    $thumbnail, $image_url, $is_gif, $duration, $extras_json,
    $first_seen, $last_seen
  )
  ON CONFLICT(url_norm) DO UPDATE SET
    last_seen = excluded.last_seen,
    title = CASE WHEN length(urls.title) >= length(excluded.title) THEN urls.title ELSE excluded.title END,
    snippet = CASE WHEN length(urls.snippet) >= length(excluded.snippet) THEN urls.snippet ELSE excluded.snippet END,
    thumbnail = COALESCE(urls.thumbnail, excluded.thumbnail),
    image_url = COALESCE(urls.image_url, excluded.image_url),
    is_gif = COALESCE(urls.is_gif, excluded.is_gif),
    duration = COALESCE(urls.duration, excluded.duration),
    extras_json = COALESCE(urls.extras_json, excluded.extras_json)
  RETURNING id
`;

export const UPSERT_HIT = `
  INSERT INTO query_hits (
    query_norm, engine_type, url_id, best_position, pos_sum, hit_count,
    sources_json, filters_json, meta_json, first_seen, last_seen
  )
  VALUES (
    $query_norm, $engine_type, $url_id, $best_position, $best_position, 1,
    $sources_json, $filters_json, $meta_json, $first_seen, $last_seen
  )
  ON CONFLICT(query_norm, engine_type, url_id) DO UPDATE SET
    last_seen = excluded.last_seen,
    best_position = MIN(query_hits.best_position, excluded.best_position),
    pos_sum = query_hits.pos_sum + excluded.pos_sum,
    hit_count = query_hits.hit_count + 1,
    sources_json = (
      SELECT json_group_array(value) FROM (
        SELECT value FROM json_each(COALESCE(query_hits.sources_json, '[]'))
        UNION
        SELECT value FROM json_each(COALESCE(excluded.sources_json, '[]'))
      )
    ),
    filters_json = COALESCE(NULLIF(excluded.filters_json, ''), query_hits.filters_json),
    meta_json = COALESCE(query_hits.meta_json, excluded.meta_json)
`;

export const IMPORT_URL = `
  INSERT INTO urls (
    url_norm, url, source_engine, title, snippet,
    thumbnail, image_url, is_gif, duration, extras_json,
    first_seen, last_seen
  ) VALUES (
    $url_norm, $url, $source_engine, $title, $snippet,
    $thumbnail, $image_url, $is_gif, $duration, $extras_json,
    $first_seen, $last_seen
  )
  ON CONFLICT(url_norm) DO NOTHING
  RETURNING id
`;

export const IMPORT_HIT = `
  INSERT INTO query_hits (query_norm, engine_type, url_id, best_position, hit_count, first_seen, last_seen)
  VALUES ($query_norm, $engine_type, $url_id, 9999, 1, $first_seen, $last_seen)
  ON CONFLICT(query_norm, engine_type, url_id) DO NOTHING
`;

export const EXACT_SQL = `
  SELECT u.url, u.source_engine, u.title, u.snippet, u.thumbnail,
         u.image_url, u.is_gif, u.duration, u.extras_json
  FROM query_hits h
  JOIN urls u ON u.id = h.url_id
  WHERE h.query_norm = ? AND h.engine_type = ?
  ORDER BY (h.pos_sum * 1.0 / h.hit_count) ASC, h.hit_count DESC, h.best_position ASC
  LIMIT ? OFFSET ?
`;

export const FUZZY_SQL = `
  SELECT u.url, u.source_engine, u.title, u.snippet, u.thumbnail,
         u.image_url, u.is_gif, u.duration, u.extras_json
  FROM urls_fts f
  JOIN urls u ON u.id = f.rowid
  JOIN query_hits h ON h.url_id = u.id
  WHERE urls_fts MATCH ?
    AND h.engine_type = ?
    AND h.query_norm != ?
  ORDER BY rank, h.last_seen DESC
  LIMIT ? OFFSET ?
`;

export const LIST_SELECT = `
  SELECT h.id, h.query_norm, h.engine_type, u.url, u.title, u.snippet, h.last_seen
  FROM query_hits h
  JOIN urls u ON u.id = h.url_id
`;

export const SEARCH_WHERE = `
  WHERE h.query_norm LIKE $term ESCAPE '\\'
     OR u.url LIKE $term ESCAPE '\\'
     OR u.title LIKE $term ESCAPE '\\'
`;

export const EXPORT_SQL = EXPORT_SELECT_SQL;
