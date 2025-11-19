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
Object.defineProperty(exports, "__esModule", { value: true });
exports.InstallmentStatus = void 0;
// src/models/Installment.ts
const mongoose_1 = __importStar(require("mongoose"));
var InstallmentStatus;
(function (InstallmentStatus) {
    InstallmentStatus["PENDING"] = "PENDING";
    InstallmentStatus["PAID"] = "PAID";
    InstallmentStatus["OVERDUE"] = "OVERDUE";
    InstallmentStatus["DEFAULTED"] = "DEFAULTED";
    InstallmentStatus["WAIVED"] = "WAIVED";
})(InstallmentStatus || (exports.InstallmentStatus = InstallmentStatus = {}));
const InstallmentSchema = new mongoose_1.Schema({
    loanId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Loan',
        required: true,
        index: true
    },
    userId: {
        type: mongoose_1.Schema.Types.ObjectId,
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
InstallmentSchema.pre('save', function (next) {
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
exports.default = mongoose_1.default.model('Installment', InstallmentSchema);
