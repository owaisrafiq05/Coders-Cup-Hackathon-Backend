// src/models/EmailLog.ts
import mongoose, { Schema, Document } from 'mongoose';

export enum EmailType {
  REGISTRATION_CONFIRMATION = 'REGISTRATION_CONFIRMATION',
  ACCOUNT_APPROVED = 'ACCOUNT_APPROVED',
  ACCOUNT_REJECTED = 'ACCOUNT_REJECTED',
  LOAN_CREATED = 'LOAN_CREATED',
  INSTALLMENT_REMINDER = 'INSTALLMENT_REMINDER',
  PAYMENT_CONFIRMATION = 'PAYMENT_CONFIRMATION',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  OVERDUE_NOTICE = 'OVERDUE_NOTICE',
  DEFAULT_NOTICE = 'DEFAULT_NOTICE',
  ADMIN_ALERT = 'ADMIN_ALERT',
  PASSWORD_RESET = 'PASSWORD_RESET',
  OTHER = 'OTHER'
}

export enum EmailStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
  BOUNCED = 'BOUNCED'
}

export interface IEmailLog extends Document {
  userId?: mongoose.Types.ObjectId;
  recipientEmail: string;
  emailType: EmailType;
  subject: string;
  body?: string;
  status: EmailStatus;
  provider: string;
  providerMessageId?: string;
  errorMessage?: string;
  metadata: {
    loanId?: mongoose.Types.ObjectId;
    installmentId?: mongoose.Types.ObjectId;
    [key: string]: any;
  };
  sentAt?: Date;
  openedAt?: Date;
  clickedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const EmailLogSchema = new Schema<IEmailLog>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  
  recipientEmail: {
    type: String,
    required: true,
    lowercase: true,
    index: true
  },
  
  emailType: {
    type: String,
    enum: Object.values(EmailType),
    required: true,
    index: true
  },
  
  subject: {
    type: String,
    required: true
  },
  
  body: String,
  
  status: {
    type: String,
    enum: Object.values(EmailStatus),
    default: EmailStatus.PENDING,
    index: true
  },
  
  provider: {
    type: String,
    required: true,
    default: 'sendgrid'
  },
  
  providerMessageId: String,
  
  errorMessage: String,
  
  metadata: {
    type: Schema.Types.Mixed,
    default: {}
  },
  
  sentAt: Date,
  
  openedAt: Date,
  
  clickedAt: Date
  
}, {
  timestamps: true
});

// Indexes
EmailLogSchema.index({ userId: 1, createdAt: -1 });
EmailLogSchema.index({ status: 1, createdAt: -1 });
EmailLogSchema.index({ emailType: 1, status: 1 });

export default mongoose.model<IEmailLog>('EmailLog', EmailLogSchema);
