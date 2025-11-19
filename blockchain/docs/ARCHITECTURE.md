# Blockchain Integration Architecture

## System Overview

This document provides a detailed technical architecture of the Solana blockchain integration with the loan management system.

## Architecture Layers

### 1. Presentation Layer (Frontend)
- Next.js application
- User interface for loan management
- Admin dashboard
- Real-time blockchain transaction status

### 2. Application Layer (Backend)
- Express.js REST API
- MongoDB database for off-chain data
- Authentication & authorization
- Business logic orchestration

### 3. Integration Layer (Blockchain SDK)
- `SolanaBlockchainService`: Core blockchain operations
- `WalletManager`: Key management and wallet operations
- `BlockchainIntegrationService`: High-level integration API
- Event listeners and webhook handlers

### 4. Blockchain Layer (Solana)
- Loan Management Program (Smart Contract)
- On-chain data storage
- Transaction processing
- Event emission

## Data Architecture

### Hybrid Storage Strategy

The system uses a hybrid approach, storing data both on-chain and off-chain:

#### On-Chain Data (Solana)
**Purpose**: Immutability, transparency, verification

- User blockchain profiles (sanitized)
- Loan contracts and terms
- Payment records with timestamps
- Credit scores and risk profiles
- Transaction hashes
- State transitions

**Advantages**:
- Tamper-proof
- Publicly verifiable
- No central authority
- Cryptographic security

**Limitations**:
- Storage costs
- Transaction fees
- Slower than off-chain
- Public visibility

#### Off-Chain Data (MongoDB)
**Purpose**: Performance, privacy, rich queries

- Full user PII (encrypted)
- Detailed documents and files
- Session data
- Cache and temporary data
- Complex relationships
- Analytics and aggregations

**Advantages**:
- Fast queries
- Private data
- Cost-effective
- Flexible schema

**Limitations**:
- Centralized
- Requires trust
- Mutable

### Data Synchronization

```
┌─────────────────────────────────────────────────────────┐
│                   User Action                            │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Backend Validation                          │
│  - Business logic  - Authorization  - Data validation   │
└────────────┬───────────────────────┬────────────────────┘
             │                       │
             ▼                       ▼
┌────────────────────┐   ┌─────────────────────────────┐
│  MongoDB Update    │   │  Blockchain Transaction     │
│  (Immediate)       │   │  (Async)                    │
└────────────┬───────┘   └────────────┬────────────────┘
             │                        │
             ▼                        ▼
┌────────────────────┐   ┌─────────────────────────────┐
│  Response to User  │   │  Transaction Confirmation   │
└────────────────────┘   └────────────┬────────────────┘
                                      │
                                      ▼
                         ┌─────────────────────────────┐
                         │  Update Blockchain Refs     │
                         │  in MongoDB                 │
                         └─────────────────────────────┘
```

## Component Interactions

### 1. User Registration Flow

```typescript
User → Frontend → Backend API → MongoDB (create user)
                           ↓
                  Blockchain Service
                           ↓
                  Create Solana Wallet
                           ↓
                  Register on Blockchain
                           ↓
                  Store public key in MongoDB
```

### 2. Loan Creation Flow

```typescript
Admin → Approve Loan → Backend API → MongoDB (create loan)
                                ↓
                       Blockchain Service
                                ↓
                       Fetch user's wallet
                                ↓
                       Create loan on-chain
                                ↓
                       Store loan account in MongoDB
```

### 3. Payment Processing Flow

```typescript
User → Stripe Payment → Webhook → Backend
                            ↓
                    Update MongoDB
                            ↓
                    Blockchain Service
                            ↓
                    Record payment on-chain
                            ↓
                    Update credit score
                            ↓
                    Store payment record
```

## Program Derived Addresses (PDAs)

PDAs are deterministic addresses derived from seeds. They allow for predictable account addresses without private keys.

### PDA Seeds

1. **Program State**: `["program-state"]`
2. **User Profile**: `["user-profile", user_pubkey]`
3. **Loan**: `["loan", user_pubkey, loan_id]`
4. **Payment Record**: `["payment", loan_pubkey, installment_number]`
5. **Risk Profile**: `["risk-profile", user_pubkey]`

### Benefits

- No need to store account addresses
- Deterministic address generation
- Ownership verification
- Prevents collisions

## Security Architecture

### Key Management

