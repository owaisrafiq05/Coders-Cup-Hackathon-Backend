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
exports.AuditAction = void 0;
// src/models/AuditLog.ts
const mongoose_1 = __importStar(require("mongoose"));
var AuditAction;
(function (AuditAction) {
    AuditAction["USER_REGISTERED"] = "USER_REGISTERED";
    AuditAction["USER_APPROVED"] = "USER_APPROVED";
    AuditAction["USER_REJECTED"] = "USER_REJECTED";
    AuditAction["USER_LOGIN"] = "USER_LOGIN";
    AuditAction["USER_LOGOUT"] = "USER_LOGOUT";
    AuditAction["USER_UPDATED"] = "USER_UPDATED";
    AuditAction["LOAN_CREATED"] = "LOAN_CREATED";
    AuditAction["LOAN_UPDATED"] = "LOAN_UPDATED";
    AuditAction["LOAN_DEFAULTED"] = "LOAN_DEFAULTED";
    AuditAction["LOAN_COMPLETED"] = "LOAN_COMPLETED";
    AuditAction["INSTALLMENT_CREATED"] = "INSTALLMENT_CREATED";
    AuditAction["INSTALLMENT_PAID"] = "INSTALLMENT_PAID";
    AuditAction["INSTALLMENT_OVERDUE"] = "INSTALLMENT_OVERDUE";
    AuditAction["PAYMENT_PROCESSED"] = "PAYMENT_PROCESSED";
    AuditAction["RISK_PROFILE_CALCULATED"] = "RISK_PROFILE_CALCULATED";
    AuditAction["ADMIN_ACTION"] = "ADMIN_ACTION";
})(AuditAction || (exports.AuditAction = AuditAction = {}));
const AuditLogSchema = new mongoose_1.Schema({
    userId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        index: true
    },
    performedBy: {
        type: mongoose_1.Schema.Types.ObjectId,
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
        type: mongoose_1.Schema.Types.ObjectId,
        index: true
    },
    oldValue: mongoose_1.Schema.Types.Mixed,
    newValue: mongoose_1.Schema.Types.Mixed,
    ipAddress: String,
    userAgent: String,
    metadata: mongoose_1.Schema.Types.Mixed
}, {
    timestamps: { createdAt: true, updatedAt: false }
});
// Indexes
AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ userId: 1, createdAt: -1 });
AuditLogSchema.index({ performedBy: 1, createdAt: -1 });
AuditLogSchema.index({ entity: 1, entityId: 1, createdAt: -1 });
exports.default = mongoose_1.default.model('AuditLog', AuditLogSchema);
