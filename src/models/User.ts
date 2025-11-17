// src/models/User.ts
import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcrypt';

export enum UserStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED'
}

export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN'
}

export enum EmploymentType {
  SALARIED = 'SALARIED',
  SELF_EMPLOYED = 'SELF_EMPLOYED',
  BUSINESS_OWNER = 'BUSINESS_OWNER',
  DAILY_WAGE = 'DAILY_WAGE',
  UNEMPLOYED = 'UNEMPLOYED'
}

export interface IUser extends Document {
  fullName: string;
  cnicNumber: string;           // Encrypted CNIC
  phone: string;
  email: string;
  passwordHash: string;
  address: string;
  city: string;
  province: string;
  monthlyIncome: number;
  employmentType: EmploymentType;
  employerName?: string;
  status: UserStatus;
  role: UserRole;
  approvedBy?: mongoose.Types.ObjectId;
  approvedAt?: Date;
  rejectionReason?: string;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  
  // Virtual fields
  cnic: string;
  
  // Methods
  comparePassword(candidatePassword: string): Promise<boolean>;
  getAnonymizedProfile(): object;
}

const UserSchema = new Schema<IUser>({
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true,
    minlength: [3, 'Name must be at least 3 characters'],
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  
  cnicNumber: {
    type: String,
    required: [true, 'CNIC is required'],
    unique: true,
    minlength: [13, 'CNIC must be 13 digits'],
    maxlength: [13, 'CNIC must be 13 digits']
  },
  
  phone: {
    type: String,
    required: [true, 'Phone is required'],
    unique: true,
    validate: {
      validator: function(v: string) {
        return /^(\+92|0)?3\d{9}$/.test(v);
      },
      message: 'Invalid Pakistani phone number'
    }
  },
  
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    validate: {
      validator: function(v: string) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      },
      message: 'Invalid email format'
    }
  },
  
  passwordHash: {
    type: String,
    required: [true, 'Password is required'],
    select: false  // Don't return in queries by default
  },
  
  address: {
    type: String,
    required: [true, 'Address is required'],
    maxlength: [500, 'Address too long']
  },
  
  city: {
    type: String,
    required: [true, 'City is required'],
    index: true
  },
  
  province: {
    type: String,
    required: [true, 'Province is required'],
    enum: ['Punjab', 'Sindh', 'KPK', 'Balochistan', 'Gilgit-Baltistan', 'AJK'],
    index: true
  },
  
  monthlyIncome: {
    type: Number,
    required: [true, 'Monthly income is required'],
    min: [0, 'Income cannot be negative']
  },
  
  employmentType: {
    type: String,
    required: [true, 'Employment type is required'],
    enum: Object.values(EmploymentType)
  },
  
  employerName: {
    type: String,
    trim: true
  },
  
  status: {
    type: String,
    enum: Object.values(UserStatus),
    default: UserStatus.PENDING,
    index: true
  },
  
  role: {
    type: String,
    enum: Object.values(UserRole),
    default: UserRole.USER,
    index: true
  },
  
  approvedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  
  approvedAt: Date,
  
  rejectionReason: String,
  
  lastLoginAt: Date
  
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
UserSchema.index({ email: 1, status: 1 });
UserSchema.index({ status: 1, createdAt: -1 });
UserSchema.index({ city: 1, province: 1 });

// Virtual for decrypted CNIC (use sparingly)
UserSchema.virtual('cnic').get(function() {
  if (this.cnicNumber) {
    return this.cnicNumber;
  }
  return null;
});

// Pre-save hook: Hash password
UserSchema.pre('save', async function(next) {
  if (!this.isModified('passwordHash')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
    next();
  } catch (error: any) {
    next(error);
  }
});

// Method: Compare password
UserSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

// Method: Get anonymized profile for AI
UserSchema.methods.getAnonymizedProfile = function() {
  const age = this.cnic ? calculateAgeFromCNIC(this.cnicNumber) : null;
  
  return {
    ageBracket: age ? getAgeBracket(age) : 'unknown',
    incomeRange: getIncomeRange(this.monthlyIncome),
    employmentType: this.employmentType,
    city: this.city,
    province: this.province,
    accountAge: Math.floor((Date.now() - this.createdAt.getTime()) / (1000 * 60 * 60 * 24))
  };
};

function calculateAgeFromCNIC(cnic: string): number {
  // Pakistani CNIC format: XXXXX-XXXXXXX-X
  // Positions 7-12 contain DDMMYY
  const dateStr = cnic.substring(6, 12);
  const day = parseInt(dateStr.substring(0, 2));
  const month = parseInt(dateStr.substring(2, 4)) - 1;
  let year = parseInt(dateStr.substring(4, 6));
  
  // Adjust for century
  year += (year > 30 ? 1900 : 2000);
  
  const birthDate = new Date(year, month, day);
  const age = Math.floor((Date.now() - birthDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
  
  return age;
}

function getAgeBracket(age: number): string {
  if (age < 25) return '18-24';
  if (age < 35) return '25-34';
  if (age < 45) return '35-44';
  if (age < 55) return '45-54';
  return '55+';
}

function getIncomeRange(income: number): string {
  if (income < 30000) return 'under-30k';
  if (income < 50000) return '30k-50k';
  if (income < 75000) return '50k-75k';
  if (income < 100000) return '75k-100k';
  return 'above-100k';
}

export default mongoose.model<IUser>('User', UserSchema);
