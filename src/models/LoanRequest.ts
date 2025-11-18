// src/models/LoanRequest.ts
import mongoose, { Schema, Document } from 'mongoose';

export enum LoanRequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED'
}

export interface ILoanRequest extends Document {
  userId: mongoose.Types.ObjectId;
  requestedAmount: number;
  requestedTenure: number;
  purpose?: string;
  status: LoanRequestStatus;
  rejectionReason?: string;
  approvedBy?: mongoose.Types.ObjectId;
  approvedAt?: Date;
  rejectedAt?: Date;
  loanId?: mongoose.Types.ObjectId; // Reference to created loan if approved
  createdAt: Date;
  updatedAt: Date;
}

const LoanRequestSchema = new Schema<ILoanRequest>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  requestedAmount: {
    type: Number,
    required: [true, 'Requested amount is required'],
    min: [5000, 'Minimum loan amount is PKR 5,000'],
    max: [500000, 'Maximum loan amount is PKR 500,000']
  },
  
  requestedTenure: {
    type: Number,
    required: [true, 'Requested tenure is required'],
    min: [3, 'Minimum tenure is 3 months'],
    max: [60, 'Maximum tenure is 60 months']
  },
  
  purpose: {
    type: String,
    maxlength: 500,
    trim: true
  },
  
  status: {
    type: String,
    enum: Object.values(LoanRequestStatus),
    default: LoanRequestStatus.PENDING,
    index: true
  },
  
  rejectionReason: {
    type: String,
    maxlength: 1000
  },
  
  approvedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  
  approvedAt: Date,
  
  rejectedAt: Date,
  
  loanId: {
    type: Schema.Types.ObjectId,
    ref: 'Loan'
  }
  
}, {
  timestamps: true
});

// Indexes
LoanRequestSchema.index({ userId: 1, status: 1 });
LoanRequestSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model<ILoanRequest>('LoanRequest', LoanRequestSchema);
