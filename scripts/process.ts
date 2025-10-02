#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';

interface SnapshotData {
  network: string;
  contract_address: string;
  snapshot: [string, string[]][] | Record<string, number[]>; // Can be array of [address, token_ids] or object
}

interface RewardsConfig {
  contracts: Record<string, number[]>; // contract_address -> [token_a_per_nft, token_b_per_nft, ...]
}

interface ProcessedData {
  name: string;
  network: string;
  description: string;
  claim_contract: string;
  entrypoint: string;
  snapshot: [string, number[]][]; // [address, rewards]
}

interface DistributionBucket {
  range: string;
  min: number;
  max: number;
  count: number;
  totalTokens: number;
  addresses: string[];
}

interface Analytics {
  totalHolders: number;
  totalTokensDistributed: number;
  averageTokensPerHolder: number;
  medianTokensPerHolder: number;
  standardDeviation: number;
  min: number;
  max: number;
  distributionBuckets: DistributionBucket[];
  topHolders: { address: string; amount: number }[];
  percentiles: { [key: string]: number };
}

class ProcessCommand {
  constructor(
    private name: string,
    private description: string,
    private claimContract: string,
    private entrypoint: string,
    private snapshots: string[],
    private rewardsConfig: string,
    private output: string = 'processed_rewards.json',
    private snapshotsFolder?: string,
    private network?: string,
    private tokenCap?: number,
    private aggregateNetworks?: string[]
  ) {}

