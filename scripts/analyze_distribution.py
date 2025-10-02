#!/usr/bin/env python3
"""
Analyze and visualize token distribution from the analytics files.
"""

import json
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import argparse
from pathlib import Path

def load_data(analytics_file, csv_file):
    """Load analytics JSON and CSV data."""
    with open(analytics_file, 'r') as f:
        analytics = json.load(f)
    
    df = pd.read_csv(csv_file)
    return analytics, df

def create_distribution_histogram(df, output_dir):
    """Create histogram of token distribution."""
    plt.figure(figsize=(10, 6))
    
    # Create bins for better visualization
    bins = [0, 5, 10, 20, 50, 100, 200, 500, 1000, df['amount'].max() + 1]
    
    plt.hist(df['amount'], bins=bins, edgecolor='black', alpha=0.7)
    plt.xlabel('Token Amount')
    plt.ylabel('Number of Addresses')
    plt.title('Token Distribution Histogram')
    plt.yscale('log')  # Log scale for better visibility
    plt.grid(True, alpha=0.3)
    
    plt.tight_layout()
    plt.savefig(output_dir / 'distribution_histogram.png', dpi=300)
    plt.close()

def create_cumulative_distribution(df, output_dir):
    """Create cumulative distribution chart."""
    plt.figure(figsize=(10, 6))
    
    # Sort by amount and calculate cumulative
    sorted_df = df.sort_values('amount')
    sorted_df['cumulative_holders'] = range(1, len(sorted_df) + 1)
    sorted_df['cumulative_tokens'] = sorted_df['amount'].cumsum()
    
    # Plot cumulative holders
    plt.subplot(2, 1, 1)
    plt.plot(sorted_df['amount'], sorted_df['cumulative_holders'])
    plt.xlabel('Token Amount')
    plt.ylabel('Cumulative Holders')
    plt.title('Cumulative Distribution of Holders')
    plt.grid(True, alpha=0.3)
    
    # Plot cumulative tokens
    plt.subplot(2, 1, 2)
    plt.plot(sorted_df['amount'], sorted_df['cumulative_tokens'])
    plt.xlabel('Token Amount')
    plt.ylabel('Cumulative Tokens')
    plt.title('Cumulative Distribution of Tokens')
    plt.grid(True, alpha=0.3)
    
    plt.tight_layout()
    plt.savefig(output_dir / 'cumulative_distribution.png', dpi=300)
    plt.close()

def create_bucket_chart(analytics, output_dir):
    """Create bar chart of distribution buckets."""
    plt.figure(figsize=(12, 6))
    
    buckets = analytics['distributionBuckets']
    ranges = [b['range'] for b in buckets]
    counts = [b['count'] for b in buckets]
    tokens = [b['totalTokens'] for b in buckets]
    
    # Create subplot for holder counts
    plt.subplot(1, 2, 1)
    bars = plt.bar(ranges, counts, color='skyblue', edgecolor='black')
    plt.xlabel('Token Range')
    plt.ylabel('Number of Holders')
    plt.title('Holders by Token Range')
    plt.xticks(rotation=45)
    
    # Add percentage labels
    total_holders = analytics['totalHolders']
    for bar, count in zip(bars, counts):
        height = bar.get_height()
        plt.text(bar.get_x() + bar.get_width()/2., height,
                f'{count}\n({count/total_holders*100:.1f}%)',
                ha='center', va='bottom')
    
    # Create subplot for token distribution
    plt.subplot(1, 2, 2)
    bars = plt.bar(ranges, tokens, color='lightcoral', edgecolor='black')
    plt.xlabel('Token Range')
    plt.ylabel('Total Tokens')
    plt.title('Tokens by Range')
    plt.xticks(rotation=45)
    
    # Add percentage labels
    total_tokens = analytics['totalTokensDistributed']
    for bar, token_count in zip(bars, tokens):
        height = bar.get_height()
        plt.text(bar.get_x() + bar.get_width()/2., height,
                f'{token_count}\n({token_count/total_tokens*100:.1f}%)',
                ha='center', va='bottom')
    
    plt.tight_layout()
    plt.savefig(output_dir / 'bucket_distribution.png', dpi=300)
    plt.close()

