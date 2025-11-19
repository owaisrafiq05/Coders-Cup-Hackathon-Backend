#!/usr/bin/env ts-node

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { SolanaBlockchainService } from '../sdk/solana-service';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('🚀 Initializing Loan Management Program...\n');

  // Configuration
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const programId = process.env.SOLANA_PROGRAM_ID!;
  const adminKeypairPath = process.env.SOLANA_ADMIN_KEYPAIR_PATH || './admin-keypair.json';

  if (!programId) {
    console.error('❌ SOLANA_PROGRAM_ID not set in environment');
    process.exit(1);
  }

  // Load admin keypair
  console.log('📂 Loading admin keypair from:', adminKeypairPath);
  let adminKeypair: Keypair;

  try {
    const keypairData = JSON.parse(fs.readFileSync(path.resolve(adminKeypairPath), 'utf-8'));
    adminKeypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
    console.log('✅ Admin keypair loaded:', adminKeypair.publicKey.toBase58());
  } catch (error) {
    console.error('❌ Failed to load admin keypair:', error);
    console.log('\n💡 Generate a new keypair with: solana-keygen new -o admin-keypair.json');
    process.exit(1);
  }

  // Check balance
  const connection = new Connection(rpcUrl, 'confirmed');
  const balance = await connection.getBalance(adminKeypair.publicKey);
  console.log(`💰 Admin balance: ${balance / 1e9} SOL`);

  if (balance < 0.5e9) {
    console.warn('⚠️  Low balance! You need at least 0.5 SOL to initialize.');
    
    if (rpcUrl.includes('devnet') || rpcUrl.includes('testnet')) {
      console.log('💸 Requesting airdrop...');
      try {
        const sig = await connection.requestAirdrop(adminKeypair.publicKey, 2e9);
        await connection.confirmTransaction(sig);
        console.log('✅ Airdrop successful!');
      } catch (error) {
        console.error('❌ Airdrop failed:', error);
        console.log('Try manually: solana airdrop 2 ' + adminKeypair.publicKey.toBase58());
      }
    } else {
      console.error('❌ Insufficient balance on mainnet. Please fund your account.');
      process.exit(1);
    }
  }

  // Initialize service
  const blockchainService = new SolanaBlockchainService({
    rpcUrl,
    commitment: 'confirmed',
    programId,
  });

  await blockchainService.initialize(adminKeypair);
  console.log('✅ Blockchain service initialized\n');

  // Check if already initialized
  try {
    const programState = await blockchainService.getProgramState();
    console.log('ℹ️  Program already initialized:');
    console.log('   Authority:', programState.authority.toBase58());
    console.log('   Total Users:', programState.totalUsers.toString());
    console.log('   Total Loans:', programState.totalLoans.toString());
    console.log('   Fee Percentage:', programState.feePercentage / 100 + '%');
    console.log('   Paused:', programState.paused);
    console.log('\n✅ Program is ready to use!');
    return;
  } catch (error) {
    console.log('ℹ️  Program not initialized yet, proceeding...\n');
  }

  // Initialize program
  const feePercentage = 50; // 0.5%
  console.log(`🔧 Initializing program with ${feePercentage / 100}% fee...`);

  try {
    const txHash = await blockchainService.initializeProgram(feePercentage);
    console.log('✅ Program initialized successfully!');
    console.log('📝 Transaction:', txHash);
    console.log('🔗 Explorer:', getExplorerUrl(txHash, rpcUrl));

    // Fetch and display state
    const programState = await blockchainService.getProgramState();
    console.log('\n📊 Program State:');
    console.log('   Authority:', programState.authority.toBase58());
    console.log('   Fee Percentage:', programState.feePercentage / 100 + '%');
    console.log('   Total Users:', programState.totalUsers.toString());
    console.log('   Total Loans:', programState.totalLoans.toString());
    console.log('   Paused:', programState.paused);

    console.log('\n✅ Initialization complete! You can now:');
    console.log('   1. Register users');
    console.log('   2. Create loans');
    console.log('   3. Record payments');
    console.log('   4. Update risk scores');
  } catch (error: any) {
    console.error('\n❌ Initialization failed:', error.message);
    
    if (error.message.includes('already in use')) {
      console.log('ℹ️  Program may already be initialized. Checking...');
      try {
        const programState = await blockchainService.getProgramState();
        console.log('✅ Program is initialized and ready!');
      } catch {
        console.error('❌ Program state check failed');
      }
    }
    
    process.exit(1);
  }
}

function getExplorerUrl(signature: string, rpcUrl: string): string {
  const cluster = rpcUrl.includes('devnet')
    ? 'devnet'
    : rpcUrl.includes('testnet')
    ? 'testnet'
    : '';
  
  return cluster
    ? `https://explorer.solana.com/tx/${signature}?cluster=${cluster}`
    : `https://explorer.solana.com/tx/${signature}`;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
