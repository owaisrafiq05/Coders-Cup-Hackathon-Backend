// src/models/Loan.ts
import mongoose, { Schema, Document } from 'mongoose';

export enum LoanStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  DEFAULTED = 'DEFAULTED',
  CANCELLED = 'CANCELLED'
}

export interface IInstallmentSchedule {
  month: number;
  dueDate: Date;
  amount: number;
}

export interface ILoan extends Document {
  userId: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  principalAmount: number;
  interestRate: number;        // Annual percentage
  tenureMonths: number;
  monthlyInstallment: number;
  totalAmount: number;         // Principal + Interest
  outstandingBalance: number;
  totalRepaid: number;
  totalFines: number;
  startDate: Date;
  endDate: Date;
  status: LoanStatus;
  installmentSchedule: IInstallmentSchedule[];
  defaultedAt?: Date;
  completedAt?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const LoanSchema = new Schema<ILoan>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  principalAmount: {
    type: Number,
    required: [true, 'Principal amount is required'],
    min: [5000, 'Minimum loan amount is PKR 5,000'],
    max: [500000, 'Maximum loan amount is PKR 500,000']
  },
  
  interestRate: {
    type: Number,
    required: [true, 'Interest rate is required'],
    min: [0, 'Interest rate cannot be negative'],
    max: [30, 'Interest rate cannot exceed 30%']
  },
  
  tenureMonths: {
    type: Number,
    required: [true, 'Tenure is required'],
    min: [3, 'Minimum tenure is 3 months'],
    max: [60, 'Maximum tenure is 60 months']
  },
  
  monthlyInstallment: {
    type: Number,
    required: true
  },
  
  totalAmount: {
    type: Number,
    required: true
  },
  
  outstandingBalance: {
    type: Number,
    required: true
  },
  
  totalRepaid: {
    type: Number,
    default: 0,
    min: 0
  },
  
  totalFines: {
    type: Number,
    default: 0,
    min: 0
  },
  
  startDate: {
    type: Date,
    required: true,
    index: true
  },
  
  endDate: {
    type: Date,
    required: true
  },
  
  status: {
    type: String,
    enum: Object.values(LoanStatus),
    default: LoanStatus.ACTIVE,
    index: true
  },
  
  installmentSchedule: [{
    month: { type: Number, required: true },
    dueDate: { type: Date, required: true },
    amount: { type: Number, required: true }
  }],
  
  defaultedAt: Date,
  
  completedAt: Date,
  
  notes: {
    type: String,
    maxlength: 1000
  }
  
}, {
  timestamps: true
});

// Indexes
LoanSchema.index({ userId: 1, status: 1 });
LoanSchema.index({ status: 1, startDate: -1 });
LoanSchema.index({ createdBy: 1, createdAt: -1 });

// Pre-save hook: Calculate loan details
LoanSchema.pre('save', function(next) {
  if (this.isNew || this.isModified('principalAmount') || this.isModified('interestRate') || this.isModified('tenureMonths')) {
    // Calculate monthly installment using reducing balance method
    const monthlyRate = this.interestRate / 12 / 100;
    const n = this.tenureMonths;
    
    if (monthlyRate === 0) {
      this.monthlyInstallment = this.principalAmount / n;
    } else {
      this.monthlyInstallment = (this.principalAmount * monthlyRate * Math.pow(1 + monthlyRate, n)) / 
                                  (Math.pow(1 + monthlyRate, n) - 1);
    }
    
    this.monthlyInstallment = Math.round(this.monthlyInstallment);
    this.totalAmount = this.monthlyInstallment * n;
    
    if (this.isNew) {
      this.outstandingBalance = this.totalAmount;
      
      // Generate installment schedule
      this.installmentSchedule = [];
      const startDate = new Date(this.startDate);
      
      for (let i = 1; i <= n; i++) {
        const dueDate = new Date(startDate);
        dueDate.setMonth(dueDate.getMonth() + i);
        
        this.installmentSchedule.push({
          month: i,
          dueDate: dueDate,
          amount: this.monthlyInstallment
        });
      }
      
      // Set end date
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + n);
      this.endDate = endDate;
    }
  }
  
  next();
});

export default mongoose.model<ILoan>('Loan', LoanSchema);
