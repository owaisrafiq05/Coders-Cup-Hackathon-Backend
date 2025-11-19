# Backend Integration Guide

This guide shows how to integrate the Solana blockchain with your Express backend.

## 1. Install Dependencies in Backend

```bash
cd ../Coders-Cup-Hackathon-Backend

npm install @solana/web3.js @coral-xyz/anchor bs58 dotenv
```

## 2. Copy SDK to Backend

```bash
# From blockchain folder
cp -r sdk ../Coders-Cup-Hackathon-Backend/src/blockchain-sdk
```

## 3. Add Environment Variables

Add to backend `.env`:

```bash
# Solana Blockchain Configuration
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_PROGRAM_ID=your_program_id_here
SOLANA_ADMIN_KEYPAIR_PATH=./config/admin-keypair.json
SOLANA_WALLETS_DIR=./wallets
SOLANA_COMMITMENT=confirmed
ENABLE_BLOCKCHAIN=true
```

## 4. Create Blockchain Model

Create `src/models/UserBlockchain.ts`:

```typescript
import mongoose, { Schema, Document } from 'mongoose';

export interface IUserBlockchain extends Document {
  userId: mongoose.Types.ObjectId;
  solanaPublicKey: string;
  registeredOnChain: boolean;
  registrationTxHash?: string;
  loans: Array<{
    loanId: string;
    solanaLoanAccount: string;
    creationTxHash: string;
    createdAt: Date;
  }>;
  payments: Array<{
    paymentId: string;
    solanaPaymentAccount: string;
    paymentTxHash: string;
    createdAt: Date;
  }>;
  riskUpdates: Array<{
    riskScore: number;
    riskLevel: string;
    updateTxHash: string;
    updatedAt: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const UserBlockchainSchema = new Schema<IUserBlockchain>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },
  
  solanaPublicKey: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  registeredOnChain: {
    type: Boolean,
    default: false
  },
  
  registrationTxHash: String,
  
  loans: [{
    loanId: { type: String, required: true },
    solanaLoanAccount: { type: String, required: true },
    creationTxHash: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
  }],
  
  payments: [{
    paymentId: { type: String, required: true },
    solanaPaymentAccount: { type: String, required: true },
    paymentTxHash: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
  }],
  
  riskUpdates: [{
    riskScore: { type: Number, required: true },
    riskLevel: { type: String, required: true },
    updateTxHash: { type: String, required: true },
    updatedAt: { type: Date, default: Date.now }
  }]
  
}, {
  timestamps: true
});

export default mongoose.model<IUserBlockchain>('UserBlockchain', UserBlockchainSchema);
```

## 5. Create Blockchain Service

Create `src/services/blockchainService.ts`:

```typescript
import { BlockchainIntegrationService } from '../blockchain-sdk';
import { Keypair } from '@solana/web3.js';
import * as fs from 'fs';
import logger from '../utils/logger';

class BlockchainService {
  private service: BlockchainIntegrationService | null = null;
  private enabled: boolean;

  constructor() {
    this.enabled = process.env.ENABLE_BLOCKCHAIN === 'true';
  }

  async initialize(): Promise<void> {
    if (!this.enabled) {
      logger.info('Blockchain integration disabled');
      return;
    }

    try {
      const config = {
        rpcUrl: process.env.SOLANA_RPC_URL!,
        commitment: 'confirmed' as const,
        programId: process.env.SOLANA_PROGRAM_ID!,
      };

      this.service = new BlockchainIntegrationService(config);

      // Load admin keypair
      const keypairPath = process.env.SOLANA_ADMIN_KEYPAIR_PATH!;
      const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
      const adminKeypair = Keypair.fromSecretKey(new Uint8Array(keypairData));

      await this.service.initialize(adminKeypair);
      logger.info('Blockchain service initialized successfully');
    } catch (error: any) {
      logger.error('Failed to initialize blockchain service:', error.message);
      this.enabled = false;
    }
  }

  isEnabled(): boolean {
    return this.enabled && this.service !== null;
  }

  getService(): BlockchainIntegrationService {
    if (!this.service) {
      throw new Error('Blockchain service not initialized');
    }
    return this.service;
  }
}

export const blockchainService = new BlockchainService();
```

## 6. Update app.js

Add blockchain initialization:

```typescript
// Import
import { blockchainService } from './services/blockchainService';

// After MongoDB connection
async function startServer() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log('MongoDB connected');

    // Initialize blockchain
    await blockchainService.initialize();
    console.log('Blockchain service ready');

    // Start server
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
```

## 7. Update Auth Controller

Modify `src/controllers/auth.controller.ts`:

```typescript
import { blockchainService } from '../services/blockchainService';
import UserBlockchain from '../models/UserBlockchain';

export const register = async (req: Request, res: Response) => {
  try {
    // ... existing registration logic ...
    const user = await User.create({ ... });

    // Register on blockchain
    if (blockchainService.isEnabled()) {
      try {
        const service = blockchainService.getService();
        const result = await service.registerUserOnChain(
          user._id.toString(),
          {
            fullName: user.fullName,
            monthlyIncome: user.monthlyIncome,
            employmentType: user.employmentType,
          }
        );

        await UserBlockchain.create({
          userId: user._id,
          solanaPublicKey: result.publicKey,
          registeredOnChain: true,
          registrationTxHash: result.txHash,
        });

        logger.info('User registered on blockchain', {
          userId: user._id,
          publicKey: result.publicKey,
          txHash: result.txHash,
        });
      } catch (blockchainError: any) {
        logger.error('Blockchain registration failed', {
          userId: user._id,
          error: blockchainError.message,
        });
        // Continue with traditional flow
      }
    }

    res.status(201).json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
```

