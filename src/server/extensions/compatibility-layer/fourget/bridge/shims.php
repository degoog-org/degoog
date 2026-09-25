<?php

namespace Degoog\FourGet\Sandbox;

use Exception;
use bridge_rpc;

/*
	scrapers get loaded into this namespace, so their curl_*() and apcu_*()
	calls land on our shit instead of php's. everything we don't shim falls
	through to the real thing, which is the whole trick.

	with love and thanks to lolcat, whose fuckhtml gave this file its name.
*/

const CURL_OPTS = [
	"CURLOPT_URL", "CURLOPT_HTTPHEADER", "CURLOPT_POST", "CURLOPT_POSTFIELDS",
	"CURLOPT_RETURNTRANSFER", "CURLOPT_HEADER", "CURLOPT_HEADERFUNCTION",
	"CURLOPT_FOLLOWLOCATION", "CURLOPT_MAXREDIRS", "CURLOPT_TIMEOUT",
	"CURLOPT_CONNECTTIMEOUT", "CURLOPT_ENCODING", "CURLOPT_SSL_VERIFYPEER",
	"CURLOPT_SSL_VERIFYHOST", "CURLOPT_HTTP_VERSION", "CURLOPT_CUSTOMREQUEST",
	"CURLOPT_PROXY", "CURLOPT_PROXYTYPE", "CURLOPT_PROXYUSERPWD",
	"CURLOPT_AUTOREFERER", "CURLOPT_BUFFERSIZE", "CURLOPT_NOBODY",
	"CURLOPT_COOKIE", "CURLOPT_USERAGENT", "CURLOPT_REFERER",
	"CURLOPT_NOPROGRESS", "CURLOPT_PROGRESSFUNCTION", "CURLOPT_WRITEFUNCTION",
	"CURLOPT_VERBOSE", "CURLOPT_STDERR", "CURLOPT_COOKIEFILE", "CURLOPT_COOKIEJAR",
	"CURLPROXY_HTTP", "CURLPROXY_SOCKS5", "CURLPROXY_SOCKS5_HOSTNAME",
	"CURL_HTTP_VERSION_1_1", "CURL_HTTP_VERSION_2_0", "CURL_HTTP_VERSION_2TLS",
	"CURLINFO_HTTP_CODE", "CURLINFO_RESPONSE_CODE", "CURLINFO_EFFECTIVE_URL",
	"CURLINFO_CONTENT_TYPE", "CURLINFO_REDIRECT_URL", "CURLINFO_TOTAL_TIME",
];

/*
	no ext-curl means no CURLOPT_* constants. nobody but this file ever reads
	the damn things, so they get defined as their own names. unique, no
	collisions, and you can actually read them in a log.
*/
function definePlaceholders(){

	foreach(CURL_OPTS as $name){

		if(!defined($name)){

			define($name, $name);
		}
	}
}

definePlaceholders();

class fuckcurl {

	public $opts = [];
	public $error = "";
	public $errno = 0;
	public $info = ["http_code" => 0, "url" => "", "content_type" => ""];
	public $ignored = [];

	public function __construct($url = null){

		if($url !== null){

			$this->opts[CURLOPT_URL] = $url;
		}
	}

	private function opt($name, $fallback = null){

		return array_key_exists($name, $this->opts) ? $this->opts[$name] : $fallback;
	}

	private function headers(){

		$out = [];
		$raw = $this->opt(CURLOPT_HTTPHEADER, []);

		if(is_array($raw)){

			foreach($raw as $line){

				$split = explode(":", (string)$line, 2);

				if(count($split) === 2){

					$out[trim($split[0])] = trim($split[1]);
				}
			}
		}

		$agent = $this->opt(CURLOPT_USERAGENT);

		if($agent !== null){

			$out["User-Agent"] = (string)$agent;
		}

		$referer = $this->opt(CURLOPT_REFERER);

		if($referer !== null){

			$out["Referer"] = (string)$referer;
		}

		return $out;
	}

	private function body(){

		$fields = $this->opt(CURLOPT_POSTFIELDS);

		if($fields === null){

			return null;
		}

		return is_array($fields) ? http_build_query($fields) : (string)$fields;
	}

	private function method(){

		$custom = $this->opt(CURLOPT_CUSTOMREQUEST);

		if($custom !== null){

			return strtoupper((string)$custom);
		}

		if($this->opt(CURLOPT_NOBODY)){

			return "HEAD";
		}

		return $this->opt(CURLOPT_POST) ? "POST" : "GET";
	}

	private function cookies(){

		$cookie = $this->opt(CURLOPT_COOKIE);

		if($cookie === null){

			return [];
		}

		$out = [];

		foreach(explode(";", (string)$cookie) as $pair){

			$split = explode("=", trim($pair), 2);

			if(count($split) === 2 && strlen($split[0]) > 0){

				$out[$split[0]] = $split[1];
			}
		}

		return $out;
	}

	private function replayHeaders(array $reply){

		$fn = $this->opt(CURLOPT_HEADERFUNCTION);

		if(!is_callable($fn)){

			return;
		}

		$status = (int)($reply["status"] ?? 0);
		$fn($this, "HTTP/1.1 {$status}\r\n");

		foreach(($reply["headers"] ?? []) as $name => $value){

			$fn($this, "{$name}: {$value}\r\n");
		}

		foreach(self::setCookieLines($reply) as $line){

			$fn($this, "set-cookie: {$line}\r\n");
		}

		$fn($this, "\r\n");
	}

	private static function setCookieLines(array $reply){

		$out = [];

		foreach(($reply["cookies"] ?? []) as $name => $value){

			$out[] = "{$name}={$value}";
		}

		return $out;
	}

