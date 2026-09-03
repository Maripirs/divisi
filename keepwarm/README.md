# divisi-keepwarm

Standalone Cloudflare Worker that GETs the backend's `/health` every 10
minutes (Cron Trigger) so Render's free-tier instance does not spin down
and cold-start on real visitors.

Independent of the frontend Worker. It never needs redeploying when the
frontend changes.

## Deploy

```
cd keepwarm
npx wrangler deploy
```

## Check it

- `npx wrangler tail divisi-keepwarm` to watch the scheduled runs live.
- Cloudflare dashboard: Workers & Pages -> divisi-keepwarm -> Triggers /
  Logs.
- Hit the Worker's `*.workers.dev` URL in a browser to run `ping()` once
  on demand.

## Change the interval or target

Edit `wrangler.jsonc` (`triggers.crons`) or `HEALTH_URL` in
`src/index.js`, then `npx wrangler deploy` again.
