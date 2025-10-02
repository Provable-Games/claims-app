# Network Aggregation for Process Script

The process.ts script has been updated to support network aggregation. This allows you to combine snapshots from multiple networks into a single output file.

## Key Changes

1. Added `--aggregate-networks` option to specify additional networks to aggregate
2. When using this option, the script will:
   - Find snapshots for the primary network (e.g., ethereum)
   - Also find snapshots for all specified aggregate networks
   - Process all snapshots together to produce a single aggregated output

## Usage Examples

### Aggregate Ethereum with L2 networks (arbitrum, base, linea, polygon)
```bash
npx tsx process.ts \
  --name "Ethereum Aggregated Collection Rewards" \
  --description "Merkle drop for Ethereum and L2 NFT collections" \
  --claim-contract "0x1" \
  --entrypoint "claim_from_forwarder" \
  --snapshots-folder "../snapshots" \
  --network "ethereum" \
  --aggregate-networks "arbitrum,base,linea,polygon" \
  --rewards-config "rewards_config.json" \
  --token-cap 100 \
  --output "processed_rewards_ethereum_aggregated.json"
```

### Process Starknet standalone (no aggregation)
```bash
npx tsx process.ts \
  --name "Starknet Collection Rewards" \
  --description "Merkle drop for Starknet NFT collections" \
  --claim-contract "0x1" \
  --entrypoint "claim_from_forwarder" \
  --snapshots-folder "../snapshots" \
  --network "starknet" \
  --rewards-config "rewards_config.json" \
  --token-cap 100 \
  --output "processed_rewards_starknet.json"
```

## Automated Script

Use the provided `run_aggregated_process.sh` script to run both processes:
```bash
./run_aggregated_process.sh
```

This will create two output files:
- `processed_rewards_ethereum_aggregated.json` - Contains aggregated rewards from ethereum, arbitrum, base, linea, and polygon
- `processed_rewards_starknet.json` - Contains rewards only from starknet

## How It Works

1. The script looks for snapshot files matching the pattern `*_<network>.json` in the snapshots folder
2. When `--aggregate-networks` is specified, it also looks for snapshots from those networks
3. All matching snapshots are processed together, aggregating rewards across all included networks
4. The final output contains a single snapshot with combined rewards for each address