// src/ai/dataAnonymizer.ts

import logger from '../utils/logger';

type AnyObject = Record<string, any>;

class DataAnonymizer {
  /**
   * Generic anonymizer for user-like objects.
   * Removes common PII keys if present.
   */
  anonymizeUser(profile: AnyObject): AnyObject {
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

    const clone: AnyObject = Array.isArray(profile) ? [] : {};

    for (const [key, value] of Object.entries(profile)) {
      if (forbiddenKeys.includes(key)) {
        // Drop this field
        continue;
      }

      if (value && typeof value === 'object') {
        clone[key] = this.anonymizeUser(value);
      } else {
        clone[key] = value;
      }
    }

    return clone;
  }

  /**
   * Optional helper if you ever pass raw request bodies to Gemini.
   */
  anonymizePayload(payload: AnyObject): AnyObject {
    logger.debug('Anonymizing payload before sending to Gemini');
    return this.anonymizeUser(payload);
  }
}

export const dataAnonymizer = new DataAnonymizer();
export default dataAnonymizer;