  async run(): Promise<void> {
    console.log(`Processing rewards for merkle drop: ${this.name}`);
    
    // If snapshots folder and network provided, auto-detect snapshot files
    if (this.snapshotsFolder && this.network) {
      this.snapshots = this.findSnapshotsByNetwork(this.snapshotsFolder, this.network);
      console.log(`Auto-detected ${this.snapshots.length} snapshot files for network: ${this.network}`);
      
      // If aggregating networks (for ethereum), also find snapshots for those networks
      if (this.aggregateNetworks && this.aggregateNetworks.length > 0) {
        console.log(`\nAggregating additional networks: ${this.aggregateNetworks.join(', ')}`);
        for (const aggNetwork of this.aggregateNetworks) {
          const aggSnapshots = this.findSnapshotsByNetwork(this.snapshotsFolder, aggNetwork);
          console.log(`Auto-detected ${aggSnapshots.length} snapshot files for network: ${aggNetwork}`);
          this.snapshots.push(...aggSnapshots);
        }
        console.log(`Total snapshots to process: ${this.snapshots.length}`);
      }
    }
    
    console.log(`Loading ${this.snapshots.length} snapshot files...`);

    // Load rewards configuration
    const rewardsConfig = this.loadRewardsConfig();
    
    // Determine number of reward tokens from first contract
    const numRewardTokens = Object.values(rewardsConfig.contracts)[0]?.length || 1;
    
    // Validate all contracts have same number of reward tokens
    for (const [contractAddr, rewards] of Object.entries(rewardsConfig.contracts)) {
      if (rewards.length !== numRewardTokens) {
        throw new Error(
          `All contracts must have the same number of reward tokens. Contract ${contractAddr} has ${rewards.length} tokens, expected ${numRewardTokens}`
        );
      }
    }

    console.log(
      `Rewards config loaded: ${Object.keys(rewardsConfig.contracts).length} contracts with ${numRewardTokens} reward token(s)`
    );

    // Load all snapshots
    const snapshots = await this.loadSnapshots();
    console.log(`Loaded snapshots from ${snapshots.length} contracts`);

    // Validate network consistency (skip if aggregating networks)
    if (!this.aggregateNetworks || this.aggregateNetworks.length === 0) {
      this.validateNetworkConsistency(snapshots);
    }
    const network = this.network || snapshots[0].network;

    // Calculate rewards for each holder
    const rewardsByHolder = await this.calculateRewards(snapshots, rewardsConfig);

    if (Object.keys(rewardsByHolder).length === 0) {
      throw new Error('No holders found with rewards');
    }

    // Calculate total tokens being distributed
    const totalTokensDistributed = new Array(numRewardTokens).fill(0);
    for (const rewards of Object.values(rewardsByHolder)) {
      for (let tokenIndex = 0; tokenIndex < rewards.length; tokenIndex++) {
        totalTokensDistributed[tokenIndex] += rewards[tokenIndex];
      }
    }

    // Apply token cap if specified
    if (this.tokenCap && this.tokenCap > 0) {
      let cappedCount = 0;
      for (const [address, rewards] of Object.entries(rewardsByHolder)) {
        for (let i = 0; i < rewards.length; i++) {
          if (rewards[i] > this.tokenCap) {
            rewards[i] = this.tokenCap;
            cappedCount++;
          }
        }
      }
      if (cappedCount > 0) {
        console.log(`\nApplied token cap of ${this.tokenCap}: ${cappedCount} reward amounts were capped`);
      }
      
      // Recalculate total with capped values
      totalTokensDistributed.fill(0);
      for (const rewards of Object.values(rewardsByHolder)) {
        for (let tokenIndex = 0; tokenIndex < rewards.length; tokenIndex++) {
          totalTokensDistributed[tokenIndex] += rewards[tokenIndex];
        }
      }
    }

    // Convert to snapshot format expected by create command
    const snapshot: [string, number[]][] = Object.entries(rewardsByHolder)
      .map(([address, rewards]) => [address, rewards]);

    // Create processed data structure
    const processedData: ProcessedData = {
      name: this.name,
      network,
      description: this.description,
      claim_contract: this.claimContract,
      entrypoint: this.entrypoint,
      snapshot,
    };

    // Generate analytics
    const analytics = this.generateAnalytics(snapshot);
    
    // Write main output file
    const outputStr = JSON.stringify(processedData, null, 2);
    fs.writeFileSync(this.output, outputStr);
    
    // Write analytics file
    const analyticsFile = this.output.replace('.json', '_analytics.json');
    fs.writeFileSync(analyticsFile, JSON.stringify(analytics, null, 2));
    
    // Write CSV for easy analysis
    const csvFile = this.output.replace('.json', '_distribution.csv');
    this.writeDistributionCSV(snapshot, csvFile);
    
    // Write frequency distribution CSV
    const freqFile = this.output.replace('.json', '_frequency.csv');
    this.writeFrequencyCSV(snapshot, freqFile);

    console.log(`Processed rewards written to: ${this.output}`);
    console.log(`Analytics written to: ${analyticsFile}`);
    console.log(`Distribution CSV written to: ${csvFile}`);
    console.log(`Frequency CSV written to: ${freqFile}`);
    
    console.log('\nProcessing Summary:');
    console.log(`  Name: ${this.name}`);
    console.log(`  Network: ${processedData.network}`);
    console.log(`  Total Holders: ${processedData.snapshot.length}`);
    console.log(`  Reward Tokens: ${numRewardTokens}`);
    
    console.log('\nTotal tokens being distributed:');
    totalTokensDistributed.forEach((total, tokenIndex) => {
      console.log(`  Token ${tokenIndex + 1}: ${total} total`);
    });
    
    // Print distribution summary
    console.log('\nDistribution Summary:');
    console.log(`  Average per holder: ${analytics.averageTokensPerHolder.toFixed(2)}`);
    console.log(`  Median per holder: ${analytics.medianTokensPerHolder}`);
    console.log(`  Min/Max: ${analytics.min} / ${analytics.max}`);
    console.log(`  Standard deviation: ${analytics.standardDeviation.toFixed(2)}`);
    
    console.log('\nDistribution Buckets:');
    analytics.distributionBuckets.forEach(bucket => {
      const percentage = ((bucket.count / analytics.totalHolders) * 100).toFixed(1);
      console.log(`  ${bucket.range}: ${bucket.count} holders (${percentage}%) - ${bucket.totalTokens} tokens`);
    });
    
    console.log(`\nOutput Files:`);
    console.log(`  Main: ${this.output}`);
    console.log(`  Analytics: ${analyticsFile}`);
    console.log(`  Distribution CSV: ${csvFile}`);
    console.log(`  Frequency CSV: ${freqFile}`);
    
    console.log('\nNext steps:');
    console.log('1. Review the processed reward data and analytics');
    console.log(`2. Use 'slot merkle-drops create json --file ${this.output}' to create the merkle drop`);
    console.log('3. Use the CSV file for further analysis or visualization');
  }

