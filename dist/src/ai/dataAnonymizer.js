"use strict";
// src/ai/dataAnonymizer.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dataAnonymizer = void 0;
const logger_1 = __importDefault(require("../utils/logger"));
class DataAnonymizer {
    /**
     * Generic anonymizer for user-like objects.
     * Removes common PII keys if present.
     */
    anonymizeUser(profile) {
        if (!profile || typeof profile !== 'object') {
            return profile;
        }
        const forbiddenKeys = [
            'fullName',
            'name',
            'email',
            'phone',
            'cnic',
            'cnicNumber',
            'address',
        ];
        const clone = Array.isArray(profile) ? [] : {};
        for (const [key, value] of Object.entries(profile)) {
            if (forbiddenKeys.includes(key)) {
                // Drop this field
                continue;
            }
            if (value && typeof value === 'object') {
                clone[key] = this.anonymizeUser(value);
            }
            else {
                clone[key] = value;
            }
        }
        return clone;
    }
    /**
     * Optional helper if you ever pass raw request bodies to Gemini.
     */
    anonymizePayload(payload) {
        logger_1.default.debug('Anonymizing payload before sending to Gemini');
        return this.anonymizeUser(payload);
    }
}
exports.dataAnonymizer = new DataAnonymizer();
exports.default = exports.dataAnonymizer;
