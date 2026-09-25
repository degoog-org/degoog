<?php

/*
	read one line, do what it says, print one line, die. no daemon, no pool,
	no state left behind. warnings go to stderr because stdout is the wire.
*/

ini_set("display_errors", "stderr");
ini_set("html_errors", "0");

require __DIR__ . "/bridge/rpc.php";
require __DIR__ . "/bridge/stage.php";
require __DIR__ . "/bridge/results.php";
require __DIR__ . "/bridge/actions.php";

$line = fgets(bridge_rpc::stdin());

if($line === false){

	bridge_rpc::died("nothing on stdin");
	exit(1);
}

$payload = json_decode(trim($line), true);

if(!is_array($payload)){

	bridge_rpc::died("degoog sent a malformed payload");
	exit(1);
}

try {

	bridge_rpc::done(actions::run($payload));
} catch(Throwable $e){

	bridge_rpc::died($e->getMessage(), $e->getTraceAsString());
	exit(1);
}
