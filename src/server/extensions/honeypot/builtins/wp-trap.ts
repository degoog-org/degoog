import type { Context } from "hono";
import { registerTrap } from "../registry";

const WP_HTML = `<!DOCTYPE html>
<html lang="en-US">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Log In &lsaquo; WordPress &#8212; WordPress</title>
</head>
<body class="login wp-core-ui">
<div id="login">
  <h1><a href="https://wordpress.org/">WordPress</a></h1>
  <div class="notice notice-error"><p>The link you followed has expired.</p></div>
  <form name="loginform" id="loginform" action="/wp-login.php" method="post">
    <p>
      <label for="user_login">Username or Email Address</label>
      <input type="text" name="log" id="user_login" class="input" value="" size="20" autocapitalize="none" autocomplete="username" />
    </p>
    <p>
      <label for="user_pass">Password</label>
      <input type="password" name="pwd" id="user_pass" class="input" value="" size="20" autocomplete="current-password" />
    </p>
    <p class="submit">
      <input type="submit" name="wp-submit" id="wp-submit" class="button button-primary button-large" value="Log In" />
    </p>
    <input type="hidden" name="redirect_to" value="/wp-admin/" />
    <input type="hidden" name="testcookie" value="1" />
  </form>
</div>
</body>
</html>`;

registerTrap({
  id: "wp",
  paths: ["/wp-admin", "/wp-admin/", "/wp-login.php", "/wp-login"],
  respond: (_c: Context) => new Response(WP_HTML, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  }),
});
