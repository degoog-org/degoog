import { registerTrap } from "../registry";

const FAKE_PHP_ERROR = `<br />
<b>Warning</b>: require(/var/www/html/vendor/autoload.php): Failed to open stream: No such file or directory in <b>/var/www/html/index.php</b> on line <b>3</b><br />
<br />
<b>Fatal error</b>: Uncaught Error: Failed opening required '/var/www/html/vendor/autoload.php' (include_path='.:/usr/share/php') in /var/www/html/index.php:3
Stack trace:
#0 {main}
  thrown in <b>/var/www/html/index.php</b> on line <b>3</b><br />
`;

registerTrap({
  id: "php",
  paths: [
    "/phpMyAdmin",
    "/phpmyadmin",
    "/admin.php",
    "/config.php",
    "/shell.php",
    "/setup.php",
    "/install.php",
    "/xmlrpc.php",
    "/backup.php",
    "/wp-config.php",
    "/config/database.php",
  ],
  respond: () => new Response(FAKE_PHP_ERROR, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  }),
});
