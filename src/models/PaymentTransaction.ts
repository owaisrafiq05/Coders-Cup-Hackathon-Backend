// src/models/PaymentTransaction.ts
import mongoose, { Schema, Document } from 'mongoose';

export enum PaymentStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
  CANCELLED = 'CANCELLED'
}

export enum PaymentMethod {
  STRIPE_CARD = 'STRIPE_CARD',
  STRIPE_BANK = 'STRIPE_BANK',
  MANUAL = 'MANUAL',
  OTHER = 'OTHER'
}

export interface IPaymentTransaction extends Document {
  installmentId: mongoose.Types.ObjectId;
  loanId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  amount: number;
  currency: string;
  status: PaymentStatus;
  paymentMethod: PaymentMethod;
  stripePaymentIntentId?: string;
  stripeSessionId?: string;
  stripeChargeId?: string;
  stripeReceiptUrl?: string;
  failureReason?: string;
  refundReason?: string;
  refundedAmount?: number;
  refundedAt?: Date;
  metadata: {
    ipAddress?: string;
    userAgent?: string;
    [key: string]: any;
  };
  createdAt: Date;
  updatedAt: Date;
}

const PaymentTransactionSchema = new Schema<IPaymentTransaction>({
  installmentId: {
    type: Schema.Types.ObjectId,
    ref: 'Installment',
    required: true,
    index: true
  },
  
  loanId: {
    type: Schema.Types.ObjectId,
    ref: 'Loan',
    required: true,
    index: true
  },
  
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  
  currency: {
    type: String,
    required: true,
    default: 'PKR',
    uppercase: true
  },
  
  status: {
    type: String,
    enum: Object.values(PaymentStatus),
    default: PaymentStatus.PENDING,
    index: true
  },
  
  paymentMethod: {
    type: String,
    enum: Object.values(PaymentMethod),
    required: true
  },
  
  stripePaymentIntentId: {
    type: String,
    sparse: true,
    index: true
  },
  
  stripeSessionId: {
    type: String,
    sparse: true,
    index: true
  },
  
  stripeChargeId: String,
  
  stripeReceiptUrl: String,
  
  failureReason: String,
  
  refundReason: String,
  
  refundedAmount: {
    type: Number,
    min: 0
  },
  
  refundedAt: Date,
  
  metadata: {
    type: Schema.Types.Mixed,
    default: {}
  }
  
}, {
  timestamps: true
});

// Indexes
PaymentTransactionSchema.index({ userId: 1, createdAt: -1 });
PaymentTransactionSchema.index({ status: 1, createdAt: -1 });
PaymentTransactionSchema.index({ stripePaymentIntentId: 1 }, { sparse: true });

export default mongoose.model<IPaymentTransaction>('PaymentTransaction', PaymentTransactionSchema);
