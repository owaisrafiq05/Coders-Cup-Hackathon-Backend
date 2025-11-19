# Testing Guide

## Overview

This guide covers comprehensive testing strategies for the Solana blockchain integration.

## Test Structure

```
blockchain/
├── tests/
│   ├── loan-management.test.ts     # Main integration tests
│   ├── unit/
│   │   ├── wallet-manager.test.ts
│   │   ├── solana-service.test.ts
│   │   └── utils.test.ts
│   ├── integration/
│   │   ├── full-flow.test.ts
│   │   └── error-handling.test.ts
│   └── e2e/
│       └── complete-loan-cycle.test.ts
```

## Running Tests

### All Tests

```bash
# Run all tests
anchor test

# Run with verbose output
anchor test -- --show-output

# Run specific test file
anchor test --skip-local-validator tests/loan-management.test.ts
```

### Local Validator

```bash
# Start validator in separate terminal
solana-test-validator

# Run tests against running validator
anchor test --skip-local-validator
```

### Devnet Tests

```bash
# Set cluster to devnet
anchor test --provider.cluster devnet
```

## Test Scenarios

### 1. Program Initialization

```typescript
describe('Program Initialization', () => {
  it('Should initialize program with correct parameters', async () => {
    const feePercentage = 50; // 0.5%
    
    const tx = await program.methods
      .initialize(feePercentage)
      .accounts({
        programState,
        authority: admin.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();
    
    const state = await program.account.loanProgramState.fetch(programState);
    
    expect(state.authority.toString()).to.equal(admin.publicKey.toString());
    expect(state.feePercentage).to.equal(feePercentage);
    expect(state.totalUsers.toNumber()).to.equal(0);
    expect(state.totalLoans.toNumber()).to.equal(0);
    expect(state.paused).to.be.false;
  });
  
  it('Should fail to initialize twice', async () => {
    await expect(
      program.methods.initialize(50).rpc()
    ).to.be.rejected;
  });
});
```

### 2. User Registration

```typescript
describe('User Registration', () => {
  let userKeypair: Keypair;
  let userProfilePDA: PublicKey;
  
  before(() => {
    userKeypair = Keypair.generate();
  });
  
  it('Should register new user', async () => {
    const [userProfile] = PublicKey.findProgramAddressSync(
      [Buffer.from('user-profile'), userKeypair.publicKey.toBuffer()],
      program.programId
    );
    userProfilePDA = userProfile;
    
    // Airdrop SOL to user
    await provider.connection.requestAirdrop(
      userKeypair.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    
    const tx = await program.methods
      .registerUser(
        'Test User',
        new BN(50_000 * 1_000_000_000), // 50k PKR
        { salaried: {} }
      )
      .accounts({
        userProfile: userProfilePDA,
        programState,
        authority: userKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([userKeypair])
      .rpc();
    
    const profile = await program.account.userProfile.fetch(userProfilePDA);
    
    expect(profile.fullName).to.equal('Test User');
    expect(profile.monthlyIncome.toNumber()).to.equal(50_000 * 1_000_000_000);
    expect(profile.totalLoans).to.equal(0);
    expect(profile.creditScore).to.equal(500);
  });
  
  it('Should prevent duplicate registration', async () => {
    await expect(
      program.methods
        .registerUser('Test User 2', new BN(60000), { salaried: {} })
        .accounts({
          userProfile: userProfilePDA,
          programState,
          authority: userKeypair.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([userKeypair])
        .rpc()
    ).to.be.rejected;
  });
});
```

### 3. Loan Creation

```typescript
describe('Loan Creation', () => {
  it('Should create loan for user', async () => {
    const principalAmount = new BN(100_000 * 1_000_000_000); // 100k PKR
    const interestRate = 1250; // 12.5%
    const tenureMonths = 12;
    const startTimestamp = new BN(Math.floor(Date.now() / 1000));
    
    const state = await program.account.loanProgramState.fetch(programState);
    const loanId = state.totalLoans;
    
    const [loanPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('loan'),
        userKeypair.publicKey.toBuffer(),
        loanId.toArrayLike(Buffer, 'le', 8),
      ],
      program.programId
    );
    
    const tx = await program.methods
      .createLoan(principalAmount, interestRate, tenureMonths, startTimestamp)
      .accounts({
        userProfile: userProfilePDA,
        loan: loanPDA,
        programState,
        userAuthority: userKeypair.publicKey,
        admin: admin.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();
    
    const loan = await program.account.loan.fetch(loanPDA);
    
    expect(loan.principalAmount.toString()).to.equal(principalAmount.toString());
    expect(loan.interestRate).to.equal(interestRate);
    expect(loan.tenureMonths).to.equal(tenureMonths);
    expect(loan.status).to.deep.equal({ active: {} });
    expect(loan.outstandingBalance.gt(new BN(0))).to.be.true;
  });
  
  it('Should prevent creating loan with invalid amount', async () => {
    const invalidAmount = new BN(1_000 * 1_000_000_000); // Too low
    
    await expect(
      program.methods
        .createLoan(invalidAmount, 1250, 12, new BN(Date.now() / 1000))
        .rpc()
    ).to.be.rejected;
  });
  
  it('Should prevent user from having multiple active loans', async () => {
    await expect(
      program.methods
        .createLoan(new BN(50000), 1250, 6, new BN(Date.now() / 1000))
        .rpc()
    ).to.be.rejected;
  });
});
```

