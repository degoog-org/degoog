import { registerTrap } from "../registry";

const FAKE_ENV = `APP_NAME=MyApplication
APP_ENV=production
APP_KEY=base64:kxh4NpjYJaOp8kNz2Qw3X5vB7mRsL9eHcW1tUiYo=
APP_DEBUG=false
APP_URL=https://example.com

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=production_db
DB_USERNAME=db_admin
DB_PASSWORD=Str0ngP@ssw0rd!2024

REDIS_HOST=127.0.0.1
REDIS_PASSWORD=redis_s3cr3t_99x
REDIS_PORT=6379

MAIL_MAILER=smtp
MAIL_HOST=smtp.mailgun.org
MAIL_PORT=587
MAIL_USERNAME=noreply@example.com
MAIL_PASSWORD=mg_live_key_8f2a9b3c

AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AWS_DEFAULT_REGION=us-east-1
AWS_BUCKET=my-production-assets

STRIPE_SECRET_KEY=sk_live_51NxExampleKeyHereDoNotUse
STRIPE_WEBHOOK_SECRET=whsec_examplewebhooksecrethere
`;

const FAKE_GIT_CONFIG = `[core]
\trepositoryformatversion = 0
\tfilemode = true
\tbare = false
\tlogallrefupdates = true
[remote "origin"]
\turl = https://github.com/example-org/private-repo.git
\tfetch = +refs/heads/*:refs/remotes/origin/*
[branch "main"]
\tremote = origin
\tmerge = refs/heads/main
[user]
\temail = admin@example.com
\tname = Admin User
`;

registerTrap({
  id: "env",
  paths: ["/.env", "/.env.local", "/.env.backup", "/.env.prod", "/.env.staging", "/.env.example", "/.env.production"],
  respond: () => new Response(FAKE_ENV, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  }),
});

registerTrap({
  id: "git",
  paths: ["/.git/config", "/.gitconfig", "/.git/HEAD"],
  respond: () => new Response(FAKE_GIT_CONFIG, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  }),
});
