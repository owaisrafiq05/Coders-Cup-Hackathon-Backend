import { SolanaBlockchainService, SolanaConfig, UserProfileData, LoanData, PaymentData, EmploymentType, RiskLevel } from './solana-service';
import { WalletManager } from './wallet-manager';
import { PublicKey, Keypair } from '@solana/web3.js';

/**
 * Integration service to connect traditional backend with Solana blockchain
 */
export class BlockchainIntegrationService {
  private solanaService: SolanaBlockchainService;
  private walletManager: WalletManager;
  private adminKeypair: Keypair | null = null;
  private initialized: boolean = false;

  constructor(config: SolanaConfig, walletsDir?: string) {
    this.solanaService = new SolanaBlockchainService(config);
    this.walletManager = new WalletManager(walletsDir);
  }

  /**
   * Initialize the service with admin wallet
   */
  async initialize(adminKeypair: Keypair): Promise<void> {
    this.adminKeypair = adminKeypair;
    await this.solanaService.initialize(adminKeypair);
    this.initialized = true;
    console.log('Blockchain integration service initialized');
  }

  /**
   * Register user on blockchain when they register on the platform
   */
  async registerUserOnChain(
    userId: string,
    userData: {
      fullName: string;
      monthlyIncome: number;
      employmentType: string;
    }
  ): Promise<{ publicKey: string; txHash: string }> {
    this.ensureInitialized();

    // Create or load user wallet
    let userKeypair: Keypair;
    if (this.walletManager.userWalletExists(userId)) {
      userKeypair = this.walletManager.loadUserWallet(userId);
    } else {
      const walletData = this.walletManager.createUserWallet(userId);
      userKeypair = walletData.keypair;
      
      // Airdrop some SOL for transactions (devnet/testnet only)
      try {
        await this.solanaService.requestAirdrop(userKeypair.publicKey, 1);
        console.log('Airdrop successful for user:', userId);
      } catch (error) {
        console.warn('Airdrop failed (might be mainnet):', error);
      }
    }

    // Map employment type
    const employmentTypeEnum = this.mapEmploymentType(userData.employmentType);

    // Register on blockchain
    const txHash = await this.solanaService.registerUser(userKeypair, {
      fullName: userData.fullName,
      monthlyIncome: userData.monthlyIncome * 1_000_000_000, // Convert to lamports
      employmentType: employmentTypeEnum,
    });

    return {
      publicKey: userKeypair.publicKey.toBase58(),
      txHash,
    };
  }

  /**
   * Create loan on blockchain when admin approves loan
   */
  async createLoanOnChain(
    userId: string,
    loanData: {
      principalAmount: number;
      interestRate: number;
      tenureMonths: number;
      startDate: Date;
    }
  ): Promise<{ loanAccount: string; txHash: string }> {
    this.ensureInitialized();

    // Load user wallet
    const userKeypair = this.walletManager.loadUserWallet(userId);
    
    // Get user's current loan count
    const userProfile = await this.solanaService.getUserProfile(userKeypair.publicKey);
    const loanCount = userProfile.totalLoans;

    // Create loan
    const txHash = await this.solanaService.createLoan(
      userKeypair.publicKey,
      {
        principalAmount: loanData.principalAmount * 1_000_000_000,
        interestRate: Math.round(loanData.interestRate * 100), // Convert to basis points
        tenureMonths: loanData.tenureMonths,
        startTimestamp: Math.floor(loanData.startDate.getTime() / 1000),
      },
      loanCount
    );

    // Get loan account address
    const [loanPDA] = this.solanaService.getLoanPDA(userKeypair.publicKey, loanCount);

    return {
      loanAccount: loanPDA.toBase58(),
      txHash,
    };
  }

  /**
   * Record payment on blockchain
   */
  async recordPaymentOnChain(
    userId: string,
    loanAccount: string,
    paymentData: {
      installmentNumber: number;
      amount: number;
      paymentHash: string;
    }
  ): Promise<{ paymentAccount: string; txHash: string }> {
    this.ensureInitialized();

    if (!this.adminKeypair) {
      throw new Error('Admin keypair not set');
    }

    const userKeypair = this.walletManager.loadUserWallet(userId);
    const loanPubkey = new PublicKey(loanAccount);

    const txHash = await this.solanaService.recordPayment(
      loanPubkey,
      userKeypair.publicKey,
      {
        installmentNumber: paymentData.installmentNumber,
        amount: paymentData.amount * 1_000_000_000,
        paymentHash: paymentData.paymentHash,
      },
      this.adminKeypair
    );

    const [paymentRecordPDA] = this.solanaService.getPaymentRecordPDA(
      loanPubkey,
      paymentData.installmentNumber
    );

    return {
      paymentAccount: paymentRecordPDA.toBase58(),
      txHash,
    };
  }