def create_lorenz_curve(df, output_dir):
    """Create Lorenz curve to show inequality."""
    plt.figure(figsize=(8, 8))
    
    # Calculate Lorenz curve data
    sorted_df = df.sort_values('amount')
    total_tokens = sorted_df['amount'].sum()
    total_holders = len(sorted_df)
    
    cumulative_holders_pct = np.arange(1, total_holders + 1) / total_holders * 100
    cumulative_tokens_pct = sorted_df['amount'].cumsum() / total_tokens * 100
    
    # Plot Lorenz curve
    plt.plot(cumulative_holders_pct, cumulative_tokens_pct, 'b-', linewidth=2, label='Actual Distribution')
    plt.plot([0, 100], [0, 100], 'r--', linewidth=1, label='Perfect Equality')
    
    # Fill area between curves
    plt.fill_between(cumulative_holders_pct, cumulative_tokens_pct, cumulative_holders_pct, alpha=0.3)
    
    plt.xlabel('Cumulative % of Holders')
    plt.ylabel('Cumulative % of Tokens')
    plt.title('Lorenz Curve - Token Distribution Inequality')
    plt.grid(True, alpha=0.3)
    plt.legend()
    
    # Calculate Gini coefficient
    area_under_lorenz = np.trapz(cumulative_tokens_pct, cumulative_holders_pct)
    area_under_equality = 5000  # Area of triangle
    gini = (area_under_equality - area_under_lorenz) / area_under_equality
    
    plt.text(0.05, 0.95, f'Gini Coefficient: {gini:.3f}', 
             transform=plt.gca().transAxes, bbox=dict(boxstyle='round', facecolor='wheat'))
    
    plt.tight_layout()
    plt.savefig(output_dir / 'lorenz_curve.png', dpi=300)
    plt.close()
    
    return gini

def generate_summary_report(analytics, df, output_dir, gini):
    """Generate a text summary report."""
    report = f"""
Token Distribution Analysis Report
=================================

Overall Statistics:
------------------
Total Holders: {analytics['totalHolders']:,}
Total Tokens Distributed: {analytics['totalTokensDistributed']:,}
Average Tokens per Holder: {analytics['averageTokensPerHolder']:.2f}
Median Tokens per Holder: {analytics['medianTokensPerHolder']}
Standard Deviation: {analytics['standardDeviation']:.2f}
Min/Max: {analytics['min']} / {analytics['max']}
Gini Coefficient: {gini:.3f}

Percentiles:
-----------
10th percentile: {analytics['percentiles']['p10']}
25th percentile: {analytics['percentiles']['p25']}
50th percentile (median): {analytics['percentiles']['p50']}
75th percentile: {analytics['percentiles']['p75']}
90th percentile: {analytics['percentiles']['p90']}
95th percentile: {analytics['percentiles']['p95']}
99th percentile: {analytics['percentiles']['p99']}

Distribution by Range:
---------------------
"""
    
    for bucket in analytics['distributionBuckets']:
        pct_holders = bucket['count'] / analytics['totalHolders'] * 100
        pct_tokens = bucket['totalTokens'] / analytics['totalTokensDistributed'] * 100
        report += f"{bucket['range']:>10}: {bucket['count']:>6} holders ({pct_holders:>5.1f}%) - {bucket['totalTokens']:>8} tokens ({pct_tokens:>5.1f}%)\n"
    
    report += f"""
Top 10 Token Holders:
--------------------
"""
    
    for i, holder in enumerate(analytics['topHolders'][:10], 1):
        report += f"{i:>2}. {holder['address']} - {holder['amount']} tokens\n"
    
    # Save report
    with open(output_dir / 'distribution_report.txt', 'w') as f:
        f.write(report)
    
    print(report)

def main():
    parser = argparse.ArgumentParser(description='Analyze token distribution')
    parser.add_argument('analytics_file', help='Path to analytics JSON file')
    parser.add_argument('csv_file', help='Path to distribution CSV file')
    parser.add_argument('--output-dir', default='./analytics_output', help='Directory for output files')
    
    args = parser.parse_args()
    
    # Create output directory
    output_dir = Path(args.output_dir)
    output_dir.mkdir(exist_ok=True)
    
    # Load data
    analytics, df = load_data(args.analytics_file, args.csv_file)
    
    print(f"Loaded data for {len(df)} addresses")
    print(f"Generating visualizations in {output_dir}...")
    
    # Generate charts
    create_distribution_histogram(df, output_dir)
    print("✓ Created distribution histogram")
    
    create_cumulative_distribution(df, output_dir)
    print("✓ Created cumulative distribution charts")
    
    create_bucket_chart(analytics, output_dir)
    print("✓ Created bucket distribution charts")
    
    gini = create_lorenz_curve(df, output_dir)
    print("✓ Created Lorenz curve")
    
    # Generate summary report
    generate_summary_report(analytics, df, output_dir, gini)
    print(f"\n✓ All visualizations saved to {output_dir}")

if __name__ == '__main__':
    # Add numpy import that was missing
    import numpy as np
    main()