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
exports.EmailStatus = exports.EmailType = void 0;
// src/models/EmailLog.ts
const mongoose_1 = __importStar(require("mongoose"));
var EmailType;
(function (EmailType) {
    EmailType["REGISTRATION_CONFIRMATION"] = "REGISTRATION_CONFIRMATION";
    EmailType["ACCOUNT_APPROVED"] = "ACCOUNT_APPROVED";
    EmailType["ACCOUNT_REJECTED"] = "ACCOUNT_REJECTED";
    EmailType["LOAN_CREATED"] = "LOAN_CREATED";
    EmailType["INSTALLMENT_REMINDER"] = "INSTALLMENT_REMINDER";
    EmailType["PAYMENT_CONFIRMATION"] = "PAYMENT_CONFIRMATION";
    EmailType["PAYMENT_FAILED"] = "PAYMENT_FAILED";
    EmailType["OVERDUE_NOTICE"] = "OVERDUE_NOTICE";
    EmailType["DEFAULT_NOTICE"] = "DEFAULT_NOTICE";
    EmailType["ADMIN_ALERT"] = "ADMIN_ALERT";
    EmailType["PASSWORD_RESET"] = "PASSWORD_RESET";
    EmailType["OTHER"] = "OTHER";
})(EmailType || (exports.EmailType = EmailType = {}));
var EmailStatus;
(function (EmailStatus) {
    EmailStatus["PENDING"] = "PENDING";
    EmailStatus["SENT"] = "SENT";
    EmailStatus["FAILED"] = "FAILED";
    EmailStatus["BOUNCED"] = "BOUNCED";
})(EmailStatus || (exports.EmailStatus = EmailStatus = {}));
const EmailLogSchema = new mongoose_1.Schema({
    userId: {
        type: mongoose_1.Schema.Types.ObjectId,
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
        type: mongoose_1.Schema.Types.Mixed,
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
exports.default = mongoose_1.default.model('EmailLog', EmailLogSchema);
