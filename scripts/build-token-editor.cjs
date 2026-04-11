/**
 * Keep NEXT_PUBLIC_DEPLOY_ORIGIN in sync with .github/workflows/deploy.yml.
 * Use your canonical site URL (custom domain or https://<user>.github.io/<repo>).
 */
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const origin = "https://iris.abhiroopverse.com";
const env = { ...process.env, NEXT_PUBLIC_DEPLOY_ORIGIN: origin };

const r = spawnSync("npm", ["run", "build"], {
  cwd: path.join(__dirname, "..", "token-editor"),
  stdio: "inherit",
  env,
  shell: true,
});

process.exit(r.status ?? 1);
