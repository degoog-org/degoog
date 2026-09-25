<?php

/*
	runs once and then it fucks off. boots the sandbox, does the thing.
	same deal as the searx runner next door, but this one somewhat feels much cooler.
*/

class actions {

	const SANDBOX = "Degoog\\FourGet\\Sandbox\\";

	private static $root = "";

	/*
		with all due respect... degoog decides what a type is called, not you. it hands over the page
		list every run, which method to call, which name getfilters wants, and
		what degoog calls the results. you just do as you are told.
	*/
	private static function pages(array $payload){

		$out = [];

		foreach(($payload["pages"] ?? []) as $page){

			if(!isset($page["type"], $page["method"])){

				continue;
			}

			$out[] = [
				"type" => (string)$page["type"],
				"method" => (string)$page["method"],
				"filters" => (string)($page["filters"] ?? $page["method"]),
			];
		}

		return $out;
	}

	public static function boot(array $payload){

		self::$root = rtrim((string)($payload["root"] ?? ""), "/");

		if(self::$root === ""){

			throw new Exception("no staging root given");
		}

		foreach(["lib", "scraper", "data/api_keys", "data/sessions"] as $dir){

			$path = self::$root . "/" . $dir;

			if(!is_dir($path)){

				mkdir($path, 0o755, true);
			}
		}

		self::freshen();

		foreach(($payload["libs"] ?? []) as $lib){

			stager::stageFile($lib["src"], self::$root . "/lib/" . $lib["code"] . ".php", $lib["code"]);
		}

		foreach(($payload["scrapers"] ?? []) as $scraper){

			stager::stageFile($scraper["src"], self::$root . "/scraper/" . $scraper["code"] . ".php");
		}

		stager::config($payload["config"] ?? [], self::$root . "/data/config.php");

		foreach(($payload["apiKeys"] ?? []) as $code => $key){

			stager::apiKey((string)$code, $key, self::$root);
		}

		chdir(self::$root);

		include self::$root . "/data/config.php";
		include __DIR__ . "/shims.php";
	}

	/*
		prelude changed, so every staged file is stale. bin them and let
		stageFile write fresh ones.
	*/
	private static function freshen(){

		$stampFile = self::$root . "/.stamp";
		$want = stager::stamp();

		if(is_file($stampFile) && trim((string)file_get_contents($stampFile)) === $want){

			return;
		}

		foreach(["lib", "scraper"] as $dir){

			foreach(glob(self::$root . "/" . $dir . "/*.php") ?: [] as $stale){

				@unlink($stale);
			}
		}

		file_put_contents($stampFile, $want . "\n");
	}

	private static function summon(string $code){

		$file = self::$root . "/scraper/" . $code . ".php";

		if(!is_file($file)){

			throw new Exception("{$code} is not installed");
		}

		$class = self::SANDBOX . $code;

		if(!class_exists($class, false)){

			include $file;
		}

		if(!class_exists($class, false)){

			throw new Exception("{$code}.php does not declare a {$code} class");
		}

		return new $class();
	}

	private static function filters($scraper, string $page){

		if(!method_exists($scraper, "getfilters")){

			return [];
		}

		$raw = $scraper->getfilters($page);
		return is_array($raw) ? $raw : [];
	}

	public static function discover(array $payload){

		$out = [];

		foreach(($payload["codes"] ?? []) as $code){

			$entry = ["code" => $code, "types" => [], "filters" => (object)[]];
			$filters = [];

			try {

				$scraper = self::summon($code);

				foreach(self::pages($payload) as $page){

					if(!method_exists($scraper, $page["method"])){

						continue;
					}

					$entry["types"][] = $page["type"];
					$filters[$page["type"]] = (object)self::filters($scraper, $page["filters"]);
				}

				$entry["filters"] = (object)$filters;

				if(count($entry["types"]) === 0){

					$entry["error"] = "nothing degoog asked for is on this scraper";
				}
			} catch(Throwable $e){

				$entry["error"] = $e->getMessage();
			}

			$out[] = $entry;
		}

		return ["engines" => $out];
	}

	/*
		parsegetfilters() normally fills every whitelisted key before a scraper
		runs, and scrapers assume that happened. we are not using the frontend,
		so we do the same job here: every filter gets its default, then degoog's
		own settings and time filter get to override.
	*/
	private static function params(array $filters, array $payload, string $query){

		$get = ["s" => $query, "npt" => $payload["npt"] ?? false];

		foreach($filters as $name => $filter){

			$option = $filter["option"] ?? null;

			if(is_array($option)){

				$keys = array_keys($option);
				$get[$name] = $keys[0] ?? false;
				continue;
			}

			if($option === "_SEARCH"){

				$get[$name] = $query;
				continue;
			}

			$get[$name] = false;
		}

		foreach(($payload["overrides"] ?? []) as $name => $value){

			if(array_key_exists($name, $filters) && is_array($filters[$name]["option"] ?? null)){

				if(array_key_exists($value, $filters[$name]["option"])){

					$get[$name] = $value;
				}
			}
		}

		return self::timing($get, $filters, $payload);
	}

	private static function timing(array $get, array $filters, array $payload){

		$range = $payload["timeRange"] ?? null;

		if($range !== null && isset($filters["date"]["option"]) && is_array($filters["date"]["option"])){

			if(array_key_exists($range, $filters["date"]["option"])){

				$get["date"] = $range;
			}
		}

		foreach(["newer" => "dateFrom", "older" => "dateTo"] as $name => $key){

			if(($filters[$name]["option"] ?? null) !== "_DATE"){

				continue;
			}

			$stamp = $payload[$key] ?? null;

			if(is_numeric($stamp) && (int)$stamp > 0){

				$get[$name] = (int)$stamp;
			}
		}

		$nsfw = $payload["nsfw"] ?? null;

		if($nsfw !== null && isset($filters["nsfw"]["option"]) && array_key_exists($nsfw, $filters["nsfw"]["option"])){

			$get["nsfw"] = $nsfw;
		}

		return $get;
	}

	public static function search(array $payload){

		$code = (string)($payload["code"] ?? "");
		$type = (string)($payload["type"] ?? "web");
		$query = (string)($payload["query"] ?? "");

		$page = null;

		foreach(self::pages($payload) as $candidate){

			if($candidate["type"] === $type){

				$page = $candidate;
				break;
			}
		}

		if($page === null){

			throw new Exception("4get has no {$type} page");
		}

		$method = $page["method"];
		$scraper = self::summon($code);

		if(!method_exists($scraper, $method)){

			throw new Exception("{$code} has no {$type} results");
		}

		$filters = self::filters($scraper, $page["filters"]);
		$get = self::params($filters, $payload, $query);

		$result = $scraper->$method($get);

		if(!is_array($result)){

			throw new Exception("{$code} returned nothing usable");
		}

		$status = $result["status"] ?? "ok";

		if($status !== "ok"){

			throw new Exception((string)$status);
		}

		return [
			"results" => shaper::pick($result, $type, (string)($payload["source"] ?? $code)),
			"npt" => $result["npt"] ?? null,
			"related" => shaper::related($result),
		];
	}

	public static function run(array $payload){

		self::boot($payload);

		switch($payload["action"] ?? ""){

			case "discover":
				return self::discover($payload);

			case "search":
				return self::search($payload);
		}

		throw new Exception("unknown action");
	}
}
