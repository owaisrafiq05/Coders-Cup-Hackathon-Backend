#!/usr/bin/env ts-node

import { BlockchainIntegrationService } from '../sdk/integration-service';
import { Keypair } from '@solana/web3.js';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

async function testFullFlow() {
  console.log('🧪 Starting Full Integration Test\n');

  // Setup
  const adminKeypair = loadKeypair(process.env.SOLANA_ADMIN_KEYPAIR_PATH!);
  const service = new BlockchainIntegrationService({
    rpcUrl: process.env.SOLANA_RPC_URL!,
    commitment: 'confirmed',
    programId: process.env.SOLANA_PROGRAM_ID!,
  });

  await service.initialize(adminKeypair);
  console.log('✅ Service initialized\n');

  // Test 1: Register User
  console.log('📝 Test 1: Registering user...');
  const userId = 'test_' + Date.now();
  
  try {
    const registerResult = await service.registerUserOnChain(userId, {
      fullName: 'Test User',
      monthlyIncome: 50000,
      employmentType: 'SALARIED',
    });
    
    console.log('✅ User registered');
    console.log('   Public Key:', registerResult.publicKey);
    console.log('   TX:', registerResult.txHash);
  } catch (error: any) {
    console.error('❌ User registration failed:', error.message);
    return;
  }

  // Test 2: Create Loan
  console.log('\n💰 Test 2: Creating loan...');
  
  try {
    const loanResult = await service.createLoanOnChain(userId, {
      principalAmount: 100000,
      interestRate: 12.5,
      tenureMonths: 12,
      startDate: new Date(),
    });
    
    console.log('✅ Loan created');
    console.log('   Loan Account:', loanResult.loanAccount);
    console.log('   TX:', loanResult.txHash);

    // Test 3: Get User Profile
    console.log('\n👤 Test 3: Fetching user profile...');
    const profile = await service.getUserProfileFromChain(userId);
    console.log('✅ Profile retrieved');
    console.log('   Name:', profile.fullName);
    console.log('   Credit Score:', profile.creditScore);
    console.log('   Total Loans:', profile.totalLoans);

    // Test 4: Get Loan Details
    console.log('\n📊 Test 4: Fetching loan details...');
    const loan = await service.getLoanFromChain(loanResult.loanAccount);
    console.log('✅ Loan retrieved');
    console.log('   Principal:', loan.principalAmount);
    console.log('   Interest Rate:', loan.interestRate + '%');
    console.log('   Monthly Payment:', loan.monthlyInstallment);
    console.log('   Outstanding:', loan.outstandingBalance);

    // Test 5: Record Payment
    console.log('\n💳 Test 5: Recording payment...');
    const paymentResult = await service.recordPaymentOnChain(
      userId,
      loanResult.loanAccount,
      {
        installmentNumber: 1,
        amount: loan.monthlyInstallment,
        paymentHash: 'pi_test_' + Date.now(),
      }
    );
    
    console.log('✅ Payment recorded');
    console.log('   Payment Account:', paymentResult.paymentAccount);
    console.log('   TX:', paymentResult.txHash);

    // Test 6: Update Risk Score
    console.log('\n📈 Test 6: Updating risk score...');
    const riskTx = await service.updateRiskScoreOnChain(userId, {
      riskScore: 72.5,
      riskLevel: 'MEDIUM',
      defaultProbability: 0.15,
    });
    
    console.log('✅ Risk score updated');
    console.log('   TX:', riskTx);

    // Test 7: Get Updated Profile
    console.log('\n🔄 Test 7: Fetching updated profile...');
    const updatedProfile = await service.getUserProfileFromChain(userId);
    console.log('✅ Updated profile retrieved');
    console.log('   Credit Score:', updatedProfile.creditScore);
    console.log('   On-time Payments:', updatedProfile.onTimePayments);
    console.log('   Total Repaid:', updatedProfile.totalRepaid);

    console.log('\n✅ All tests passed successfully! 🎉');
  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

function loadKeypair(path: string): Keypair {
  const data = JSON.parse(fs.readFileSync(path, 'utf-8'));
  return Keypair.fromSecretKey(new Uint8Array(data));
}

testFullFlow()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