	private function rawHeaderBlock(array $reply){

		$status = (int)($reply["status"] ?? 0);
		$lines = ["HTTP/1.1 {$status}"];

		foreach(($reply["headers"] ?? []) as $name => $value){

			$lines[] = "{$name}: {$value}";
		}

		foreach(self::setCookieLines($reply) as $line){

			$lines[] = "set-cookie: {$line}";
		}

		return implode("\r\n", $lines) . "\r\n\r\n";
	}

	public function exec(){

		$url = (string)$this->opt(CURLOPT_URL, "");

		if($url === ""){

			$this->errno = 3;
			$this->error = "no URL set";
			return false;
		}

		$request = [
			"url" => $url,
			"method" => $this->method(),
			"headers" => $this->headers(),
			"cookies" => $this->cookies(),
			"follow" => (bool)$this->opt(CURLOPT_FOLLOWLOCATION),
		];

		$body = $this->body();

		if($body !== null){

			$request["data"] = $body;
		}

		try {

			$reply = bridge_rpc::call("fetch", $request);
		} catch(Exception $e){

			$this->errno = 7;
			$this->error = $e->getMessage();
			return false;
		}

		$this->info = [
			"http_code" => (int)($reply["status"] ?? 0),
			"url" => (string)($reply["url"] ?? $url),
			"content_type" => (string)(($reply["headers"] ?? [])["content-type"] ?? ""),
		];

		$this->replayHeaders($reply);

		$text = (string)($reply["text"] ?? "");

		if($this->opt(CURLOPT_HEADER)){

			$text = $this->rawHeaderBlock($reply) . $text;
		}

		return $text;
	}
}

function curl_init($url = null){

	return new fuckcurl($url);
}

function curl_setopt($handle, $option, $value){

	if(!($handle instanceof fuckcurl)){

		return false;
	}

	$handle->opts[$option] = $value;
	return true;
}

function curl_setopt_array($handle, $options){

	foreach($options as $option => $value){

		curl_setopt($handle, $option, $value);
	}

	return true;
}

function curl_exec($handle){

	return $handle instanceof fuckcurl ? $handle->exec() : false;
}

function curl_getinfo($handle, $option = null){

	if(!($handle instanceof fuckcurl)){

		return false;
	}

	if($option === null){

		return $handle->info;
	}

	switch($option){

		case CURLINFO_EFFECTIVE_URL:
		case CURLOPT_URL:
			return $handle->info["url"];

		case CURLINFO_CONTENT_TYPE:
			return $handle->info["content_type"];

		case CURLINFO_REDIRECT_URL:
			return "";

		case CURLINFO_TOTAL_TIME:
			return 0.0;
	}

	return $handle->info["http_code"];
}

function curl_error($handle){

	return $handle instanceof fuckcurl ? $handle->error : "";
}

function curl_errno($handle){

	return $handle instanceof fuckcurl ? $handle->errno : 0;
}

function curl_close($handle){

	return null;
}

function curl_reset($handle){

	if($handle instanceof fuckcurl){

		$handle->opts = [];
	}
}

/*
	nothing in the catalogue touches multi handles. scream about it rather
	than return nothing and let the engine look like it just found fuck all.
*/
function curl_multi_init(){

	throw new Exception("this scraper uses curl_multi, which the 4get layer does not bridge");
}

/*
	apcu dies with the process and we are a one shot process, so the next page
	token would die with it. these point at degoog's cache instead, which means
	backend::store() and backend::get() keep working exactly as lolcat wrote
	them and pagination survives.
*/

const APCU_TTL_DEFAULT = 900;

function _cacheGet(string $key){

	return bridge_rpc::call("cache", ["op" => "get", "key" => $key]);
}

function _cacheSet(string $key, string $value, int $ttl){

	bridge_rpc::call("cache", [
		"op" => "set",
		"key" => $key,
		"value" => $value,
		"ttl" => $ttl > 0 ? $ttl : APCU_TTL_DEFAULT,
	]);
}

function apcu_enabled(){

	return true;
}

function apcu_store($key, $value = null, $ttl = 0){

	if(is_array($key)){

		foreach($key as $name => $entry){

			apcu_store((string)$name, $entry, $ttl);
		}

		return [];
	}

	_cacheSet((string)$key, base64_encode(serialize($value)), (int)$ttl);
	return true;
}

function apcu_fetch($key, &$success = null){

	$raw = _cacheGet((string)$key);

	if($raw === null || $raw === "" || $raw === false){

		$success = false;
		return false;
	}

	$decoded = base64_decode((string)$raw, true);

	if($decoded === false){

		$success = false;
		return false;
	}

	$value = unserialize($decoded);

	if($value === false && $decoded !== serialize(false)){

		$success = false;
		return false;
	}

	$success = true;
	return $value;
}

function apcu_exists($key){

	apcu_fetch($key, $found);
	return $found === true;
}

function apcu_delete($key){

	_cacheSet((string)$key, "", 1);
	return true;
}

/*
	two of these processes can be mid flight at once, and a shared counter read
	then written is exactly how they would both mint the same requestid and hand
	each other's page back. every counter is local to this process and starts
	somewhere random, so no two processes ever walk the same sequence. nothing
	reads these keys back, they only need to be unique.
*/
function apcu_inc($key, $step = 1, &$success = null, $ttl = 0){

	static $counters = [];

	$name = (string)$key;

	if(!isset($counters[$name])){

		$counters[$name] = random_int(1, 2147483647);
	}

	$counters[$name] += (int)$step;

	$success = true;
	return $counters[$name];
}

function apcu_dec($key, $step = 1, &$success = null, $ttl = 0){

	return apcu_inc($key, -(int)$step, $success, $ttl);
}