## 8. Update Admin Controller

Modify `src/controllers/admin.controller.ts`:

```typescript
export const createLoan = async (req: Request, res: Response) => {
  try {
    // ... existing loan creation ...
    const loan = await Loan.create({ ... });

    // Record on blockchain
    if (blockchainService.isEnabled()) {
      try {
        const service = blockchainService.getService();
        const result = await service.createLoanOnChain(
          userId.toString(),
          {
            principalAmount: loan.principalAmount,
            interestRate: loan.interestRate,
            tenureMonths: loan.tenureMonths,
            startDate: loan.startDate,
          }
        );

        await UserBlockchain.findOneAndUpdate(
          { userId },
          {
            $push: {
              loans: {
                loanId: loan._id.toString(),
                solanaLoanAccount: result.loanAccount,
                creationTxHash: result.txHash,
              },
            },
          }
        );

        logger.info('Loan recorded on blockchain', {
          loanId: loan._id,
          loanAccount: result.loanAccount,
          txHash: result.txHash,
        });
      } catch (blockchainError: any) {
        logger.error('Blockchain loan creation failed', {
          loanId: loan._id,
          error: blockchainError.message,
        });
      }
    }

    res.status(201).json({ success: true, data: loan });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
```

## 9. Update Payment Service

Modify `src/services/paymentService.ts`:

```typescript
private async handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  // ... existing payment processing ...

  if (blockchainService.isEnabled()) {
    try {
      const service = blockchainService.getService();
      const userBlockchain = await UserBlockchain.findOne({ userId: installment.userId });
      const loanBlockchain = userBlockchain?.loans.find(
        l => l.loanId === loan._id.toString()
      );

      if (loanBlockchain) {
        const result = await service.recordPaymentOnChain(
          userId.toString(),
          loanBlockchain.solanaLoanAccount,
          {
            installmentNumber: installment.installmentNumber,
            amount: installment.totalDue,
            paymentHash: session.payment_intent as string,
          }
        );

        await UserBlockchain.findOneAndUpdate(
          { userId },
          {
            $push: {
              payments: {
                paymentId: transaction._id.toString(),
                solanaPaymentAccount: result.paymentAccount,
                paymentTxHash: result.txHash,
              },
            },
          }
        );

        logger.info('Payment recorded on blockchain', {
          paymentAccount: result.paymentAccount,
          txHash: result.txHash,
        });
      }
    } catch (blockchainError: any) {
      logger.error('Blockchain payment recording failed', {
        error: blockchainError.message,
      });
    }
  }
}
```

## 10. Add Blockchain Endpoints

Create `src/routes/blockchain.routes.ts`:

```typescript
import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import { roleCheckMiddleware } from '../middlewares/roleCheck.middleware';
import UserBlockchain from '../models/UserBlockchain';
import { blockchainService } from '../services/blockchainService';

const router = Router();

// Get user's blockchain data
router.get('/user/:userId', authMiddleware, async (req, res) => {
  try {
    const blockchainData = await UserBlockchain.findOne({ userId: req.params.userId });
    
    if (!blockchainData) {
      return res.status(404).json({ success: false, message: 'No blockchain data found' });
    }

    // Get on-chain profile
    let onChainProfile = null;
    if (blockchainService.isEnabled()) {
      try {
        const service = blockchainService.getService();
        onChainProfile = await service.getUserProfileFromChain(req.params.userId);
      } catch (error) {
        // Profile not on chain yet
      }
    }

    res.json({
      success: true,
      data: {
        blockchainData,
        onChainProfile,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get loan from blockchain
router.get('/loan/:loanAccount', authMiddleware, async (req, res) => {
  try {
    if (!blockchainService.isEnabled()) {
      return res.status(503).json({ success: false, message: 'Blockchain service unavailable' });
    }

    const service = blockchainService.getService();
    const loan = await service.getLoanFromChain(req.params.loanAccount);

    res.json({ success: true, data: loan });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get risk profile from blockchain
router.get('/risk/:userId', authMiddleware, async (req, res) => {
  try {
    if (!blockchainService.isEnabled()) {
      return res.status(503).json({ success: false, message: 'Blockchain service unavailable' });
    }

    const service = blockchainService.getService();
    const riskProfile = await service.getRiskProfileFromChain(req.params.userId);

    res.json({ success: true, data: riskProfile });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
```

Add to `src/routes/index.ts`:

```typescript
import blockchainRoutes from './blockchain.routes';

// ... other routes ...
router.use('/blockchain', blockchainRoutes);
```

## 11. Testing

```bash
# Start backend
npm run dev

# Test blockchain endpoints
curl http://localhost:5000/api/blockchain/user/{userId}
```

## Complete! 🎉

Your backend now records all operations on the Solana blockchain while maintaining the existing functionality!
