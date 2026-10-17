# End-to-end tests

Run from `web/` against a site that is already up. Chrome must be installed locally; the config uses `channel: "chrome"` and does not download Playwright browsers.

Set `E2E_BASE_URL` (default `http://localhost:3000`), `E2E_REP_EMAIL` (default `rep@demo.local`), and `E2E_REP_PASSWORD` in the shell or in `web/.env.local`. The rep challenge skips when the password is missing. The site must serve the app itself; a Vercel login wall blocks every test. These tests are not part of CI.

`pnpm e2e` runs the suite. `pnpm e2e:headed` opens Chrome. Traces are kept on the first retry, and failure screenshots land in `test-results/`.
