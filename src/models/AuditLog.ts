// src/models/AuditLog.ts
import mongoose, { Schema, Document } from 'mongoose';

export enum AuditAction {
  USER_REGISTERED = 'USER_REGISTERED',
  USER_APPROVED = 'USER_APPROVED',
  USER_REJECTED = 'USER_REJECTED',
  USER_LOGIN = 'USER_LOGIN',
  USER_LOGOUT = 'USER_LOGOUT',
  USER_UPDATED = 'USER_UPDATED',
  LOAN_CREATED = 'LOAN_CREATED',
  LOAN_UPDATED = 'LOAN_UPDATED',
  LOAN_DEFAULTED = 'LOAN_DEFAULTED',
  LOAN_COMPLETED = 'LOAN_COMPLETED',
  INSTALLMENT_CREATED = 'INSTALLMENT_CREATED',
  INSTALLMENT_PAID = 'INSTALLMENT_PAID',
  INSTALLMENT_OVERDUE = 'INSTALLMENT_OVERDUE',
  PAYMENT_PROCESSED = 'PAYMENT_PROCESSED',
  RISK_PROFILE_CALCULATED = 'RISK_PROFILE_CALCULATED',
  ADMIN_ACTION = 'ADMIN_ACTION'
}

export interface IAuditLog extends Document {
  userId?: mongoose.Types.ObjectId;
  performedBy?: mongoose.Types.ObjectId;
  action: AuditAction;
  entity: string;
  entityId?: mongoose.Types.ObjectId;
  oldValue?: any;
  newValue?: any;
  ipAddress?: string;
  userAgent?: string;
  metadata?: any;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  
  performedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  
  action: {
    type: String,
    enum: Object.values(AuditAction),
    required: true,
    index: true
  },
  
  entity: {
    type: String,
    required: true,
    index: true
  },
  
  entityId: {
    type: Schema.Types.ObjectId,
    index: true
  },
  
  oldValue: Schema.Types.Mixed,
  
  newValue: Schema.Types.Mixed,
  
  ipAddress: String,
  
  userAgent: String,
  
  metadata: Schema.Types.Mixed
  
}, {
  timestamps: { createdAt: true, updatedAt: false }
});

// Indexes
AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ userId: 1, createdAt: -1 });
AuditLogSchema.index({ performedBy: 1, createdAt: -1 });
AuditLogSchema.index({ entity: 1, entityId: 1, createdAt: -1 });

export default mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
