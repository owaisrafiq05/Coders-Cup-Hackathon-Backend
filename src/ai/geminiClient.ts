// src/ai/geminiClient.ts

import { GoogleGenerativeAI } from '@google/generative-ai';
import logger from '../utils/logger';

const MODEL_NAME = process.env.GEMINI_MODEL_NAME || 'gemini-1.5-flash';

if (!process.env.GEMINI_API_KEY) {
  logger.warn(
    'GEMINI_API_KEY is not set. Calls to geminiClient will fail until it is configured.',
  );
}

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

class GeminiClient {
  /**
   * Generate structured content from a prompt and parse it as JSON.
   *
   * The prompt MUST instruct Gemini to respond with JSON ONLY.
   */
  async generateStructuredContent<T>(prompt: string): Promise<T> {
    if (!genAI) {
      throw new Error(
        'Gemini client not configured. Please set GEMINI_API_KEY in your environment.',
      );
    }

    logger.info('Calling Gemini model', { model: MODEL_NAME });

    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    const result = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
    });

    const text =
      result.response
        ?.candidates?.[0]
        ?.content?.parts
        ?.map((p) => ('text' in p ? p.text : ''))
        .join('') || '';

    const json = this.safeJsonParse<T>(text);

    return json;
  }

  /**
   * Try to parse JSON robustly – strip code fences, extra text, etc.
   */
  private safeJsonParse<T>(raw: string): T {
    const cleaned = raw.trim();

    // 1) Try direct JSON parse
    try {
      return JSON.parse(cleaned) as T;
    } catch {
      // continue
    }

    // 2) Remove ```json ... ``` fences if present
    const fenceMatch = cleaned.match(/```json([\s\S]*?)```/i);
    if (fenceMatch && fenceMatch[1]) {
      const inner = fenceMatch[1].trim();
      try {
        return JSON.parse(inner) as T;
      } catch {
        // continue
      }
    }

    // 3) Fallback: extract from first { to last }
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const slice = cleaned.slice(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(slice) as T;
      } catch {
        // continue
      }
    }

    logger.error('Failed to parse Gemini JSON response', { raw });
    throw new Error('Failed to parse Gemini JSON response');
  }
}

export const geminiClient = new GeminiClient();
export default geminiClient;
