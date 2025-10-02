#!/bin/bash

# Script to run merkle-drops snapshots for multiple collections
# Usage: ./run_snapshots.sh [collections.json] [--skip-existing|--overwrite] [--rpc-<network>=<url>]
#   --skip-existing: Skip collections that already have snapshots (default)
#   --overwrite: Overwrite existing snapshot files
#   --rpc-<network>=<url>: Override RPC URL for a specific network (e.g., --rpc-starknet=https://your-rpc.com)

set -e

# Default values (you can modify these as needed)
CLAIM_CONTRACT="0x1"
ENTRYPOINT="claim_from_forwarder"

# RPC URLs by network
# Using a function instead of associative array for compatibility
get_rpc_url() {
    local network="$1"
    case "$network" in
        "ethereum")
            echo "https://ethereum-rpc.publicnode.com"
            ;;
        "starknet")
            echo "https://api.cartridge.gg/x/starknet/mainnet/rpc/v0_8"
            ;;
        "base")
            echo "https://base-mainnet.public.blastapi.io"
            ;;
        "linea")
            echo "https://linea.drpc.org"
            ;;
        "arbitrum")
            echo "https://arbitrum-one.public.blastapi.io"
            ;;
        "polygon")
            echo "https://polygon-mainnet.public.blastapi.io"
            ;;
        *)
            echo ""
            ;;
    esac
}

# Get concurrency settings by network
get_concurrency() {
    local network="$1"
    case "$network" in
        "ethereum"|"starknet")
            echo "10"  # Lower concurrency for these networks
            ;;
        *)
            echo "1"  # Default for other networks
            ;;
    esac
}

# Get delay settings by network (in milliseconds)
get_delay_ms() {
    local network="$1"
    case "$network" in
        "ethereum"|"starknet"|"polygon"|"linea"|"arbitrum")
            echo "10"  # 10ms delay for Ethereum and Starknet
            ;;
        "base")
            echo "10"  # 500ms delay for Base
            ;;
        *)
            echo "200"  # Default delay
            ;;
    esac
}

# Store custom RPC overrides in a temp file
RPC_OVERRIDES_FILE="/tmp/rpc_overrides_$$"
touch "$RPC_OVERRIDES_FILE"
trap "rm -f $RPC_OVERRIDES_FILE" EXIT

# Parse arguments
COLLECTIONS_FILE="collections.json"
OVERWRITE_MODE="skip"

for arg in "$@"; do
    case $arg in
        --overwrite)
            OVERWRITE_MODE="overwrite"
            ;;
        --skip-existing)
            OVERWRITE_MODE="skip"
            ;;
        --rpc-*=*)
            # Extract network and URL from --rpc-network=url format
            NETWORK="${arg#--rpc-}"
            NETWORK="${NETWORK%%=*}"
            URL="${arg#*=}"
            echo "$NETWORK=$URL" >> "$RPC_OVERRIDES_FILE"
            echo "Override RPC for $NETWORK: $URL"
            ;;
        *.json)
            COLLECTIONS_FILE="$arg"
            ;;
    esac
done

# Check if collections file exists
if [ ! -f "$COLLECTIONS_FILE" ]; then
    echo "Error: Collections file '$COLLECTIONS_FILE' not found"
    echo "Usage: $0 [collections.json] [--skip-existing|--overwrite] [--rpc-<network>=<url>]"
    exit 1
fi

# Check if jq is available
if ! command -v jq &> /dev/null; then
    echo "Error: jq is required but not installed. Please install jq to parse JSON."
    exit 1
fi

# Check if slot binary exists
SLOT_BINARY="./target/debug/slot"
if [ ! -f "$SLOT_BINARY" ]; then
    echo "Error: Slot binary not found at $SLOT_BINARY"
    echo "Please build the project first: cargo build"
    exit 1
fi

echo "Running snapshots for collections in $COLLECTIONS_FILE"
echo "Mode: $OVERWRITE_MODE existing files"
echo "==========================================="

