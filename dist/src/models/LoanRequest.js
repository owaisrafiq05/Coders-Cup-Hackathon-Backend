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
exports.LoanRequestStatus = void 0;
// src/models/LoanRequest.ts
const mongoose_1 = __importStar(require("mongoose"));
var LoanRequestStatus;
(function (LoanRequestStatus) {
    LoanRequestStatus["PENDING"] = "PENDING";
    LoanRequestStatus["APPROVED"] = "APPROVED";
    LoanRequestStatus["REJECTED"] = "REJECTED";
    LoanRequestStatus["CANCELLED"] = "CANCELLED";
})(LoanRequestStatus || (exports.LoanRequestStatus = LoanRequestStatus = {}));
const LoanRequestSchema = new mongoose_1.Schema({
    userId: {
        type: mongoose_1.Schema.Types.ObjectId,
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
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User'
    },
    approvedAt: Date,
    rejectedAt: Date,
    loanId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Loan'
    }
}, {
    timestamps: true
});
// Indexes
LoanRequestSchema.index({ userId: 1, status: 1 });
LoanRequestSchema.index({ status: 1, createdAt: -1 });
exports.default = mongoose_1.default.model('LoanRequest', LoanRequestSchema);