  private loadRewardsConfig(): RewardsConfig {
    try {
      const content = fs.readFileSync(this.rewardsConfig, 'utf8');
      return JSON.parse(content) as RewardsConfig;
    } catch (e) {
      throw new Error(`Failed to read/parse rewards config file: ${e}`);
    }
  }

  private async loadSnapshots(): Promise<SnapshotData[]> {
    const snapshots: SnapshotData[] = [];
    
    for (const snapshotFile of this.snapshots) {
      console.log(`  Loading snapshot: ${snapshotFile}`);
      
      try {
        const content = fs.readFileSync(snapshotFile, 'utf8');
        const snapshot: SnapshotData = JSON.parse(content);
        
        // Handle both array and object formats
        const holderCount = Array.isArray(snapshot.snapshot) 
          ? snapshot.snapshot.length 
          : Object.keys(snapshot.snapshot).length;
        console.log(`    Contract: ${snapshot.contract_address} (${holderCount} holders)`);
        snapshots.push(snapshot);
      } catch (e) {
        throw new Error(`Failed to read/parse snapshot file ${snapshotFile}: ${e}`);
      }
    }
    
    return snapshots;
  }

  private validateNetworkConsistency(snapshots: SnapshotData[]): void {
    if (snapshots.length === 0) {
      throw new Error('No snapshots provided');
    }
    
    const firstNetwork = snapshots[0].network;
    
    for (const snapshot of snapshots) {
      if (snapshot.network !== firstNetwork) {
        throw new Error(
          `Network mismatch: snapshot for contract ${snapshot.contract_address} is on network '${snapshot.network}', expected '${firstNetwork}'`
        );
      }
    }
  }

  private async calculateRewards(
    snapshots: SnapshotData[],
    rewardsConfig: RewardsConfig
  ): Promise<Record<string, number[]>> {
    console.log(`\nCalculating rewards across ${snapshots.length} snapshots...`);
    
    // Determine number of reward tokens
    const numRewardTokens = Object.values(rewardsConfig.contracts)[0]?.length || 1;

    const rewardsByHolder: Record<string, number[]> = {};

    // Process each snapshot
    for (const snapshot of snapshots) {
      const contractAddress = snapshot.contract_address.toLowerCase();
      
      // Find reward config (case-insensitive)
      const rewardConfigKey = Object.keys(rewardsConfig.contracts).find(
        key => key.toLowerCase() === contractAddress
      );
      
      if (rewardConfigKey) {
        const rewardPerTokenList = rewardsConfig.contracts[rewardConfigKey];
        
        console.log(
          `  Processing contract ${snapshot.contract_address}: ${Object.keys(snapshot.snapshot).length} holders`
        );
        
        // Handle both array and object formats
        const snapshotEntries: [string, number[]][] = Array.isArray(snapshot.snapshot)
          ? snapshot.snapshot.map(([addr, tokenIds]) => [addr, tokenIds.map(id => typeof id === 'string' ? parseInt(id, 16) : id)])
          : Object.entries(snapshot.snapshot);

        // Calculate rewards for each holder in this snapshot
        for (const [holderAddress, tokenIds] of snapshotEntries) {
          const tokensHeld = tokenIds.length;
          
          if (tokensHeld > 0) {
            // Initialize holder's rewards if not exists
            if (!rewardsByHolder[holderAddress]) {
              rewardsByHolder[holderAddress] = new Array(numRewardTokens).fill(0);
            }
            
            // Add rewards for each token type
            for (let tokenIndex = 0; tokenIndex < rewardPerTokenList.length; tokenIndex++) {
              const rewardPerToken = rewardPerTokenList[tokenIndex];
              const contractReward = tokensHeld * rewardPerToken;
              rewardsByHolder[holderAddress][tokenIndex] += contractReward;
            }
            
            // Only log first 1000 holders to avoid excessive output
            if (Object.keys(rewardsByHolder).length <= 1000) {
              console.log(
                `    ${holderAddress}: ${tokensHeld} NFTs → rewards: [${rewardPerTokenList.map(r => tokensHeld * r).join(', ')}]`
              );
            }
          }
        }
      } else {
        console.log(`Warning: No reward configuration found for contract ${snapshot.contract_address}`);
      }
    }
    
    // Remove holders with zero rewards
    for (const [holder, rewards] of Object.entries(rewardsByHolder)) {
      if (!rewards.some(reward => reward > 0)) {
        delete rewardsByHolder[holder];
      }
    }

    console.log(
      `\nReward calculation complete: ${Object.keys(rewardsByHolder).length} holders eligible for rewards`
    );

    return rewardsByHolder;
  }
  
