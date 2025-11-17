// src/models/RiskProfile.ts
import mongoose, { Schema, Document } from 'mongoose';

export enum RiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH'
}

export interface IRiskProfile extends Document {
  userId: mongoose.Types.ObjectId;
  riskLevel: RiskLevel;
  riskScore: number;          // 0-100
  riskReasons: string[];      // Human-readable explanations
  recommendedMaxLoan?: number;
  recommendedTenure?: number;
  defaultProbability?: number; // 0-1
  geminiResponse: {
    raw: string;
    model: string;
    tokensUsed: number;
    timestamp: Date;
  };
  lastCalculated: Date;
  version: number;             // Increments on recalculation
  createdAt: Date;
  updatedAt: Date;
}

const RiskProfileSchema = new Schema<IRiskProfile>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },
  
  riskLevel: {
    type: String,
    enum: Object.values(RiskLevel),
    required: true,
    index: true
  },
  
  riskScore: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  
  riskReasons: [{
    type: String
  }],
  
  recommendedMaxLoan: {
    type: Number,
    min: 0
  },
  
  recommendedTenure: {
    type: Number,
    min: 1,
    max: 60
  },
  
  defaultProbability: {
    type: Number,
    min: 0,
    max: 1
  },
  
  geminiResponse: {
    raw: { type: String, required: true },
    model: { type: String, required: true },
    tokensUsed: { type: Number },
    timestamp: { type: Date, default: Date.now }
  },
  
  lastCalculated: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  version: {
    type: Number,
    default: 1
  }
  
}, {
  timestamps: true
});

// Compound index for analytics
RiskProfileSchema.index({ riskLevel: 1, lastCalculated: -1 });

// Pre-save hook: Increment version
RiskProfileSchema.pre('save', function(next) {
  if (this.isModified('riskScore') || this.isModified('riskLevel')) {
    this.version += 1;
    this.lastCalculated = new Date();
  }
  next();
});

export default mongoose.model<IRiskProfile>('RiskProfile', RiskProfileSchema);
