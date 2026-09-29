# Bloc Step Arcade backend

Express and TypeScript backend for Bloc Step Arcade, including game sessions,
leaderboards, Farcaster notifications, and Base contract integrations.

## Local checks

Use Node.js 22.13+ or 24+ with npm. Docker and CI use the Node.js 22 LTS line.
Install the locked dependencies without lifecycle scripts, then run the checks:

```sh
npm ci --ignore-scripts
npm run check
npm run build
```

`check` runs TypeScript checking, ESLint, and the offline Node test suite. The
tests exercise retry behavior with synthetic failures; they do not validate
contract interactions, authentication, database migrations, or full game flows.
`build` compiles `src/` into `dist/` without starting the server.

## Configuration and startup

Copy `.env.example` to `.env` and replace its placeholders before starting the
application. Keep secrets in your local environment or deployment secret store.
Environment files are excluded from Git and the Docker build context.

| Setting | Purpose |
| --- | --- |
| `PORT`, `NODE_ENV`, `ALLOWED_ORIGINS` | HTTP listener and allowed frontend origins |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | Backend database access; never expose the service key to the frontend |
| `RPC_URL`, `GAME_SERVER_PRIVATE_KEY` | Base RPC and transaction signer |
| Contract address variables | Addresses of the deployed contracts; the example uses Base mainnet |
| `NEYNAR_API_KEY`, `NEYNAR_WEBHOOK_SECRET` | Farcaster integration credentials |
| `ADMIN_API_KEY` | Separate credential for administrative endpoints |
| `START_BLOCK`, `POLLING_INTERVAL_MS` | Event listener start point and polling interval |
| `MOCK_MODE` | Suppresses selected startup jobs; it is not a complete network sandbox |

The source contains a known placeholder signer key for unconfigured environments.
Never fund that key or use it for a real deployment. Configure an explicit signer
and the correct development database/RPC before running the server. Even with
`MOCK_MODE=true`, routes and `/health` can contact configured services.

After configuration, `npm run dev` runs the development watcher. `npm start`
runs the compiled server. Normal startup enables blockchain polling, cooldown
notifications, and leaderboard refreshes unless mock mode is selected.

The service exposes `/health` and routes under `/api/v1`. Its health check reads
the configured database and RPC; it is not an offline liveness check.

## Repository layout

- `src/api/`: Express routes and middleware.
- `src/services/`: game, analytics, blockchain, and notification services.
- `src/repositories/`: database access.
- `src/config/`: environment, database, and blockchain client setup.
- `supabase/migrations/`: SQL migration files.
- `tests/`: offline checks, separate from production compilation.
- `scripts/`: operator commands, excluded from automatic checks.

## Operator scripts

Review these scripts and their target environment before invoking them. They are
not part of installation, lint, tests, or builds:

- `npm run db:migrate` invokes the legacy initial-schema helper. It does not
  discover and apply every SQL file in `supabase/migrations/`.
- `checkOwnership.ts`, `checkVaultStatus.ts`, and `verifyConfig.ts` query external
  blockchain services. `verifyKey.ts` derives a local signer address.
- `distributeVault.ts`, `distributeStakingRewards.ts`, `transferOwnership.ts`, and
  `weekly-distribute.sh` can move funds, modify contracts, or update database state.
  Their separate operator variables include `VAULT_OWNER_PRIVATE_KEY`,
  `REWARDS_WALLET_PRIVATE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.

Docker and Railway configuration are supplied for deployment. Building or testing
this repository does not deploy it or run any of these operator scripts.
