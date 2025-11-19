import { Keypair, PublicKey } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import bs58 from 'bs58';

/**
 * Wallet Manager for handling Solana keypairs
 */
export class WalletManager {
  private walletsDir: string;

  constructor(walletsDir?: string) {
    this.walletsDir = walletsDir || path.join(os.homedir(), '.solana-loan-wallets');
    
    // Create wallets directory if it doesn't exist
    if (!fs.existsSync(this.walletsDir)) {
      fs.mkdirSync(this.walletsDir, { recursive: true });
    }
  }

  /**
   * Generate a new keypair
   */
  generateKeypair(): Keypair {
    return Keypair.generate();
  }

  /**
   * Save keypair to file
   */
  saveKeypair(keypair: Keypair, filename: string): string {
    const filepath = path.join(this.walletsDir, `${filename}.json`);
    const secretKeyArray = Array.from(keypair.secretKey);
    fs.writeFileSync(filepath, JSON.stringify(secretKeyArray, null, 2));
    console.log(`Keypair saved to: ${filepath}`);
    console.log(`Public key: ${keypair.publicKey.toBase58()}`);
    return filepath;
  }

  /**
   * Load keypair from file
   */
  loadKeypair(filename: string): Keypair {
    const filepath = path.join(this.walletsDir, `${filename}.json`);
    
    if (!fs.existsSync(filepath)) {
      throw new Error(`Keypair file not found: ${filepath}`);
    }

    const secretKeyArray = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    return Keypair.fromSecretKey(new Uint8Array(secretKeyArray));
  }

  /**
   * Load keypair from environment variable
   */
  loadKeypairFromEnv(envVarName: string = 'SOLANA_PRIVATE_KEY'): Keypair {
    const privateKey = process.env[envVarName];
    
    if (!privateKey) {
      throw new Error(`Environment variable ${envVarName} not set`);
    }

    try {
      // Try parsing as base58
      const secretKey = bs58.decode(privateKey);
      return Keypair.fromSecretKey(secretKey);
    } catch (error) {
      try {
        // Try parsing as JSON array
        const secretKey = JSON.parse(privateKey);
        return Keypair.fromSecretKey(new Uint8Array(secretKey));
      } catch (error2) {
        throw new Error('Invalid private key format. Expected base58 or JSON array.');
      }
    }
  }

  /**
   * Create a user wallet and save it with user ID
   */
  createUserWallet(userId: string): { keypair: Keypair; publicKey: string; filepath: string } {
    const keypair = this.generateKeypair();
    const filepath = this.saveKeypair(keypair, `user_${userId}`);
    
    return {
      keypair,
      publicKey: keypair.publicKey.toBase58(),
      filepath,
    };
  }

  /**
   * Load user wallet by user ID
   */
  loadUserWallet(userId: string): Keypair {
    return this.loadKeypair(`user_${userId}`);
  }

  /**
   * Check if user wallet exists
   */
  userWalletExists(userId: string): boolean {
    const filepath = path.join(this.walletsDir, `user_${userId}.json`);
    return fs.existsSync(filepath);
  }

  /**
   * Export public key as base58 string
   */
  exportPublicKey(keypair: Keypair): string {
    return keypair.publicKey.toBase58();
  }

  /**
   * Export private key as base58 string
   */
  exportPrivateKey(keypair: Keypair): string {
    return bs58.encode(keypair.secretKey);
  }

  /**
   * Get public key from base58 string
   */
  getPublicKey(publicKeyString: string): PublicKey {
    return new PublicKey(publicKeyString);
  }

  /**
   * List all saved wallets
   */
  listWallets(): string[] {
    const files = fs.readdirSync(this.walletsDir);
    return files
      .filter(file => file.endsWith('.json'))
      .map(file => file.replace('.json', ''));
  }

  /**
   * Delete wallet file
   */
  deleteWallet(filename: string): void {
    const filepath = path.join(this.walletsDir, `${filename}.json`);
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
      console.log(`Wallet deleted: ${filename}`);
    } else {
      throw new Error(`Wallet not found: ${filename}`);
    }
  }

  /**
   * Backup wallet to a different location
   */
  backupWallet(filename: string, backupPath: string): void {
    const filepath = path.join(this.walletsDir, `${filename}.json`);
    if (!fs.existsSync(filepath)) {
      throw new Error(`Wallet not found: ${filename}`);
    }

    fs.copyFileSync(filepath, backupPath);
    console.log(`Wallet backed up to: ${backupPath}`);
  }
}

/**
 * Database integration helper for storing Solana public keys
 */
export interface UserBlockchainData {
  userId: string;
  solanaPublicKey: string;
  registeredOnChain: boolean;
  registrationTxHash?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class BlockchainDatabaseHelper {
  /**
   * Create blockchain data entry for user
   */
  static createUserBlockchainData(
    userId: string,
    publicKey: string,
    txHash?: string
  ): UserBlockchainData {
    return {
      userId,
      solanaPublicKey: publicKey,
      registeredOnChain: !!txHash,
      registrationTxHash: txHash,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * MongoDB schema example (to be added to backend models)
   */
  static getMongooseSchema() {
    return `
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
  
  registrationTxHash: {
    type: String,
    sparse: true
  },
  
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
  }]
  
}, {
  timestamps: true
});

export default mongoose.model<IUserBlockchain>('UserBlockchain', UserBlockchainSchema);
`;
  }
}
