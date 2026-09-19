<?php

/*
	lolcat's scrapers are perfectly good php and we do not patch a line of them.
	we just re-read them into our own namespace so their curl_*() calls hit our
	shims instead of the real ones. the source on disk stays pristine, which is
	what lets "update" stay a dumb re-download.
*/

class stager {

	const SANDBOX = "Degoog\\FourGet\\Sandbox";
	const RECIPE = "1";

	/*
		functions fall back to the global namespace, classes do fucking not.
		miss one of these and a scraper throwing an Exception goes looking for
		Degoog\FourGet\Sandbox\Exception and takes the whole process with it.
	*/
	const IMPORTS = [
		"Exception", "Throwable", "Error", "TypeError", "ValueError",
		"ArgumentCountError", "JsonException", "DateTime", "DateTimeImmutable",
		"DateTimeZone", "DateInterval", "SQLite3", "SQLite3Result", "SQLite3Stmt",
		"stdClass", "ArrayObject", "Generator", "Closure", "DOMDocument",
		"DOMXPath", "SimpleXMLElement",
	];

	public static function prelude(){

		$lines = ["<?php", "", "namespace " . self::SANDBOX . ";", ""];

		foreach(self::IMPORTS as $class){

			$lines[] = "use {$class};";
		}

		$lines[] = "";
		return implode("\n", $lines) . "\n";
	}

	public static function wrap(string $source){

		$at = strpos($source, "<?php");

		if($at === false){

			throw new Exception("this file is not php");
		}

		return self::prelude() . substr($source, $at + strlen("<?php"));
	}

	/*
		every scraper includes lib/backend.php from its own constructor, and
		plain include runs the damn file again. loading two scrapers in one
		process would redeclare the class and take the process with it, so the
		staged libs get a bouncer on the door.
	*/
	public static function guard(string $class){

		return "if(class_exists(__NAMESPACE__ . " . var_export("\\" . $class, true) . ", false)){ return; }\n\n";
	}

	public static function stamp(){

		return substr(hash("sha256", self::RECIPE . self::prelude() . self::guard("x")), 0, 16);
	}

	private static function putAtomic(string $path, string $body){

		$dir = dirname($path);

		if(!is_dir($dir)){

			mkdir($dir, 0o755, true);
		}

		$tmp = $path . "." . getmypid() . "." . bin2hex(random_bytes(4)) . ".tmp";

		if(file_put_contents($tmp, $body) === false){

			throw new Exception("could not write {$tmp}");
		}

		if(!rename($tmp, $path)){

			@unlink($tmp);
			throw new Exception("could not place {$path}");
		}
	}

	public static function stageFile(string $src, string $dst, string $guard = ""){

		if(!is_file($src)){

			throw new Exception("missing " . basename($src));
		}

		if(is_file($dst) && filemtime($dst) >= filemtime($src)){

			return;
		}

		$source = file_get_contents($src);

		if($source === false){

			throw new Exception("could not read " . basename($src));
		}

		$body = self::wrap($source);

		if($guard !== ""){

			$at = strpos($body, "\n\n", strpos($body, "use "));
			$body = substr($body, 0, $at + 2) . self::guard($guard) . substr($body, $at + 2);
		}

		self::putAtomic($dst, $body);
	}

	private static function literal($value){

		if($value === null){

			return "null";
		}

		if(is_bool($value)){

			return $value ? "true" : "false";
		}

		if(is_int($value) || is_float($value)){

			return (string)$value;
		}

		return var_export((string)$value, true);
	}

	/*
		backend::get_ip() reaches for its proxy pool through
		constant("config::PROXY_" . strtoupper($scraper)), and a class name
		inside a string gets no namespace resolution, so it wants a global
		config. the scrapers say config::USER_AGENT unqualified and want a
		namespaced one. declare it once, alias it, everybody is happy.
	*/
	public static function config(array $values, string $dst){

		$lines = ["<?php", "", "class config {", ""];

		foreach($values as $name => $value){

			if(!preg_match('/^[A-Z][A-Z0-9_]*$/', (string)$name)){

				continue;
			}

			$lines[] = "\tconst {$name} = " . self::literal($value) . ";";
		}

		$lines[] = "}";
		$lines[] = "";
		$lines[] = 'class_alias("config", "' . str_replace("\\", "\\\\", self::SANDBOX) . '\\\\config");';
		$lines[] = "";

		self::putAtomic($dst, implode("\n", $lines) . "\n");
	}

	public static function apiKey(string $scraper, $key, string $root){

		if($key === null || trim((string)$key) === ""){

			return;
		}

		self::putAtomic($root . "/data/api_keys/" . $scraper . ".txt", trim((string)$key) . "\n");
	}
}
