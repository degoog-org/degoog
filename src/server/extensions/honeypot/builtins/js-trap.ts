import { registerTrap } from "../registry";

const FAKE_PACKAGE_JSON = JSON.stringify({
  name: "my-application",
  version: "2.4.1",
  private: true,
  scripts: {
    start: "node server.js",
    dev: "nodemon server.js",
    build: "webpack --config webpack.config.js --mode production",
    test: "jest --coverage",
  },
  dependencies: {
    express: "^4.18.2",
    mongoose: "^7.6.3",
    jsonwebtoken: "^9.0.2",
    bcryptjs: "^2.4.3",
    dotenv: "^16.3.1",
    cors: "^2.8.5",
  },
  devDependencies: {
    nodemon: "^3.0.1",
    jest: "^29.7.0",
    webpack: "^5.89.0",
  },
}, null, 2);

const FAKE_DOCKERFILE = `FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
ENV NODE_ENV=production
ENV DB_URL=mongodb://db:27017/myapp
ENV SECRET_KEY=do_not_use_in_production_abc123
CMD ["node", "server.js"]
`;

const FAKE_COMPOSE = `version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DB_URL=mongodb://db:27017/myapp
      - JWT_SECRET=jwt_secret_key_here_change_me
      - ADMIN_PASSWORD=admin_default_password_2024
    depends_on:
      - db
  db:
    image: mongo:7
    volumes:
      - mongo_data:/data/db
volumes:
  mongo_data:
`;

const FAKE_SERVER_JS = `'use strict';

const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = express();

const PORT = process.env.PORT || 3000;
const DB_URL = process.env.DB_URL || 'mongodb://localhost:27017/myapp';
const SECRET = process.env.SECRET_KEY || 'fallback_dev_secret';

mongoose.connect(DB_URL);
app.use(express.json());

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  // TODO: replace with real auth
  if (username === 'admin' && password === process.env.ADMIN_PASSWORD) {
    const token = jwt.sign({ role: 'admin' }, SECRET, { expiresIn: '24h' });
    return res.json({ token });
  }
  res.status(401).json({ error: 'Invalid credentials' });
});

app.listen(PORT, () => console.log(\`Server running on port \${PORT}\`));
`;

const FAKE_NPMRC = `registry=https://registry.npmjs.org/
//registry.npmjs.org/:_authToken=npm_ExampleTokenABCDEFGHIJKLMNOPQRSTUVWXYZ
save-exact=true
`;

const FAKE_CI = `name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - name: Deploy to server
        env:
          DEPLOY_KEY: \${{ secrets.DEPLOY_SSH_KEY }}
          SERVER_HOST: 192.168.1.100
        run: ssh -i \$DEPLOY_KEY deploy@\$SERVER_HOST 'cd /app && git pull && npm ci && pm2 restart all'
`;

const FAKE_API_UNAUTH = JSON.stringify({
  error: "Unauthorized",
  message: "A valid authentication token is required to access this resource.",
  code: 401,
}, null, 2);

registerTrap({
  id: "js-package",
  paths: ["/package.json", "/package-lock.json", "/yarn.lock"],
  respond: () => new Response(FAKE_PACKAGE_JSON, {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  }),
});

registerTrap({
  id: "js-docker",
  paths: ["/Dockerfile", "/docker-compose.yml", "/docker-compose.yaml", "/.dockerenv"],
  respond: () => new Response(FAKE_DOCKERFILE, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  }),
});

registerTrap({
  id: "js-compose",
  paths: ["/docker-compose.prod.yml", "/docker-compose.production.yml"],
  respond: () => new Response(FAKE_COMPOSE, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  }),
});

registerTrap({
  id: "js-server",
  paths: ["/server.js", "/app.js", "/index.js", "/main.js"],
  respond: () => new Response(FAKE_SERVER_JS, {
    status: 200,
    headers: { "Content-Type": "application/javascript; charset=utf-8" },
  }),
});

registerTrap({
  id: "js-npm",
  paths: ["/.npmrc", "/.nvmrc", "/.node-version"],
  respond: () => new Response(FAKE_NPMRC, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  }),
});

registerTrap({
  id: "js-ci",
  paths: ["/.github/workflows/main.yml", "/.github/workflows/deploy.yml", "/.travis.yml"],
  respond: () => new Response(FAKE_CI, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  }),
});

registerTrap({
  id: "js-api",
  paths: ["/api/v1/users", "/api/v1/admin", "/api/config", "/api/admin"],
  respond: () => new Response(FAKE_API_UNAUTH, {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  }),
});
