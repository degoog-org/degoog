<?php
/*
	stdout is the wire, not a fucking console. one line per message or
	degoog chokes on it. anything you echo in here breaks the protocol.
*/
class bridge_rpc {

	private static $id = 0;
	private static $in = null;

	public static function stdin(){

		if(self::$in === null){

			self::$in = fopen("php://stdin", "r");
		}

		return self::$in;
	}

	public static function say(array $payload){

		fwrite(STDOUT, json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE) . "\n");
		fflush(STDOUT);
	}

	public static function call(string $kind, array $payload){

		self::$id++;
		$id = self::$id;

		self::say(array_merge($payload, ["rpc" => $kind, "id" => $id]));

		$line = fgets(self::stdin());

		if($line === false){

			throw new Exception("degoog hung up during {$kind}");
		}

		$reply = json_decode(trim($line), true);

		if(!is_array($reply)){

			throw new Exception("degoog sent a malformed {$kind} reply");
		}

		if(empty($reply["ok"])){

			throw new Exception($reply["error"] ?? "{$kind} failed");
		}

		return $reply["data"] ?? null;
	}

	public static function done($data){

		self::say(["ok" => true, "data" => $data]);
	}

	public static function died(string $error, string $trace = ""){

		self::say(["ok" => false, "error" => $error, "trace" => $trace]);
	}
}
