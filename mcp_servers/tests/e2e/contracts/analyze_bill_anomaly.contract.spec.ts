/**
 * Tool Contract: analyze_bill_anomaly
 * Server: user-info-service (:18003)
 * Input:  { phone: string, month: string(YYYY-MM) }  (required: [phone, month])
 * Output: packages/shared-db/src/schemas/analyze_bill_anomaly.json
 */
import { describe, test, expect } from 'bun:test';

describe('analyze_bill_anomaly — required output fields', () => {
  test.skip('response has required: is_anomaly(bool), current_month(string), previous_month(string), current_total(number), previous_total(number), diff(number), change_ratio(number), primary_cause(string), causes(array), recommendation(string)', async () => {});
});

describe('analyze_bill_anomaly — enum fields', () => {
  test.skip('primary_cause is enum: data_overage|voice_overage|new_vas|unknown', async () => {});
});

describe('analyze_bill_anomaly — causes array items', () => {
  test.skip('each cause has type(string), item(string), current_amount(number), previous_amount(number), diff(number), recommendation(string)', async () => {});
});
