# Claims App

This is the private claims application for the airdrop system.

## Structure

```
claims-app/
├── ui/                    # Frontend and backend application
│   ├── airdrop-app/      # React frontend
│   └── server/           # Express backend
├── snapshots/            # NFT ownership snapshots
├── aggregations/         # Processed airdrop amounts
├── scripts/              # Migration and utility scripts
└── railway.json          # Railway deployment config
```

## Deployment

1. Clone this repository
2. Navigate to the claims-app directory
3. Run `railway up` to deploy

## Local Development

```bash
cd ui/airdrop-app
npm install
npm run dev
```

## Migration

After deployment, trigger the migration:

```bash
curl https://your-app.railway.app/migrate-aggregations
```