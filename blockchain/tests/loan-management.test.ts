import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { expect } from 'chai';
import { LoanManagement } from '../target/types/loan_management';
import { Keypair, SystemProgram, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';

describe('Loan Management Program', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.LoanManagement as Program<LoanManagement>;
  
  let admin: Keypair;
  let programState: PublicKey;
  let userKeypair: Keypair;
  let userProfilePDA: PublicKey;
  let loanPDA: PublicKey;

  before(async () => {
    admin = Keypair.generate();
    userKeypair = Keypair.generate();

    // Airdrop SOL to admin and user
    await airdrop(provider.connection, admin.publicKey, 10);
    await airdrop(provider.connection, userKeypair.publicKey, 5);

    // Derive PDAs
    [programState] = PublicKey.findProgramAddressSync(
      [Buffer.from('program-state')],
      program.programId
    );

    [userProfilePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('user-profile'), userKeypair.publicKey.toBuffer()],
      program.programId
    );
  });

  describe('Program Initialization', () => {
    it('Initializes the program', async () => {
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

      console.log('Initialize transaction:', tx);

      const state = await program.account.loanProgramState.fetch(programState);
      expect(state.authority.toString()).to.equal(admin.publicKey.toString());
      expect(state.feePercentage).to.equal(feePercentage);
      expect(state.totalUsers.toNumber()).to.equal(0);
      expect(state.totalLoans.toNumber()).to.equal(0);
      expect(state.paused).to.be.false;
    });
  });

  describe('User Registration', () => {
    it('Registers a new user', async () => {
      const fullName = 'Ahmed Khan';
      const monthlyIncome = new anchor.BN(50_000 * 1_000_000_000);

      const tx = await program.methods
        .registerUser(fullName, monthlyIncome, { salaried: {} })
        .accounts({
          userProfile: userProfilePDA,
          programState,
          authority: userKeypair.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([userKeypair])
        .rpc();

      console.log('Register user transaction:', tx);

      const profile = await program.account.userProfile.fetch(userProfilePDA);
      expect(profile.fullName).to.equal(fullName);
      expect(profile.monthlyIncome.toString()).to.equal(monthlyIncome.toString());
      expect(profile.totalLoans).to.equal(0);
      expect(profile.creditScore).to.equal(500);
    });
  });

  describe('Loan Creation', () => {
    it('Creates a loan for user', async () => {
      const principalAmount = new anchor.BN(100_000 * 1_000_000_000);
      const interestRate = 1250; // 12.5%
      const tenureMonths = 12;
      const startTimestamp = new anchor.BN(Math.floor(Date.now() / 1000));

      const state = await program.account.loanProgramState.fetch(programState);
      const loanId = state.totalLoans;

      [loanPDA] = PublicKey.findProgramAddressSync(
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

      console.log('Create loan transaction:', tx);

      const loan = await program.account.loan.fetch(loanPDA);
      expect(loan.principalAmount.toString()).to.equal(principalAmount.toString());
      expect(loan.interestRate).to.equal(interestRate);
      expect(loan.tenureMonths).to.equal(tenureMonths);
    });
  });

  describe('Payment Recording', () => {
    it('Records a payment', async () => {
      const installmentNumber = 1;
      const amount = new anchor.BN(9_000 * 1_000_000_000);
      const paymentHash = 'pi_test_123456';

      const [paymentRecordPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('payment'),
          loanPDA.toBuffer(),
          Buffer.from([installmentNumber]),
        ],
        program.programId
      );

      const tx = await program.methods
        .recordPayment(installmentNumber, amount, paymentHash)
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

      console.log('Record payment transaction:', tx);

      const payment = await program.account.paymentRecord.fetch(paymentRecordPDA);
      expect(payment.installmentNumber).to.equal(installmentNumber);
      expect(payment.amount.toString()).to.equal(amount.toString());
      expect(payment.paymentHash).to.equal(paymentHash);
    });
  });

  describe('Risk Score Update', () => {
    it('Updates user risk score', async () => {
      const [riskProfilePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('risk-profile'), userKeypair.publicKey.toBuffer()],
        program.programId
      );

      const riskScore = 725;
      const defaultProbability = 1500;

      const tx = await program.methods
        .updateRiskScore(riskScore, { medium: {} }, defaultProbability)
        .accounts({
          userProfile: userProfilePDA,
          riskProfile: riskProfilePDA,
          user: userKeypair.publicKey,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      console.log('Update risk score transaction:', tx);

      const riskProfile = await program.account.riskProfile.fetch(riskProfilePDA);
      expect(riskProfile.riskScore).to.equal(riskScore);
    });
  });
});

async function airdrop(connection: any, publicKey: PublicKey, amount: number) {
  const sig = await connection.requestAirdrop(
    publicKey,
    amount * LAMPORTS_PER_SOL
  );
  await connection.confirmTransaction(sig);
  await new Promise(resolve => setTimeout(resolve, 1000));
}