  /**
   * Update risk score on blockchain
   */
  async updateRiskScoreOnChain(
    userId: string,
    riskData: {
      riskScore: number;
      riskLevel: string;
      defaultProbability: number;
    }
  ): Promise<string> {
    this.ensureInitialized();

    const userKeypair = this.walletManager.loadUserWallet(userId);
    const riskLevelEnum = this.mapRiskLevel(riskData.riskLevel);

    const txHash = await this.solanaService.updateRiskScore(
      userKeypair.publicKey,
      Math.round(riskData.riskScore * 10), // Scale to 0-1000
      riskLevelEnum,
      Math.round(riskData.defaultProbability * 100) // Convert to basis points
    );

    return txHash;
  }

  /**
   * Mark loan as defaulted on blockchain
   */
  async markLoanDefaultedOnChain(userId: string, loanAccount: string): Promise<string> {
    this.ensureInitialized();

    const userKeypair = this.walletManager.loadUserWallet(userId);
    const loanPubkey = new PublicKey(loanAccount);

    const txHash = await this.solanaService.markLoanDefaulted(
      loanPubkey,
      userKeypair.publicKey
    );

    return txHash;
  }

  /**
   * Mark loan as completed on blockchain
   */
  async markLoanCompletedOnChain(userId: string, loanAccount: string): Promise<string> {
    this.ensureInitialized();

    if (!this.adminKeypair) {
      throw new Error('Admin keypair not set');
    }

    const userKeypair = this.walletManager.loadUserWallet(userId);
    const loanPubkey = new PublicKey(loanAccount);

    const txHash = await this.solanaService.markLoanCompleted(
      loanPubkey,
      userKeypair.publicKey,
      this.adminKeypair
    );

    return txHash;
  }

  /**
   * Waive fine on blockchain
   */
  async waiveFineOnChain(
    userId: string,
    loanAccount: string,
    installmentNumber: number,
    waivedAmount: number
  ): Promise<string> {
    this.ensureInitialized();

    const userKeypair = this.walletManager.loadUserWallet(userId);
    const loanPubkey = new PublicKey(loanAccount);

    const txHash = await this.solanaService.waiveFine(
      loanPubkey,
      userKeypair.publicKey,
      installmentNumber,
      waivedAmount * 1_000_000_000
    );

    return txHash;
  }

  /**
   * Get user profile from blockchain
   */
  async getUserProfileFromChain(userId: string): Promise<any> {
    this.ensureInitialized();

    const userKeypair = this.walletManager.loadUserWallet(userId);
    const userProfile = await this.solanaService.getUserProfile(userKeypair.publicKey);

    return {
      fullName: userProfile.fullName,
      monthlyIncome: userProfile.monthlyIncome.toNumber() / 1_000_000_000,
      employmentType: this.formatEmploymentType(userProfile.employmentType),
      totalLoans: userProfile.totalLoans,
      activeLoans: userProfile.activeLoans,
      completedLoans: userProfile.completedLoans,
      defaultedLoans: userProfile.defaultedLoans,
      totalBorrowed: userProfile.totalBorrowed.toNumber() / 1_000_000_000,
      totalRepaid: userProfile.totalRepaid.toNumber() / 1_000_000_000,
      onTimePayments: userProfile.onTimePayments,
      latePayments: userProfile.latePayments,
      missedPayments: userProfile.missedPayments,
      creditScore: userProfile.creditScore,
      riskLevel: this.formatRiskLevel(userProfile.riskLevel),
      registrationTimestamp: new Date(userProfile.registrationTimestamp.toNumber() * 1000),
      lastUpdated: new Date(userProfile.lastUpdated.toNumber() * 1000),
    };
  }

