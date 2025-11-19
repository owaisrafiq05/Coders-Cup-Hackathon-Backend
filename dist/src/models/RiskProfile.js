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
exports.RiskLevel = void 0;
// src/models/RiskProfile.ts
const mongoose_1 = __importStar(require("mongoose"));
var RiskLevel;
(function (RiskLevel) {
    RiskLevel["LOW"] = "LOW";
    RiskLevel["MEDIUM"] = "MEDIUM";
    RiskLevel["HIGH"] = "HIGH";
})(RiskLevel || (exports.RiskLevel = RiskLevel = {}));
const RiskProfileSchema = new mongoose_1.Schema({
    userId: {
        type: mongoose_1.Schema.Types.ObjectId,
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
RiskProfileSchema.pre('save', function (next) {
    if (this.isModified('riskScore') || this.isModified('riskLevel')) {
        this.version += 1;
        this.lastCalculated = new Date();
    }
    next();
});
exports.default = mongoose_1.default.model('RiskProfile', RiskProfileSchema);
