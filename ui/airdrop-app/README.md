# Loot Survivor Airdrop Claims App

This is the frontend application for claiming Loot Survivor free games airdrop.

## Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

#### Claim Period Configuration

Set the claim start and end times using Unix timestamps (in seconds):

```bash
# When claims open
VITE_CLAIM_START_TIMESTAMP=1735689600

# When claims expire
VITE_CLAIM_EXPIRY_TIMESTAMP=1738367999
```

To generate a Unix timestamp:
- Using command line: `date -u -d "2025-01-31 23:59:59" +%s`
- Using online converter: https://www.epochconverter.com/

The page will:
- Show "coming soon" countdown before the start time
- Allow eligibility checking between start and expiry times
- Show "expired" message after the expiry time

## Development

```bash
npm install
npm run dev
```

## Production Build

```bash
npm run build
npm run preview
```

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
