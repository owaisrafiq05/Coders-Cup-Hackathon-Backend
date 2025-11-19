"use strict";
// src/ai/geminiClient.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.geminiClient = void 0;
const generative_ai_1 = require("@google/generative-ai");
const logger_1 = __importDefault(require("../utils/logger"));
const MODEL_NAME = process.env.GEMINI_MODEL_NAME || 'gemini-2.5-flash-lite';
if (!process.env.GEMINI_API_KEY) {
    logger_1.default.warn('GEMINI_API_KEY is not set. Calls to geminiClient will fail until it is configured.');
}
const genAI = process.env.GEMINI_API_KEY
    ? new generative_ai_1.GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    : null;
class GeminiClient {
    /**
     * Generate structured content from a prompt and parse it as JSON.
     *
     * The prompt MUST instruct Gemini to respond with JSON ONLY.
     */
    async generateStructuredContent(prompt) {
        if (!genAI) {
            throw new Error('Gemini client not configured. Please set GEMINI_API_KEY in your environment.');
        }
        logger_1.default.info('Calling Gemini model', { model: MODEL_NAME });
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });
        const result = await model.generateContent({
            contents: [
                {
                    role: 'user',
                    parts: [{ text: prompt }],
                },
            ],
        });
        const text = result.response
            ?.candidates?.[0]
            ?.content?.parts
            ?.map((p) => ('text' in p ? p.text : ''))
            .join('') || '';
        const json = this.safeJsonParse(text);
        return json;
    }
    /**
     * Try to parse JSON robustly – strip code fences, extra text, etc.
     */
    safeJsonParse(raw) {
        const cleaned = raw.trim();
        // 1) Try direct JSON parse
        try {
            return JSON.parse(cleaned);
        }
        catch {
            // continue
        }
        // 2) Remove ```json ... ``` fences if present
        const fenceMatch = cleaned.match(/```json([\s\S]*?)```/i);
        if (fenceMatch && fenceMatch[1]) {
            const inner = fenceMatch[1].trim();
            try {
                return JSON.parse(inner);
            }
            catch {
                // continue
            }
        }
        // 3) Fallback: extract from first { to last }
        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            const slice = cleaned.slice(firstBrace, lastBrace + 1);
            try {
                return JSON.parse(slice);
            }
            catch {
                // continue
            }
        }
        logger_1.default.error('Failed to parse Gemini JSON response', { raw });
        throw new Error('Failed to parse Gemini JSON response');
    }
}
exports.geminiClient = new GeminiClient();
exports.default = exports.geminiClient;
