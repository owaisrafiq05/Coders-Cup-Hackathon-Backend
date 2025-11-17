// src/models/Installment.ts
import mongoose, { Schema, Document } from 'mongoose';

export enum InstallmentStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  DEFAULTED = 'DEFAULTED',
  WAIVED = 'WAIVED'
}

export interface IInstallment extends Document {
  loanId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  installmentNumber: number;
  amount: number;
  fineAmount: number;
  totalDue: number;
  dueDate: Date;
  paidDate?: Date;
  status: InstallmentStatus;
  stripeSessionId?: string;
  stripePaymentIntentId?: string;
  gracePeriodDays: number;
  gracePeriodEndDate: Date;
  daysOverdue: number;
  remindersSent: number;
  lastReminderSent?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const InstallmentSchema = new Schema<IInstallment>({
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
  
  installmentNumber: {
    type: Number,
    required: true,
    min: 1
  },
  
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  
  fineAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  
  totalDue: {
    type: Number,
    required: true
  },
  
  dueDate: {
    type: Date,
    required: true,
    index: true
  },
  
  paidDate: Date,
  
  status: {
    type: String,
    enum: Object.values(InstallmentStatus),
    default: InstallmentStatus.PENDING,
    index: true
  },
  
  stripeSessionId: {
    type: String,
    sparse: true,
    index: true
  },
  
  stripePaymentIntentId: {
    type: String,
    sparse: true
  },
  
  gracePeriodDays: {
    type: Number,
    default: 2
  },
  
  gracePeriodEndDate: {
    type: Date,
    required: true
  },
  
  daysOverdue: {
    type: Number,
    default: 0,
    min: 0
  },
  
  remindersSent: {
    type: Number,
    default: 0
  },
  
  lastReminderSent: Date,
  
  notes: String
  
}, {
  timestamps: true
});

// Indexes
InstallmentSchema.index({ loanId: 1, installmentNumber: 1 }, { unique: true });
InstallmentSchema.index({ userId: 1, status: 1 });
InstallmentSchema.index({ status: 1, dueDate: 1 });
InstallmentSchema.index({ dueDate: 1, status: 1 });

// Pre-save hook: Calculate total due and grace period
InstallmentSchema.pre('save', function(next) {
  this.totalDue = this.amount + this.fineAmount;
  
  if (this.isNew) {
    const gracePeriodEnd = new Date(this.dueDate);
    gracePeriodEnd.setDate(gracePeriodEnd.getDate() + this.gracePeriodDays);
    this.gracePeriodEndDate = gracePeriodEnd;
  }
  
  // Calculate days overdue
  if (this.status !== InstallmentStatus.PAID && this.status !== InstallmentStatus.WAIVED) {
    const now = new Date();
    if (now > this.gracePeriodEndDate) {
      this.daysOverdue = Math.floor((now.getTime() - this.gracePeriodEndDate.getTime()) / (1000 * 60 * 60 * 24));
    }
  }
  
  next();
});

export default mongoose.model<IInstallment>('Installment', InstallmentSchema);
