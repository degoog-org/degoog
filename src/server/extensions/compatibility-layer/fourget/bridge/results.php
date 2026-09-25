<?php

/*
	4get hands back its own shapes, degoog wants SearchResult. we flatten here
	rather than in typescript so the ts side just forwards whatever it is given,
	same as the searx bridge does.
*/

class shaper {

	const LIVE = "_LIVE";

	private static function text($value){

		if(is_string($value)){

			return $value;
		}

		if(is_array($value)){

			$out = [];

			foreach($value as $node){

				if(is_string($node)){

					$out[] = $node;
				} elseif(is_array($node) && isset($node["value"]) && is_string($node["value"])){

					$out[] = $node["value"];
				}
			}

			return implode(" ", $out);
		}

		return "";
	}

	private static function thumb($entry){

		if(!isset($entry["thumb"])){

			return null;
		}

		$thumb = $entry["thumb"];

		if(is_string($thumb)){

			return $thumb === "" ? null : $thumb;
		}

		if(is_array($thumb) && isset($thumb["url"]) && is_string($thumb["url"]) && $thumb["url"] !== ""){

			return $thumb["url"];
		}

		return null;
	}

	public static function clock($seconds){

		if($seconds === self::LIVE){

			return "LIVE";
		}

		if(!is_numeric($seconds)){

			return null;
		}

		$total = (int)$seconds;

		if($total <= 0){

			return null;
		}

		$hours = intdiv($total, 3600);
		$minutes = intdiv($total % 3600, 60);
		$secs = $total % 60;

		if($hours > 0){

			return sprintf("%d:%02d:%02d", $hours, $minutes, $secs);
		}

		return sprintf("%d:%02d", $minutes, $secs);
	}

	private static function published(array $entry){

		$raw = $entry["date"] ?? null;

		if(!is_numeric($raw)){

			return null;
		}

		$stamp = (int)$raw;

		if($stamp <= 0){

			return null;
		}

		return gmdate("Y-m-d", $stamp);
	}

	private static function page(array $entry, string $source){

		$url = (string)($entry["url"] ?? "");

		if($url === ""){

			return null;
		}

		$out = [
			"title" => self::text($entry["title"] ?? ""),
			"url" => $url,
			"snippet" => self::text($entry["description"] ?? ""),
			"source" => $source,
		];

		$thumb = self::thumb($entry);

		if($thumb !== null){

			$out["thumbnail"] = $thumb;
		}

		$published = self::published($entry);

		if($published !== null){

			$out["publishedAt"] = $published;
		}

		return $out;
	}

	/*
		the last entry of "source" is always the thumbnail, says lolcat, and the
		first is the biggest. so the first is what we show and the last is what
		we fall back to when the host inevitably hotlink blocks us.
	*/
	private static function picture(array $entry, string $source){

		$sources = $entry["source"] ?? [];

		if(!is_array($sources) || count($sources) === 0){

			return null;
		}

		$sources = array_values($sources);
		$full = $sources[0]["url"] ?? null;
		$thumb = $sources[count($sources) - 1]["url"] ?? null;

		if(!is_string($full) || $full === ""){

			return null;
		}

		$out = [
			"title" => self::text($entry["title"] ?? ""),
			"url" => (string)($entry["url"] ?? $full),
			"snippet" => "",
			"source" => $source,
			"imageUrl" => $full,
		];

		if(is_string($thumb) && $thumb !== ""){

			$out["thumbnail"] = $thumb;
		}

		$path = parse_url($full, PHP_URL_PATH);

		if(str_ends_with(strtolower(($path === null || $path === "") ? $full : $path), ".gif")){

			$out["isGif"] = true;
		}

		return $out;
	}

	private static function reel(array $entry, string $source){

		$out = self::page($entry, $source);

		if($out === null){

			return null;
		}

		$duration = self::clock($entry["duration"] ?? null);

		if($duration !== null){

			$out["duration"] = $duration;
		}

		return $out;
	}

	public static function pick(array $payload, string $type, string $source){

		$out = [];

		$buckets = [
			"web" => ["web", "page"],
			"news" => ["news", "page"],
			"images" => ["image", "picture"],
			"videos" => ["video", "reel"],
			"music" => ["song", "page"],
		];

		if(!isset($buckets[$type])){

			return $out;
		}

		[$key, $how] = $buckets[$type];
		$entries = $payload[$key] ?? [];

		if(!is_array($entries)){

			return $out;
		}

		foreach($entries as $entry){

			if(!is_array($entry)){

				continue;
			}

			$one = self::$how($entry, $source);

			if($one !== null){

				$out[] = $one;
			}
		}

		return $out;
	}

	public static function related(array $payload){

		$out = [];

		foreach(($payload["related"] ?? []) as $entry){

			if(is_string($entry) && $entry !== ""){

				$out[] = $entry;
			} elseif(is_array($entry) && isset($entry["title"]) && is_string($entry["title"])){

				$out[] = $entry["title"];
			}
		}

		return $out;
	}
}