### 4. Payment Recording

```typescript
describe('Payment Recording', () => {
  let paymentRecordPDA: PublicKey;
  
  it('Should record on-time payment', async () => {
    const installmentNumber = 1;
    const amount = new BN(9_000 * 1_000_000_000);
    
    const [paymentRecord] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('payment'),
        loanPDA.toBuffer(),
        Buffer.from([installmentNumber]),
      ],
      program.programId
    );
    paymentRecordPDA = paymentRecord;
    
    const tx = await program.methods
      .recordPayment(installmentNumber, amount, 'pi_test_123')
      .accounts({
        loan: loanPDA,
        userProfile: userProfilePDA,
        paymentRecord: paymentRecordPDA,
        user: userKeypair.publicKey,
        payer: admin.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();
    
    const payment = await program.account.paymentRecord.fetch(paymentRecordPDA);
    const loan = await program.account.loan.fetch(loanPDA);
    const profile = await program.account.userProfile.fetch(userProfilePDA);
    
    expect(payment.installmentNumber).to.equal(installmentNumber);
    expect(payment.onTime).to.be.true;
    expect(payment.fineAmount.toNumber()).to.equal(0);
    expect(loan.totalRepaid.gt(new BN(0))).to.be.true;
    expect(profile.onTimePayments).to.be.greaterThan(0);
    expect(profile.creditScore).to.be.greaterThan(500);
  });
  
  it('Should record late payment with fine', async () => {
    // Simulate late payment by manipulating timestamp
    const installmentNumber = 2;
    
    // This would require time manipulation in tests
    // or using a mock clock
  });
  
  it('Should prevent duplicate payment recording', async () => {
    await expect(
      program.methods
        .recordPayment(1, new BN(9000), 'pi_test_124')
        .rpc()
    ).to.be.rejected;
  });
});
```

### 5. Risk Score Update

```typescript
describe('Risk Score Updates', () => {
  it('Should update user risk score', async () => {
    const [riskProfilePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('risk-profile'), userKeypair.publicKey.toBuffer()],
      program.programId
    );
    
    const tx = await program.methods
      .updateRiskScore(725, { medium: {} }, 1500)
      .accounts({
        userProfile: userProfilePDA,
        riskProfile: riskProfilePDA,
        user: userKeypair.publicKey,
        admin: admin.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();
    
    const riskProfile = await program.account.riskProfile.fetch(riskProfilePDA);
    const userProfile = await program.account.userProfile.fetch(userProfilePDA);
    
    expect(riskProfile.riskScore).to.equal(725);
    expect(riskProfile.riskLevel).to.deep.equal({ medium: {} });
    expect(riskProfile.defaultProbability).to.equal(1500);
    expect(userProfile.creditScore).to.equal(725);
  });
});
```

### 6. Loan Completion

```typescript
describe('Loan Completion', () => {
  it('Should mark loan as completed after all payments', async () => {
    // Record all remaining payments
    for (let i = 2; i <= 12; i++) {
      await program.methods
        .recordPayment(i, new BN(9000 * 1_000_000_000), `pi_test_${i}`)
        .rpc();
    }
    
    const tx = await program.methods
      .markLoanCompleted()
      .accounts({
        loan: loanPDA,
        userProfile: userProfilePDA,
        authority: admin.publicKey,
      })
      .signers([admin])
      .rpc();
    
    const loan = await program.account.loan.fetch(loanPDA);
    const profile = await program.account.userProfile.fetch(userProfilePDA);
    
    expect(loan.status).to.deep.equal({ completed: {} });
    expect(loan.outstandingBalance.toNumber()).to.equal(0);
    expect(profile.completedLoans).to.equal(1);
    expect(profile.activeLoans).to.equal(0);
  });
});
```

### 7. Default Handling