# Create snapshots directory if it doesn't exist
SNAPSHOTS_DIR="snapshots"
mkdir -p "$SNAPSHOTS_DIR"
echo "Snapshots will be saved to: $SNAPSHOTS_DIR/"
echo ""

# Count statistics
TOTAL_COUNT=0
SKIPPED_COUNT=0
PROCESSED_COUNT=0

# Read JSON file and process each collection
jq -c '.[]' "$COLLECTIONS_FILE" | while read -r collection; do
    name=$(echo "$collection" | jq -r '.name')
    contract_address=$(echo "$collection" | jq -r '.contract_address')
    network=$(echo "$collection" | jq -r '.network')
    output=$(echo "$collection" | jq -r '.output')
    description=$(echo "$collection" | jq -r '.description')
    to_id=$(echo "$collection" | jq -r '.to_id // empty')
    block_height=$(echo "$collection" | jq -r '.block_height // empty')
    
    ((TOTAL_COUNT++))
    
    # Check if file already exists
    if [ -f "$SNAPSHOTS_DIR/$output" ] && [ "$OVERWRITE_MODE" = "skip" ]; then
        echo "⏭️  Skipping $name (file already exists: $SNAPSHOTS_DIR/$output)"
        ((SKIPPED_COUNT++))
        echo ""
        continue
    fi
    
    # Get the appropriate RPC URL for the network
    # First check for custom override
    RPC_URL=$(grep "^$network=" "$RPC_OVERRIDES_FILE" | tail -1 | cut -d= -f2-)
    
    # If no override, use default
    if [ -z "$RPC_URL" ]; then
        RPC_URL=$(get_rpc_url "$network")
    fi
    
    if [ -z "$RPC_URL" ]; then
        echo "❌ Error: No RPC URL configured for network: $network"
        continue
    fi
    
    # Get network-specific settings
    CONCURRENCY=$(get_concurrency "$network")
    DELAY_MS=$(get_delay_ms "$network")
    
    echo "Processing: $name"
    echo "Contract: $contract_address"
    echo "Network: $network (RPC: $RPC_URL)"
    echo "Settings: Concurrency=$CONCURRENCY, Delay=${DELAY_MS}ms"
    echo "Output: $SNAPSHOTS_DIR/$output"
    if [ -f "$SNAPSHOTS_DIR/$output" ]; then
        echo "⚠️  File exists - will overwrite"
    fi
    echo "---"
    
    # Build the command
    cmd=("$SLOT_BINARY" merkle-drops snapshot 
         --name "$name" 
         --contract-address "$contract_address" 
         --network "$network" 
         --claim-contract "$CLAIM_CONTRACT" 
         --output "$SNAPSHOTS_DIR/$output" 
         --rpc-url "$RPC_URL" 
         --description "$description" 
         --entrypoint "$ENTRYPOINT"
         --concurrency "$CONCURRENCY"
         --delay-ms "$DELAY_MS")
    
    # Add --block-height if specified in JSON
    if [ -n "$block_height" ]; then
        cmd+=(--block-height "$block_height")
    fi
    
    # Add --to-id if specified in JSON
    if [ -n "$to_id" ]; then
        cmd+=(--to-id "$to_id")
    fi
    
    # Run the command
    "${cmd[@]}"
    
    if [ $? -eq 0 ]; then
        echo "✅ Successfully created snapshot for $name -> $SNAPSHOTS_DIR/$output"
        ((PROCESSED_COUNT++))
    else
        echo "❌ Failed to create snapshot for $name"
    fi
    
    echo ""
done

echo "==========================================="
echo "Snapshot generation complete!"
echo "Total collections: $TOTAL_COUNT"
echo "Processed: $PROCESSED_COUNT"
echo "Skipped (already exist): $SKIPPED_COUNT"
echo "Failed: $((TOTAL_COUNT - PROCESSED_COUNT - SKIPPED_COUNT))"