  private findSnapshotsByNetwork(folder: string, network: string): string[] {
    try {
      const files = fs.readdirSync(folder);
      const pattern = new RegExp(`_${network.toLowerCase()}\\.json$`);
      const matchingFiles = files
        .filter(file => pattern.test(file))
        .map(file => path.join(folder, file));
      
      if (matchingFiles.length === 0) {
        throw new Error(`No snapshot files found for network '${network}' in folder '${folder}'`);
      }
      
      // Sort files for consistent ordering
      matchingFiles.sort();
      
      console.log(`Found snapshot files:`);
      matchingFiles.forEach(file => console.log(`  - ${path.basename(file)}`));
      
      return matchingFiles;
    } catch (e) {
      throw new Error(`Failed to read snapshots folder '${folder}': ${e}`);
    }
  }
  
  private generateAnalytics(snapshot: [string, number[]][]): Analytics {
    // Extract amounts (assuming single token for simplicity)
    const amounts = snapshot.map(([_, rewards]) => rewards[0]);
    amounts.sort((a, b) => a - b);
    
    const totalHolders = amounts.length;
    const totalTokens = amounts.reduce((sum, amount) => sum + amount, 0);
    const average = totalTokens / totalHolders;
    
    // Calculate median
    const median = totalHolders % 2 === 0
      ? (amounts[totalHolders / 2 - 1] + amounts[totalHolders / 2]) / 2
      : amounts[Math.floor(totalHolders / 2)];
    
    // Calculate standard deviation
    const variance = amounts.reduce((sum, amount) => sum + Math.pow(amount - average, 2), 0) / totalHolders;
    const stdDev = Math.sqrt(variance);
    
    // Calculate percentiles
    const percentiles: { [key: string]: number } = {};
    [10, 25, 50, 75, 90, 95, 99].forEach(p => {
      const index = Math.floor((p / 100) * (totalHolders - 1));
      percentiles[`p${p}`] = amounts[index];
    });
    
    // Create distribution buckets
    const buckets = this.createDistributionBuckets(snapshot);
    
    // Get top holders
    const topHolders = snapshot
      .sort(([_, a], [__, b]) => b[0] - a[0])
      .slice(0, 20)
      .map(([address, rewards]) => ({ address, amount: rewards[0] }));
    
    return {
      totalHolders,
      totalTokensDistributed: totalTokens,
      averageTokensPerHolder: average,
      medianTokensPerHolder: median,
      standardDeviation: stdDev,
      min: amounts[0],
      max: amounts[amounts.length - 1],
      distributionBuckets: buckets,
      topHolders,
      percentiles
    };
  }
  
  private createDistributionBuckets(snapshot: [string, number[]][]): DistributionBucket[] {
    const bucketRanges = [
      { min: 1, max: 5, range: '1-5' },
      { min: 6, max: 10, range: '6-10' },
      { min: 11, max: 20, range: '11-20' },
      { min: 21, max: 50, range: '21-50' },
      { min: 51, max: 100, range: '51-100' },
      { min: 101, max: 200, range: '101-200' },
      { min: 201, max: 500, range: '201-500' },
      { min: 501, max: 1000, range: '501-1000' },
      { min: 1001, max: Number.MAX_SAFE_INTEGER, range: '1001+' }
    ];
    
    const buckets: DistributionBucket[] = bucketRanges.map(range => ({
      ...range,
      count: 0,
      totalTokens: 0,
      addresses: []
    }));
    
    snapshot.forEach(([address, rewards]) => {
      const amount = rewards[0];
      const bucket = buckets.find(b => amount >= b.min && amount <= b.max);
      if (bucket) {
        bucket.count++;
        bucket.totalTokens += amount;
        if (bucket.addresses.length < 10) { // Keep sample addresses
          bucket.addresses.push(address);
        }
      }
    });
    
    // Remove empty buckets
    return buckets.filter(b => b.count > 0);
  }
  
