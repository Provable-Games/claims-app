#!/bin/bash

# Script to process rewards with network aggregation
set -e

echo "Processing rewards with network aggregation..."
echo "============================================="

# Process Ethereum with aggregation of arbitrum, base, linea, and polygon
echo "Processing Ethereum (with aggregated networks)..."
npx tsx process.ts \
  --name "Ethereum Aggregated Collection Rewards" \
  --description "Merkle drop for Ethereum and L2 NFT collections" \
  --claim-contract "0x1" \
  --entrypoint "claim_from_forwarder" \
  --snapshots-folder "../snapshots" \
  --network "ethereum" \
  --aggregate-networks "arbitrum,base,linea,polygon" \
  --rewards-config "rewards_config.json" \
  --output "processed_rewards_ethereum_aggregated.json"

echo ""
echo "Processing Starknet (standalone)..."
npx tsx process.ts \
  --name "Starknet Collection Rewards" \
  --description "Merkle drop for Starknet NFT collections" \
  --claim-contract "0x1" \
  --entrypoint "claim_from_forwarder" \
  --snapshots-folder "../snapshots" \
  --network "starknet" \
  --rewards-config "rewards_config.json" \
  --output "processed_rewards_starknet.json"

echo ""
echo "Processing complete!"
echo ""
echo "Output files:"
echo "  - Ethereum (aggregated): processed_rewards_ethereum_aggregated.json"
echo "  - Starknet (standalone): processed_rewards_starknet.json"