```typescript
describe('Loan Default', () => {
  it('Should mark loan as defaulted', async () => {
    const tx = await program.methods
      .markLoanDefaulted()
      .accounts({
        loan: loanPDA,
        userProfile: userProfilePDA,
        admin: admin.publicKey,
      })
      .signers([admin])
      .rpc();
    
    const loan = await program.account.loan.fetch(loanPDA);
    const profile = await program.account.userProfile.fetch(userProfilePDA);
    
    expect(loan.status).to.deep.equal({ defaulted: {} });
    expect(profile.defaultedLoans).to.equal(1);
    expect(profile.creditScore).to.be.lessThan(500);
    expect(profile.riskLevel).to.deep.equal({ critical: {} });
  });
});
```

## Integration Tests

### Full Loan Lifecycle

```typescript
describe('Complete Loan Lifecycle', () => {
  it('Should complete full loan cycle', async () => {
    // 1. Initialize program
    await initializeProgram();
    
    // 2. Register user
    const user = await registerUser();
    
    // 3. Create loan
    const loan = await createLoan(user);
    
    // 4. Make all payments
    for (let i = 1; i <= loan.tenureMonths; i++) {
      await makePayment(loan, i);
    }
    
    // 5. Complete loan
    await completeLoan(loan);
    
    // 6. Verify final state
    const finalProfile = await getUserProfile(user);
    expect(finalProfile.completedLoans).to.equal(1);
    expect(finalProfile.creditScore).to.be.greaterThan(500);
  });
});
```

## Performance Tests

```typescript
describe('Performance Tests', () => {
  it('Should handle multiple concurrent registrations', async () => {
    const users = Array(10).fill(0).map(() => Keypair.generate());
    
    const registrations = users.map(user => 
      program.methods.registerUser(/*...*/).rpc()
    );
    
    const results = await Promise.all(registrations);
    expect(results.length).to.equal(10);
  });
  
  it('Should process payments within acceptable time', async () => {
    const start = Date.now();
    
    await program.methods.recordPayment(/*...*/).rpc();
    
    const duration = Date.now() - start;
    expect(duration).to.be.lessThan(5000); // 5 seconds
  });
});
```

## Error Handling Tests

```typescript
describe('Error Handling', () => {
  it('Should handle insufficient funds gracefully', async () => {
    // Create account with no SOL
    const brokeUser = Keypair.generate();
    
    await expect(
      program.methods.registerUser(/*...*/)
        .signers([brokeUser])
        .rpc()
    ).to.be.rejectedWith(/insufficient funds/i);
  });
  
  it('Should handle network interruptions', async () => {
    // Simulate network issue
    // This requires mocking or integration with error simulation
  });
});
```

## Test Utilities

```typescript
// tests/utils.ts

export async function airdrop(
  connection: Connection,
  publicKey: PublicKey,
  amount: number
): Promise<void> {
  const sig = await connection.requestAirdrop(
    publicKey,
    amount * LAMPORTS_PER_SOL
  );
  await connection.confirmTransaction(sig);
}

export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function generateTestUser(): {
  fullName: string;
  monthlyIncome: number;
  employmentType: any;
} {
  return {
    fullName: `Test User ${Math.random().toString(36).substring(7)}`,
    monthlyIncome: Math.floor(Math.random() * 100000) + 30000,
    employmentType: { salaried: {} },
  };
}
```

## Coverage

Run tests with coverage:

```bash
# Using anchor
anchor test --coverage

# Using cargo (for Rust tests)
cargo tarpaulin --out Html
```

## Continuous Integration

### GitHub Actions

```yaml
# .github/workflows/test.yml
name: Blockchain Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Install Solana
        run: |
          sh -c "$(curl -sSfL https://release.solana.com/v1.18.26/install)"
          echo "$HOME/.local/share/solana/install/active_release/bin" >> $GITHUB_PATH
      
      - name: Install Anchor
        run: |
          cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
          avm install 0.30.1
          avm use 0.30.1
      
      - name: Install Node dependencies
        run: yarn install
      
      - name: Run tests
        run: anchor test
```

## Best Practices

1. **Isolate Tests**: Each test should be independent
2. **Clean State**: Reset state between tests
3. **Mock External Services**: Don't rely on external APIs
4. **Test Edge Cases**: Invalid inputs, boundary conditions
5. **Performance Benchmarks**: Track performance over time
6. **Error Scenarios**: Test failure paths
7. **Documentation**: Comment complex test logic

## Debugging Tests

```typescript
// Enable verbose logs
import { setLogLevel } from '@coral-xyz/anchor';
setLogLevel('debug');

// Add breakpoints
debugger;

// Log account data
console.log('Account data:', await program.account.loan.fetch(loanPDA));

// Inspect transaction
const tx = await program.methods.createLoan(/*...*/).transaction();
console.log('Transaction:', tx);
```

## Resources

- [Anchor Testing Guide](https://www.anchor-lang.com/docs/testing)
- [Solana Program Testing](https://docs.solana.com/developing/test-validator)
- [Mocha Documentation](https://mochajs.org/)
- [Chai Assertions](https://www.chaijs.com/)