  private writeDistributionCSV(snapshot: [string, number[]][], filename: string): void {
    const headers = 'address,amount,rank\n';
    const sortedSnapshot = [...snapshot].sort(([_, a], [__, b]) => b[0] - a[0]);
    
    const rows = sortedSnapshot.map(([address, rewards], index) => {
      return `${address},${rewards[0]},${index + 1}`;
    }).join('\n');
    
    fs.writeFileSync(filename, headers + rows);
  }
  
  private writeFrequencyCSV(snapshot: [string, number[]][], filename: string): void {
    // Count frequency of each amount
    const frequencyMap = new Map<number, number>();
    
    snapshot.forEach(([_, rewards]) => {
      const amount = rewards[0];
      frequencyMap.set(amount, (frequencyMap.get(amount) || 0) + 1);
    });
    
    // Convert to array and sort by amount descending
    const frequencies = Array.from(frequencyMap.entries())
      .sort((a, b) => b[0] - a[0]);
    
    // Create CSV content
    const headers = 'amount,count,percentage\n';
    const totalHolders = snapshot.length;
    
    const rows = frequencies.map(([amount, count]) => {
      const percentage = ((count / totalHolders) * 100).toFixed(2);
      return `${amount},${count},${percentage}`;
    }).join('\n');
    
    fs.writeFileSync(filename, headers + rows);
  }
}

// CLI setup
const program = new Command();

program
  .name('process-rewards')
  .description('Process rewards for merkle drop')
  .option('--name <name>', 'Name for the merkle drop')
  .option('--description <description>', 'Description of the merkle drop')
  .option('--claim-contract <address>', 'Claim contract address for the merkle drop')
  .option('--entrypoint <address>', 'Entrypoint address for claiming')
  .option('--snapshots <files>', 'Comma-separated list of snapshot files to process (optional if using --snapshots-folder)')
  .option('--snapshots-folder <folder>', 'Folder containing snapshot files (use with --network)')
  .option('--network <network>', 'Network name to filter snapshots (ethereum, starknet, base, arbitrum)')
  .option('--rewards-config <file>', 'Path to JSON file with reward amounts per contract')
  .option('--token-cap <amount>', 'Maximum tokens any single address can receive', parseInt)
  .option('--output <file>', 'Output file path for the processed data', 'processed_rewards.json')
  .option('--aggregate-networks <networks>', 'Comma-separated list of networks to aggregate into the main network (e.g., arbitrum,base,linea,polygon)')
  .action(async (options) => {
    try {
      // Validate required options
      if (!options.name || !options.description || !options.claimContract || 
          !options.entrypoint || !options.rewardsConfig) {
        console.error('Required options missing: --name, --description, --claim-contract, --entrypoint, --rewards-config');
        program.help();
        return;
      }
      
      // Validate snapshots options
      if (!options.snapshots && (!options.snapshotsFolder || !options.network)) {
        console.error('Either --snapshots OR (--snapshots-folder AND --network) must be provided');
        program.help();
        return;
      }
      
      if (options.snapshots && (options.snapshotsFolder || options.network)) {
        console.error('Cannot use --snapshots with --snapshots-folder/--network. Choose one method.');
        program.help();
        return;
      }

      // Parse snapshots from comma-separated string or leave empty for auto-detection
      const snapshotFiles = options.snapshots ? options.snapshots.split(',').map((f: string) => f.trim()) : [];
      
      // Parse aggregate networks if provided
      let aggregateNetworks: string[] | undefined;
      if (options.aggregateNetworks) {
        aggregateNetworks = options.aggregateNetworks.split(',').map((n: string) => n.trim());
      }
      
      const processor = new ProcessCommand(
        options.name,
        options.description,
        options.claimContract,
        options.entrypoint,
        snapshotFiles,
        options.rewardsConfig,
        options.output,
        options.snapshotsFolder,
        options.network,
        options.tokenCap,
        aggregateNetworks
      );

      await processor.run();
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();