  /**
   * Get loan from blockchain
   */
  async getLoanFromChain(loanAccount: string): Promise<any> {
    this.ensureInitialized();

    const loanPubkey = new PublicKey(loanAccount);
    const loan = await this.solanaService.getLoan(loanPubkey);

    return {
      user: loan.user.toBase58(),
      loanId: loan.loanId.toNumber(),
      principalAmount: loan.principalAmount.toNumber() / 1_000_000_000,
      interestRate: loan.interestRate / 100,
      tenureMonths: loan.tenureMonths,
      monthlyInstallment: loan.monthlyInstallment.toNumber() / 1_000_000_000,
      totalAmount: loan.totalAmount.toNumber() / 1_000_000_000,
      outstandingBalance: loan.outstandingBalance.toNumber() / 1_000_000_000,
      totalRepaid: loan.totalRepaid.toNumber() / 1_000_000_000,
      totalFines: loan.totalFines.toNumber() / 1_000_000_000,
      startTimestamp: new Date(loan.startTimestamp.toNumber() * 1000),
      endTimestamp: new Date(loan.endTimestamp.toNumber() * 1000),
      status: this.formatLoanStatus(loan.status),
      createdTimestamp: new Date(loan.createdTimestamp.toNumber() * 1000),
    };
  }

  /**
   * Get risk profile from blockchain
   */
  async getRiskProfileFromChain(userId: string): Promise<any> {
    this.ensureInitialized();

    const userKeypair = this.walletManager.loadUserWallet(userId);
    const riskProfile = await this.solanaService.getRiskProfile(userKeypair.publicKey);

    return {
      riskScore: riskProfile.riskScore / 10,
      riskLevel: this.formatRiskLevel(riskProfile.riskLevel),
      defaultProbability: riskProfile.defaultProbability / 100,
      recommendedMaxLoan: riskProfile.recommendedMaxLoan.toNumber() / 1_000_000_000,
      lastCalculated: new Date(riskProfile.lastCalculated.toNumber() * 1000),
    };
  }

  /**
   * Helper methods
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('BlockchainIntegrationService not initialized. Call initialize() first.');
    }
  }

  private mapEmploymentType(employmentType: string): EmploymentType {
    const mapping: { [key: string]: EmploymentType } = {
      SALARIED: EmploymentType.Salaried,
      SELF_EMPLOYED: EmploymentType.SelfEmployed,
      BUSINESS_OWNER: EmploymentType.BusinessOwner,
      DAILY_WAGE: EmploymentType.DailyWage,
      UNEMPLOYED: EmploymentType.Unemployed,
    };
    return mapping[employmentType] || EmploymentType.Salaried;
  }

  private mapRiskLevel(riskLevel: string): RiskLevel {
    const mapping: { [key: string]: RiskLevel } = {
      LOW: RiskLevel.Low,
      MEDIUM: RiskLevel.Medium,
      HIGH: RiskLevel.High,
      CRITICAL: RiskLevel.Critical,
    };
    return mapping[riskLevel] || RiskLevel.Medium;
  }

  private formatEmploymentType(employmentType: any): string {
    if (employmentType.salaried) return 'SALARIED';
    if (employmentType.selfEmployed) return 'SELF_EMPLOYED';
    if (employmentType.businessOwner) return 'BUSINESS_OWNER';
    if (employmentType.dailyWage) return 'DAILY_WAGE';
    if (employmentType.unemployed) return 'UNEMPLOYED';
    return 'UNKNOWN';
  }

  private formatRiskLevel(riskLevel: any): string {
    if (riskLevel.low) return 'LOW';
    if (riskLevel.medium) return 'MEDIUM';
    if (riskLevel.high) return 'HIGH';
    if (riskLevel.critical) return 'CRITICAL';
    return 'UNKNOWN';
  }

  private formatLoanStatus(status: any): string {
    if (status.active) return 'ACTIVE';
    if (status.completed) return 'COMPLETED';
    if (status.defaulted) return 'DEFAULTED';
    if (status.cancelled) return 'CANCELLED';
    return 'UNKNOWN';
  }

  /**
   * Get user's Solana public key
   */
  getUserPublicKey(userId: string): string {
    const userKeypair = this.walletManager.loadUserWallet(userId);
    return userKeypair.publicKey.toBase58();
  }

  /**
   * Check if user is registered on chain
   */
  async isUserRegisteredOnChain(userId: string): Promise<boolean> {
    try {
      if (!this.walletManager.userWalletExists(userId)) {
        return false;
      }
      const userKeypair = this.walletManager.loadUserWallet(userId);
      await this.solanaService.getUserProfile(userKeypair.publicKey);
      return true;
    } catch (error) {
      return false;
    }
  }
}

export * from './solana-service';
export * from './wallet-manager';
