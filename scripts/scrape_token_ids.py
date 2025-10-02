#!/usr/bin/env python3
"""
Script to scrape NFT token IDs from a Starknet collection using Blast API.
Saves the token IDs to a file for use with the merkle-drops snapshot command.
"""

import requests
import json
import time
import argparse
from typing import List, Optional
import sys


def get_collection_nfts(
    contract_address: str,
    api_url: str,
    start_token_id: Optional[str] = None,
    end_token_id: Optional[str] = None,
    page_size: int = 100,
    delay_ms: int = 200,
) -> List[int]:
    """
    Fetch all NFT token IDs from a collection using pagination.

    Args:
        contract_address: The NFT collection contract address
        api_url: The Blast API URL
        start_token_id: Optional starting token ID
        end_token_id: Optional ending token ID
        page_size: Number of items per page (max 100)
        delay_ms: Delay between requests in milliseconds

    Returns:
        List of token IDs
    """
    token_ids = []
    page_key = None
    page_count = 0

    print(f"Fetching NFTs from collection: {contract_address}")
    print(f"API URL: {api_url}")

    while True:
        # Build query parameters
        params = {
            "contractAddress": contract_address,
            "pageSize": str(page_size),
        }

        # Add optional parameters
        if start_token_id:
            params["startTokenId"] = start_token_id
        if end_token_id:
            params["endTokenId"] = end_token_id
        if page_key:
            params["pageKey"] = page_key

        # Make GET request with query parameters
        try:
            response = requests.get(
                api_url, params=params, headers={"Content-Type": "application/json"}
            )
            response.raise_for_status()

            result = response.json()

            if "error" in result:
                print(f"API Error: {result['error']}")
                break

            # The response structure might be different for GET request
            # Try to handle both wrapped and unwrapped responses
            if "result" in result:
                data = result.get("result", {})
            else:
                data = result
                
            nfts = data.get("nfts", [])

            # Extract token IDs from NFTs
            for nft in nfts:
                # Token ID might be in different fields depending on the API response
                token_id = None

                # Try different possible field names
                if "tokenId" in nft:
                    token_id = nft["tokenId"]
                elif "token_id" in nft:
                    token_id = nft["token_id"]
                elif "id" in nft:
                    token_id = nft["id"]

                if token_id is not None:
                    # Convert hex string to int if necessary
                    if isinstance(token_id, str):
                        if token_id.startswith("0x"):
                            token_ids.append(int(token_id, 16))
                        else:
                            token_ids.append(int(token_id))
                    else:
                        token_ids.append(int(token_id))

            page_count += 1
            print(
                f"Page {page_count}: Retrieved {len(nfts)} NFTs (Total: {len(token_ids)})"
            )

            # Check if there are more pages
            next_page_key = data.get("nextPageKey")
            if not next_page_key or len(nfts) == 0:
                break

            page_key = next_page_key

            # Rate limiting delay
            if delay_ms > 0:
                time.sleep(delay_ms / 1000.0)

        except requests.exceptions.RequestException as e:
            print(f"Request error: {e}")
            break
        except Exception as e:
            print(f"Unexpected error: {e}")
            break

    return token_ids


def save_token_ids(token_ids: List[int], output_file: str, format: str = "txt"):
    """
    Save token IDs to a file in the specified format.

    Args:
        token_ids: List of token IDs
        output_file: Output file path
        format: Output format ('txt', 'json', or 'csv')
    """
    # Sort and remove duplicates
    unique_ids = sorted(list(set(token_ids)))

    print(f"\nSaving {len(unique_ids)} unique token IDs to {output_file}")

    if format == "json":
        with open(output_file, "w") as f:
            json.dump(unique_ids, f, indent=2)
    elif format == "csv":
        # Write as comma-separated values, 100 per line for readability
        with open(output_file, "w") as f:
            for i in range(0, len(unique_ids), 100):
                batch = unique_ids[i : i + 100]
                f.write(",".join(map(str, batch)) + "\n")
    else:  # txt format (default)
        with open(output_file, "w") as f:
            f.write("# Token IDs for NFT collection\n")
            f.write(f"# Total: {len(unique_ids)} tokens\n")
            f.write(f"# Generated on: {time.strftime('%Y-%m-%d %H:%M:%S')}\n\n")
            for token_id in unique_ids:
                f.write(f"{token_id}\n")

    print(f"Token IDs saved successfully!")
    print(f"Format: {format}")
    print(f"Total unique IDs: {len(unique_ids)}")
    if unique_ids:
        print(f"Range: {min(unique_ids)} to {max(unique_ids)}")


def main():
    parser = argparse.ArgumentParser(
        description="Scrape NFT token IDs from a Starknet collection"
    )
    parser.add_argument(
        "--contract-address", required=True, help="The NFT collection contract address"
    )
    parser.add_argument(
        "--api-url",
        default="https://starknet-mainnet.blastapi.io/5ef61753-e7c1-4593-bc62-97fdf96f8de5/builder/getCollectionNFTs",
        help="Blast API URL (default: provided Starknet mainnet URL)",
    )
    parser.add_argument(
        "--output",
        default="token_ids.txt",
        help="Output file path (default: token_ids.txt)",
    )
    parser.add_argument(
        "--format",
        choices=["txt", "json", "csv"],
        default="txt",
        help="Output format (default: txt)",
    )
    parser.add_argument("--start-token-id", help="Starting token ID (optional)")
    parser.add_argument("--end-token-id", help="Ending token ID (optional)")
    parser.add_argument(
        "--page-size",
        type=int,
        default=100,
        help="Number of items per page (default: 100, max: 100)",
    )
    parser.add_argument(
        "--delay-ms",
        type=int,
        default=200,
        help="Delay between requests in milliseconds (default: 200)",
    )

    args = parser.parse_args()

    # Validate page size
    if args.page_size > 100:
        print("Warning: page_size cannot exceed 100, setting to 100")
        args.page_size = 100

    # Scrape token IDs
    token_ids = get_collection_nfts(
        contract_address=args.contract_address,
        api_url=args.api_url,
        start_token_id=args.start_token_id,
        end_token_id=args.end_token_id,
        page_size=args.page_size,
        delay_ms=args.delay_ms,
    )

    if token_ids:
        # Save to file
        save_token_ids(token_ids, args.output, args.format)
    else:
        print("\nNo token IDs found!")
        sys.exit(1)


if __name__ == "__main__":
    main()
