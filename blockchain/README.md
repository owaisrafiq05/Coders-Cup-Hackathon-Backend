# Solana Blockchain Integration for Loan Management System

## 🌟 Overview

This blockchain integration adds a transparent, immutable, and decentralized layer to the loan management system using Solana blockchain. It provides on-chain verification of loans, payments, and credit scoring, ensuring transparency and building trust.

## 📋 Table of Contents

1. [Architecture](#architecture)
2. [Features](#features)
3. [Smart Contracts](#smart-contracts)
4. [Setup & Installation](#setup--installation)
5. [Deployment Guide](#deployment-guide)
6. [API Reference](#api-reference)
7. [Integration Examples](#integration-examples)
8. [Security](#security)
9. [Testing](#testing)
10. [Troubleshooting](#troubleshooting)

---

## 🏗️ Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (Next.js)                      │
│  - User Dashboard  - Admin Panel  - Loan Management         │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│                   Backend (Express + MongoDB)                │
│  - REST API  - Authentication  - Business Logic             │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│              Blockchain Integration Layer                    │
│  - Solana Service  - Wallet Manager  - Event Listeners      │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│                 Solana Blockchain Network                    │
│  - Loan Management Program (Smart Contract)                 │
│  - On-chain Data Storage  - Transaction History             │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **User Registration**: User registers → Backend creates account → Blockchain registers user profile
2. **Loan Creation**: Admin approves → Backend creates loan → Blockchain records loan details
3. **Payment Processing**: User pays via Stripe → Backend updates → Blockchain records payment
4. **Risk Assessment**: AI calculates risk → Backend stores → Blockchain updates risk profile

---

## ✨ Features

### On-Chain Features

- ✅ **User Registration**: Permanent on-chain user profiles with employment and income data
- ✅ **Loan Management**: Immutable loan records with complete payment history
- ✅ **Payment Tracking**: Transparent payment records with timestamp verification
- ✅ **Credit Scoring**: On-chain credit scores that update based on payment behavior
- ✅ **Risk Profiling**: AI-powered risk assessment stored on blockchain
- ✅ **Fine Management**: Transparent fine calculation and waiver records
- ✅ **Audit Trail**: Complete history of all transactions and state changes

### Benefits

- 🔒 **Transparency**: All transactions are publicly verifiable
- 🛡️ **Security**: Cryptographic security of Solana blockchain
- 📊 **Immutability**: Historical records cannot be altered
- ⚡ **Performance**: Solana's high throughput (65,000 TPS)
- 💰 **Low Cost**: Transaction fees < $0.01
- 🌐 **Decentralization**: No single point of failure

---

## 📜 Smart Contracts

### Program Structure

The Loan Management Program is built using the Anchor framework and consists of:

#### State Accounts

1. **LoanProgramState**: Global program configuration
   - Authority
   - Total users, loans, volume
   - Fee percentage
   - Pause status

2. **UserProfile**: Individual user data
   - Personal information (name, income, employment)
   - Loan statistics (total, active, completed, defaulted)
   - Payment behavior (on-time, late, missed)
   - Credit score and risk level

3. **Loan**: Loan details
   - Amount, interest rate, tenure
   - Outstanding balance, repayments
   - Status (Active, Completed, Defaulted)
   - Timestamps

4. **PaymentRecord**: Individual payment tracking
   - Installment number
   - Amount and fines
   - Payment timestamp
   - On-time status

5. **RiskProfile**: Risk assessment data
   - Risk score and level
   - Default probability
   - Recommended loan limits

#### Instructions (Functions)

| Instruction | Description | Access |
|------------|-------------|--------|
| `initialize` | Initialize the program | Admin |
| `register_user` | Register new user on-chain | User |
| `update_user_profile` | Update user information | User |
| `create_loan` | Create a new loan | Admin |
| `record_payment` | Record installment payment | System |
| `update_risk_score` | Update user's risk profile | Admin/AI |
| `mark_loan_defaulted` | Mark loan as defaulted | Admin |
| `mark_loan_completed` | Mark loan as completed | System |
| `waive_fine` | Waive penalty charges | Admin |
| `get_credit_score` | Retrieve credit score | Public |

---

## 🚀 Setup & Installation

### Prerequisites

- Node.js >= 18.x
- Rust >= 1.70
- Solana CLI >= 1.18
- Anchor CLI >= 0.30.1
- Yarn or npm

### Installation Steps

#### 1. Install Solana CLI

```bash
# Windows (PowerShell)
sh -c "$(curl -sSfL https://release.solana.com/v1.18.26/install)"

# Update PATH
$env:PATH += ";$HOME\.local\share\solana\install\active_release\bin"

# Verify installation
solana --version
```

#### 2. Install Anchor CLI

```bash
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install 0.30.1
avm use 0.30.1
anchor --version
```

#### 3. Setup Solana Wallet

```bash
# Generate new keypair
solana-keygen new --outfile ~/.config/solana/id.json

# View public key
solana-keygen pubkey ~/.config/solana/id.json

# Set config
solana config set --url https://api.devnet.solana.com
solana config set --keypair ~/.config/solana/id.json
```

#### 4. Get Devnet SOL

```bash
# Airdrop SOL for testing
solana airdrop 2

# Check balance
solana balance
```

#### 5. Install Project Dependencies

```bash
cd blockchain
npm install
# or
yarn install
```

---

## 📦 Deployment Guide

### Local Development (Localnet)

```bash
# Terminal 1: Start local validator
solana-test-validator

# Terminal 2: Build and deploy
cd blockchain
anchor build
anchor deploy
```

### Devnet Deployment

```bash
# Configure for devnet
solana config set --url https://api.devnet.solana.com

# Get devnet SOL
solana airdrop 2

# Build and deploy
anchor build
anchor deploy --provider.cluster devnet

# Note the Program ID from output
```

### Mainnet Deployment

```bash
# Configure for mainnet
solana config set --url https://api.mainnet-beta.solana.com

# Ensure sufficient SOL for deployment (~5-10 SOL)
solana balance

# Build with optimizations
anchor build --verifiable

# Deploy to mainnet
anchor deploy --provider.cluster mainnet

# Update program ID in:
# - Anchor.toml
# - programs/loan-management/src/lib.rs (declare_id!)
```

### Post-Deployment

```bash
# Initialize the program
ts-node scripts/initialize-program.ts

# Verify deployment
solana program show <PROGRAM_ID>
```

---

## 📚 API Reference

### TypeScript SDK

#### Initialize Service

```typescript
import { BlockchainIntegrationService, SolanaConfig } from './sdk';
import { Keypair } from '@solana/web3.js';

const config: SolanaConfig = {
  rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  commitment: 'confirmed',
  programId: process.env.SOLANA_PROGRAM_ID!,
  adminKeypairPath: './admin-keypair.json',
};

const blockchainService = new BlockchainIntegrationService(config);

// Load admin keypair
const adminKeypair = Keypair.fromSecretKey(/* ... */);
await blockchainService.initialize(adminKeypair);
```

#### Register User

```typescript
const result = await blockchainService.registerUserOnChain(
  userId: '507f1f77bcf86cd799439011',
  {
    fullName: 'Ahmed Khan',
    monthlyIncome: 50000, // PKR
    employmentType: 'SALARIED',
  }
);

// Returns: { publicKey: string, txHash: string }
```

#### Create Loan

```typescript
const result = await blockchainService.createLoanOnChain(
  userId: '507f1f77bcf86cd799439011',
  {
    principalAmount: 100000,
    interestRate: 12.5,
    tenureMonths: 12,
    startDate: new Date(),
  }
);

// Returns: { loanAccount: string, txHash: string }
```

#### Record Payment

```typescript
const result = await blockchainService.recordPaymentOnChain(
  userId: '507f1f77bcf86cd799439011',
  loanAccount: 'Loan1a2b3c4d...',
  {
    installmentNumber: 1,
    amount: 9000,
    paymentHash: 'pi_3M1a2b3c4d...',
  }
);

// Returns: { paymentAccount: string, txHash: string }
```

#### Update Risk Score

```typescript
const txHash = await blockchainService.updateRiskScoreOnChain(
  userId: '507f1f77bcf86cd799439011',
  {
    riskScore: 72.5,
    riskLevel: 'MEDIUM',
    defaultProbability: 0.15,
  }
);
```

#### Query On-Chain Data

```typescript
// Get user profile
const userProfile = await blockchainService.getUserProfileFromChain(userId);

// Get loan details
const loan = await blockchainService.getLoanFromChain(loanAccount);

// Get risk profile
const riskProfile = await blockchainService.getRiskProfileFromChain(userId);
```

---

## 🔗 Integration Examples

### Backend Integration

#### 1. User Registration Hook

```typescript
// src/controllers/auth.controller.ts

import { blockchainService } from '../services/blockchain';

export const register = async (req: Request, res: Response) => {
  try {
    // ... existing registration logic
    const user = await User.create({ ... });

    // Register on blockchain
    try {
      const blockchainResult = await blockchainService.registerUserOnChain(
        user._id.toString(),
        {
          fullName: user.fullName,
          monthlyIncome: user.monthlyIncome,
          employmentType: user.employmentType,
        }
      );

      // Store blockchain data
      await UserBlockchain.create({
        userId: user._id,
        solanaPublicKey: blockchainResult.publicKey,
        registeredOnChain: true,
        registrationTxHash: blockchainResult.txHash,
      });

      console.log('User registered on blockchain:', blockchainResult.txHash);
    } catch (blockchainError) {
      console.error('Blockchain registration failed:', blockchainError);
      // Continue with traditional flow
    }

    res.status(201).json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
```

#### 2. Loan Creation Hook

```typescript
// src/controllers/admin.controller.ts

export const createLoan = async (req: Request, res: Response) => {
  try {
    // ... existing loan creation logic
    const loan = await Loan.create({ ... });

    // Record on blockchain
    try {
      const blockchainResult = await blockchainService.createLoanOnChain(
        userId,
        {
          principalAmount: loan.principalAmount,
          interestRate: loan.interestRate,
          tenureMonths: loan.tenureMonths,
          startDate: loan.startDate,
        }
      );

      // Update blockchain reference
      await UserBlockchain.findOneAndUpdate(
        { userId },
        {
          $push: {
            loans: {
              loanId: loan._id.toString(),
              solanaLoanAccount: blockchainResult.loanAccount,
              creationTxHash: blockchainResult.txHash,
            },
          },
        }
      );

      console.log('Loan recorded on blockchain:', blockchainResult.txHash);
    } catch (blockchainError) {
      console.error('Blockchain loan creation failed:', blockchainError);
    }

    res.status(201).json({ success: true, data: loan });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
```

#### 3. Payment Recording Hook

```typescript
// src/services/paymentService.ts

private async handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  // ... existing payment processing
  
  // Record on blockchain
  try {
    const userBlockchain = await UserBlockchain.findOne({ userId: installment.userId });
    const loanBlockchain = userBlockchain?.loans.find(
      l => l.loanId === loan._id.toString()
    );

    if (loanBlockchain) {
      const blockchainResult = await blockchainService.recordPaymentOnChain(
        userId.toString(),
        loanBlockchain.solanaLoanAccount,
        {
          installmentNumber: installment.installmentNumber,
          amount: installment.totalDue,
          paymentHash: session.payment_intent as string,
        }
      );

      // Store payment record
      await UserBlockchain.findOneAndUpdate(
        { userId },
        {
          $push: {
            payments: {
              paymentId: transaction._id.toString(),
              solanaPaymentAccount: blockchainResult.paymentAccount,
              paymentTxHash: blockchainResult.txHash,
            },
          },
        }
      );
    }
  } catch (blockchainError) {
    console.error('Blockchain payment recording failed:', blockchainError);
  }
}
```

### Environment Configuration

```bash
# .env file

# Solana Configuration
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_PROGRAM_ID=FLoan1111111111111111111111111111111111111
SOLANA_ADMIN_KEYPAIR_PATH=./config/admin-keypair.json

# Wallet Storage
SOLANA_WALLETS_DIR=./wallets

# Network
SOLANA_COMMITMENT=confirmed
```

---

## 🔐 Security

### Best Practices

1. **Key Management**
   - Never commit private keys to git
   - Use environment variables for sensitive data
   - Rotate admin keys regularly
   - Use hardware wallets for mainnet

2. **Access Control**
   - Admin functions require proper authentication
   - User functions validate ownership
   - PDAs ensure deterministic addresses

3. **Input Validation**
   - All amounts validated on-chain
   - String lengths checked
   - Enum values verified
   - Math overflow protection

4. **Audit Trail**
   - All state changes emit events
   - Transaction history preserved
   - On-chain timestamps

### Security Checklist

- [ ] Admin keypair secured
- [ ] Environment variables configured
- [ ] RPC endpoint authenticated
- [ ] Program upgrade authority set
- [ ] PDAs validated
- [ ] Error handling implemented
- [ ] Events logged
- [ ] Tests passing

---

## 🧪 Testing

See [TESTING.md](./TESTING.md) for comprehensive testing guide.

Quick test:

```bash
# Run all tests
anchor test

# Run specific test
anchor test --skip-local-validator -- --features "test-name"
```

---

## 🐛 Troubleshooting

### Common Issues

#### 1. "Program not initialized"

```typescript
// Solution: Initialize the program first
await blockchainService.initialize(adminKeypair);
```

#### 2. "Insufficient SOL balance"

```bash
# Solution: Airdrop more SOL (devnet)
solana airdrop 2

# Or check balance
solana balance
```

#### 3. "Account already exists"

```typescript
// Solution: User already registered, fetch existing data
const userProfile = await blockchainService.getUserProfileFromChain(userId);
```

#### 4. "Transaction simulation failed"

- Check account ownership
- Verify PDA derivation
- Ensure sufficient balance
- Check program state

### Debug Mode

```typescript
// Enable verbose logging
import { setLogLevel } from '@coral-xyz/anchor';
setLogLevel('debug');
```

---

## 📞 Support

For issues or questions:
- GitHub Issues: [Create Issue](https://github.com/owaisrafiq05/Coders-Cup-Hackathon-Backend/issues)
- Documentation: [Full Docs](./docs/)
- Solana Discord: [Join](https://discord.gg/solana)

---

## 📄 License

MIT License - see [LICENSE](../LICENSE) file for details.
