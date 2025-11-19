import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Commitment,
} from '@solana/web3.js';
import { AnchorProvider, Program, Idl, BN } from '@coral-xyz/anchor';
import { LoanManagement } from '../target/types/loan_management';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

export interface SolanaConfig {
  rpcUrl: string;
  commitment: Commitment;
  programId: string;
  adminKeypairPath?: string;
}

export interface UserProfileData {
  fullName: string;
  monthlyIncome: number;
  employmentType: EmploymentType;
}

export interface LoanData {
  principalAmount: number;
  interestRate: number;
  tenureMonths: number;
  startTimestamp: number;
}

export interface PaymentData {
  installmentNumber: number;
  amount: number;
  paymentHash: string;
}

export enum EmploymentType {
  Salaried = 0,
  SelfEmployed = 1,
  BusinessOwner = 2,
  DailyWage = 3,
  Unemployed = 4,
}

export enum LoanStatus {
  Active = 0,
  Completed = 1,
  Defaulted = 2,
  Cancelled = 3,
}

export enum RiskLevel {
  Low = 0,
  Medium = 1,
  High = 2,
  Critical = 3,
}

/**
 * Main Solana Blockchain Service
 * Handles all interactions with the Loan Management Solana program
 */
export class SolanaBlockchainService {
  private connection: Connection;
  private provider: AnchorProvider | null = null;
  private program: Program<LoanManagement> | null = null;
  private programId: PublicKey;
  private adminKeypair: Keypair | null = null;

  constructor(config: SolanaConfig) {
    this.connection = new Connection(config.rpcUrl, config.commitment);
    this.programId = new PublicKey(config.programId);

    // Load admin keypair if provided
    if (config.adminKeypairPath) {
      this.loadAdminKeypair(config.adminKeypairPath);
    }
  }

  /**
   * Load admin keypair from file
   */
  private loadAdminKeypair(keypairPath: string): void {
    try {
      const keypairData = JSON.parse(
        fs.readFileSync(path.resolve(keypairPath), 'utf-8')
      );
      this.adminKeypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
      console.log('Admin keypair loaded:', this.adminKeypair.publicKey.toBase58());
    } catch (error) {
      console.error('Failed to load admin keypair:', error);
      throw new Error('Failed to load admin keypair');
    }
  }

  /**
   * Initialize the Anchor provider and program
   */
  async initialize(wallet: Keypair): Promise<void> {
    const provider = new AnchorProvider(
      this.connection,
      {
        publicKey: wallet.publicKey,
        signTransaction: async (tx) => {
          tx.partialSign(wallet);
          return tx;
        },
        signAllTransactions: async (txs) => {
          txs.forEach((tx) => tx.partialSign(wallet));
          return txs;
        },
      },
      { commitment: 'confirmed' }
    );

    this.provider = provider;

    // Load IDL
    const idlPath = path.join(__dirname, '../target/idl/loan_management.json');
    const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8')) as Idl;

    this.program = new Program(idl as any, this.programId, provider);
  }