```
┌─────────────────────────────────────────────────────┐
│               Wallet Hierarchy                       │
├─────────────────────────────────────────────────────┤
│                                                      │
│  Admin Wallet (Hot Wallet)                          │
│  ├── Program authority                              │
│  ├── Can create loans                               │
│  ├── Can update risk scores                         │
│  └── Can waive fines                                │
│                                                      │
│  User Wallets (Generated per user)                  │
│  ├── Stored encrypted on server                     │
│  ├── Used for on-chain registration                 │
│  ├── Signs payment records                          │
│  └── Read-only for queries                          │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### Access Control Matrix

| Operation | User | Admin | System |
|-----------|------|-------|--------|
| Register User | ✅ | ✅ | ❌ |
| Update Profile | ✅ | ❌ | ❌ |
| Create Loan | ❌ | ✅ | ❌ |
| Record Payment | ❌ | ✅ | ✅ |
| Update Risk Score | ❌ | ✅ | ✅ |
| Mark Defaulted | ❌ | ✅ | ❌ |
| Waive Fine | ❌ | ✅ | ❌ |
| View Public Data | ✅ | ✅ | ✅ |

## Event System

### Event Emission

All state-changing operations emit events for:
- Audit logging
- Real-time notifications
- Analytics
- External integrations

### Event Types

```typescript
enum EventType {
  UserRegistered,
  LoanCreated,
  PaymentRecorded,
  RiskScoreUpdated,
  LoanDefaulted,
  LoanCompleted,
  FineWaived,
}
```

### Event Listeners

```typescript
// Backend event listener
blockchainService.program.addEventListener('PaymentRecorded', (event, slot) => {
  console.log('Payment recorded on-chain:', event);
  
  // Trigger notifications
  notificationService.sendPaymentConfirmation(event.user, event.amount);
  
  // Update analytics
  analyticsService.recordPayment(event);
});
```

## Performance Considerations

### Transaction Throughput

- Solana: ~65,000 TPS
- Expected load: ~100 transactions/day
- Headroom: 99.9998%

### Cost Analysis

| Operation | Compute Units | Cost (SOL) | Cost (USD)* |
|-----------|---------------|------------|-------------|
| Register User | ~50,000 | 0.000005 | $0.0005 |
| Create Loan | ~80,000 | 0.000008 | $0.0008 |
| Record Payment | ~60,000 | 0.000006 | $0.0006 |
| Update Risk Score | ~40,000 | 0.000004 | $0.0004 |

*Assuming SOL = $100

### Optimization Strategies

1. **Batch Operations**: Group multiple operations when possible
2. **Lazy Loading**: Fetch on-chain data only when needed
3. **Caching**: Cache frequently accessed blockchain data
4. **Async Processing**: Use background jobs for blockchain writes
5. **Error Handling**: Implement retry logic with exponential backoff

## Scalability

### Horizontal Scaling

- Multiple backend instances can share blockchain service
- Wallet manager uses file-based storage (can be migrated to S3/KMS)
- Read-heavy operations can use Solana RPC replicas

### Vertical Scaling

- Increase RPC connection limits
- Optimize transaction batching
- Implement transaction priority fees for faster confirmation

## Disaster Recovery

### Backup Strategy

1. **Private Keys**: Encrypted backup in secure vault (AWS KMS, HashiCorp Vault)
2. **Program Data**: Blockchain is the source of truth (no backup needed)
3. **MongoDB Data**: Regular backups with point-in-time recovery
4. **Sync State**: Maintain mapping between MongoDB IDs and blockchain accounts

### Recovery Procedures

1. **Lost Admin Key**: Use upgrade authority to deploy new program
2. **Lost User Key**: Generate new key, mark old account abandoned
3. **Blockchain Fork**: Follow Solana consensus, update RPC endpoint
4. **Data Inconsistency**: Run reconciliation script to sync MongoDB with blockchain

## Monitoring & Observability

### Metrics to Track

1. **Blockchain Metrics**
   - Transaction success rate
   - Average confirmation time
   - Transaction fees
   - Account balances

2. **System Metrics**
   - API response times
   - Blockchain integration latency
   - Wallet creation rate
   - Error rates

3. **Business Metrics**
   - On-chain users
   - On-chain loans
   - Payment verification rate
   - Credit score updates

### Logging

```typescript
// Structured logging example
logger.info('Blockchain transaction', {
  operation: 'create_loan',
  userId: user._id,
  loanId: loan._id,
  txHash: result.txHash,
  blockTime: Date.now(),
  cost: 0.000008,
});
```

## Future Enhancements

### Phase 1: Core Features (Current)
- ✅ User registration
- ✅ Loan creation
- ✅ Payment recording
- ✅ Risk scoring

### Phase 2: Advanced Features
- 🔄 NFT-based loan certificates
- 🔄 Token-based rewards program
- 🔄 Cross-chain bridges
- 🔄 DAO governance

### Phase 3: DeFi Integration
- 📋 Liquidity pools
- 📋 Yield farming
- 📋 Decentralized lending
- 📋 Credit default swaps

## References

- [Solana Documentation](https://docs.solana.com/)
- [Anchor Framework](https://www.anchor-lang.com/)
- [Solana Program Library](https://spl.solana.com/)
- [Solana Cookbook](https://solanacookbook.com/)
