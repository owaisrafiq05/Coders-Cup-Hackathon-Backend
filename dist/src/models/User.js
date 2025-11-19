"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmploymentType = exports.UserRole = exports.UserStatus = void 0;
// src/models/User.ts
const mongoose_1 = __importStar(require("mongoose"));
const bcrypt_1 = __importDefault(require("bcrypt"));
var UserStatus;
(function (UserStatus) {
    UserStatus["PENDING"] = "PENDING";
    UserStatus["APPROVED"] = "APPROVED";
    UserStatus["REJECTED"] = "REJECTED";
})(UserStatus || (exports.UserStatus = UserStatus = {}));
var UserRole;
(function (UserRole) {
    UserRole["USER"] = "USER";
    UserRole["ADMIN"] = "ADMIN";
})(UserRole || (exports.UserRole = UserRole = {}));
var EmploymentType;
(function (EmploymentType) {
    EmploymentType["SALARIED"] = "SALARIED";
    EmploymentType["SELF_EMPLOYED"] = "SELF_EMPLOYED";
    EmploymentType["BUSINESS_OWNER"] = "BUSINESS_OWNER";
    EmploymentType["DAILY_WAGE"] = "DAILY_WAGE";
    EmploymentType["UNEMPLOYED"] = "UNEMPLOYED";
})(EmploymentType || (exports.EmploymentType = EmploymentType = {}));
const UserSchema = new mongoose_1.Schema({
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
            validator: function (v) {
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
            validator: function (v) {
                return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
            },
            message: 'Invalid email format'
        }
    },
    passwordHash: {
        type: String,
        required: [true, 'Password is required'],
        select: false // Don't return in queries by default
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
        type: mongoose_1.Schema.Types.ObjectId,
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
UserSchema.virtual('cnic').get(function () {
    if (this.cnicNumber) {
        return this.cnicNumber;
    }
    return null;
});
// Pre-save hook: Hash password
UserSchema.pre('save', async function (next) {
    if (!this.isModified('passwordHash'))
        return next();
    try {
        const salt = await bcrypt_1.default.genSalt(12);
        this.passwordHash = await bcrypt_1.default.hash(this.passwordHash, salt);
        next();
    }
    catch (error) {
        next(error);
    }
});
// Method: Compare password
UserSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt_1.default.compare(candidatePassword, this.passwordHash);
};
// Method: Get anonymized profile for AI
UserSchema.methods.getAnonymizedProfile = function () {
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
function calculateAgeFromCNIC(cnic) {
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
function getAgeBracket(age) {
    if (age < 25)
        return '18-24';
    if (age < 35)
        return '25-34';
    if (age < 45)
        return '35-44';
    if (age < 55)
        return '45-54';
    return '55+';
}
function getIncomeRange(income) {
    if (income < 30000)
        return 'under-30k';
    if (income < 50000)
        return '30k-50k';
    if (income < 75000)
        return '50k-75k';
    if (income < 100000)
        return '75k-100k';
    return 'above-100k';
}
exports.default = mongoose_1.default.model('User', UserSchema);