  /**
   * Get PDA for program state
   */
  getProgramStatePDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('program-state')],
      this.programId
    );
  }

  /**
   * Get PDA for user profile
   */
  getUserProfilePDA(userPubkey: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('user-profile'), userPubkey.toBuffer()],
      this.programId
    );
  }

  /**
   * Get PDA for loan
   */
  getLoanPDA(userPubkey: PublicKey, loanId: number): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from('loan'),
        userPubkey.toBuffer(),
        new BN(loanId).toArrayLike(Buffer, 'le', 8),
      ],
      this.programId
    );
  }

  /**
   * Get PDA for payment record
   */
  getPaymentRecordPDA(
    loanPubkey: PublicKey,
    installmentNumber: number
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from('payment'),
        loanPubkey.toBuffer(),
        Buffer.from([installmentNumber]),
      ],
      this.programId
    );
  }

  /**
   * Get PDA for risk profile
   */
  getRiskProfilePDA(userPubkey: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('risk-profile'), userPubkey.toBuffer()],
      this.programId
    );
  }

  /**
   * Initialize the loan management program (admin only)
   */
  async initializeProgram(feePercentage: number): Promise<string> {
    if (!this.program || !this.adminKeypair) {
      throw new Error('Program or admin keypair not initialized');
    }

    const [programState] = this.getProgramStatePDA();

    const tx = await this.program.methods
      .initialize(feePercentage)
      .accounts({
        programState,
        authority: this.adminKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([this.adminKeypair])
      .rpc();

    console.log('Program initialized:', tx);
    return tx;
  }

  /**
   * Register a new user on the blockchain
   */
  async registerUser(
    userKeypair: Keypair,
    userData: UserProfileData
  ): Promise<string> {
    if (!this.program) {
      throw new Error('Program not initialized');
    }

    const [userProfile] = this.getUserProfilePDA(userKeypair.publicKey);
    const [programState] = this.getProgramStatePDA();

    const tx = await this.program.methods
      .registerUser(
        userData.fullName,
        new BN(userData.monthlyIncome),
        { [EmploymentType[userData.employmentType].toLowerCase()]: {} }
      )
      .accounts({
        userProfile,
        programState,
        authority: userKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([userKeypair])
      .rpc();

    console.log('User registered:', tx);
    return tx;
  }

  /**
   * Update user profile
   */
  async updateUserProfile(
    userKeypair: Keypair,
    monthlyIncome?: number,
    employmentType?: EmploymentType
  ): Promise<string> {
    if (!this.program) {
      throw new Error('Program not initialized');
    }

    const [userProfile] = this.getUserProfilePDA(userKeypair.publicKey);

    const tx = await this.program.methods
      .updateUserProfile(
        monthlyIncome ? new BN(monthlyIncome) : null,
        employmentType
          ? { [EmploymentType[employmentType].toLowerCase()]: {} }
          : null
      )
      .accounts({
        userProfile,
        authority: userKeypair.publicKey,
      })
      .signers([userKeypair])
      .rpc();

    console.log('User profile updated:', tx);
    return tx;
  }

  /**
   * Create a loan for a user (admin only)
   */
  async createLoan(
    userPubkey: PublicKey,
    loanData: LoanData,
    currentLoanCount: number
  ): Promise<string> {
    if (!this.program || !this.adminKeypair) {
      throw new Error('Program or admin keypair not initialized');
    }

    const [userProfile] = this.getUserProfilePDA(userPubkey);
    const [loan] = this.getLoanPDA(userPubkey, currentLoanCount);
    const [programState] = this.getProgramStatePDA();

    const tx = await this.program.methods
      .createLoan(
        new BN(loanData.principalAmount),
        loanData.interestRate,
        loanData.tenureMonths,
        new BN(loanData.startTimestamp)
      )
      .accounts({
        userProfile,
        loan,
        programState,
        userAuthority: userPubkey,
        admin: this.adminKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([this.adminKeypair])
      .rpc();

    console.log('Loan created:', tx);
    return tx;
  }

  /**
   * Record a payment for an installment
   */
  async recordPayment(
    loanPubkey: PublicKey,
    userPubkey: PublicKey,
    paymentData: PaymentData,
    payer: Keypair
  ): Promise<string> {
    if (!this.program) {
      throw new Error('Program not initialized');
    }

    const [userProfile] = this.getUserProfilePDA(userPubkey);
    const [paymentRecord] = this.getPaymentRecordPDA(
      loanPubkey,
      paymentData.installmentNumber
    );

    const tx = await this.program.methods
      .recordPayment(
        paymentData.installmentNumber,
        new BN(paymentData.amount),
        paymentData.paymentHash
      )
      .accounts({
        loan: loanPubkey,
        userProfile,
        paymentRecord,
        user: userPubkey,
        payer: payer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([payer])
      .rpc();

    console.log('Payment recorded:', tx);
    return tx;
  }

  /**
   * Update risk score for a user (admin only)
   */
  async updateRiskScore(
    userPubkey: PublicKey,
    riskScore: number,
    riskLevel: RiskLevel,
    defaultProbability: number
  ): Promise<string> {
    if (!this.program || !this.adminKeypair) {
      throw new Error('Program or admin keypair not initialized');
    }

    const [userProfile] = this.getUserProfilePDA(userPubkey);
    const [riskProfile] = this.getRiskProfilePDA(userPubkey);

    const tx = await this.program.methods
      .updateRiskScore(
        riskScore,
        { [RiskLevel[riskLevel].toLowerCase()]: {} },
        defaultProbability
      )
      .accounts({
        userProfile,
        riskProfile,
        user: userPubkey,
        admin: this.adminKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([this.adminKeypair])
      .rpc();

    console.log('Risk score updated:', tx);
    return tx;
  }

  /**
   * Mark a loan as defaulted (admin only)
   */
  async markLoanDefaulted(loanPubkey: PublicKey, userPubkey: PublicKey): Promise<string> {
    if (!this.program || !this.adminKeypair) {
      throw new Error('Program or admin keypair not initialized');
    }

    const [userProfile] = this.getUserProfilePDA(userPubkey);

    const tx = await this.program.methods
      .markLoanDefaulted()
      .accounts({
        loan: loanPubkey,
        userProfile,
        admin: this.adminKeypair.publicKey,
      })
      .signers([this.adminKeypair])
      .rpc();

    console.log('Loan marked as defaulted:', tx);
    return tx;
  }

  /**
   * Mark a loan as completed
   */
  async markLoanCompleted(
    loanPubkey: PublicKey,
    userPubkey: PublicKey,
    authority: Keypair
  ): Promise<string> {
    if (!this.program) {
      throw new Error('Program not initialized');
    }

    const [userProfile] = this.getUserProfilePDA(userPubkey);

    const tx = await this.program.methods
      .markLoanCompleted()
      .accounts({
        loan: loanPubkey,
        userProfile,
        authority: authority.publicKey,
      })
      .signers([authority])
      .rpc();

    console.log('Loan marked as completed:', tx);
    return tx;
  }

  /**
   * Waive fine for an installment (admin only)
   */
  async waiveFine(
    loanPubkey: PublicKey,
    userPubkey: PublicKey,
    installmentNumber: number,
    waivedAmount: number
  ): Promise<string> {
    if (!this.program || !this.adminKeypair) {
      throw new Error('Program or admin keypair not initialized');
    }

    const [userProfile] = this.getUserProfilePDA(userPubkey);
    const [paymentRecord] = this.getPaymentRecordPDA(loanPubkey, installmentNumber);

    const tx = await this.program.methods
      .waiveFine(installmentNumber, new BN(waivedAmount))
      .accounts({
        loan: loanPubkey,
        userProfile,
        paymentRecord,
        admin: this.adminKeypair.publicKey,
      })
      .signers([this.adminKeypair])
      .rpc();

    console.log('Fine waived:', tx);
    return tx;
  }

  /**
   * Fetch user profile
   */
  async getUserProfile(userPubkey: PublicKey): Promise<any> {
    if (!this.program) {
      throw new Error('Program not initialized');
    }

    const [userProfilePDA] = this.getUserProfilePDA(userPubkey);
    const userProfile = await this.program.account.userProfile.fetch(userProfilePDA);
    return userProfile;
  }

  /**
   * Fetch loan details
   */
  async getLoan(loanPubkey: PublicKey): Promise<any> {
    if (!this.program) {
      throw new Error('Program not initialized');
    }

    const loan = await this.program.account.loan.fetch(loanPubkey);
    return loan;
  }

  /**
   * Fetch payment record
   */
  async getPaymentRecord(
    loanPubkey: PublicKey,
    installmentNumber: number
  ): Promise<any> {
    if (!this.program) {
      throw new Error('Program not initialized');
    }

    const [paymentRecordPDA] = this.getPaymentRecordPDA(loanPubkey, installmentNumber);
    const paymentRecord = await this.program.account.paymentRecord.fetch(paymentRecordPDA);
    return paymentRecord;
  }

  /**
   * Fetch risk profile
   */
  async getRiskProfile(userPubkey: PublicKey): Promise<any> {
    if (!this.program) {
      throw new Error('Program not initialized');
    }

    const [riskProfilePDA] = this.getRiskProfilePDA(userPubkey);
    const riskProfile = await this.program.account.riskProfile.fetch(riskProfilePDA);
    return riskProfile;
  }

  /**
   * Fetch program state
   */
  async getProgramState(): Promise<any> {
    if (!this.program) {
      throw new Error('Program not initialized');
    }

    const [programStatePDA] = this.getProgramStatePDA();
    const programState = await this.program.account.loanProgramState.fetch(programStatePDA);
    return programState;
  }

  /**
   * Get SOL balance
   */
  async getBalance(pubkey: PublicKey): Promise<number> {
    const balance = await this.connection.getBalance(pubkey);
    return balance / LAMPORTS_PER_SOL;
  }

  /**
   * Request airdrop (devnet/testnet only)
   */
  async requestAirdrop(pubkey: PublicKey, amount: number): Promise<string> {
    const signature = await this.connection.requestAirdrop(
      pubkey,
      amount * LAMPORTS_PER_SOL
    );
    await this.connection.confirmTransaction(signature);
    return signature;
  }
}
