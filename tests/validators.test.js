import test from 'node:test';
import assert from 'node:assert';
import {
  resolveCountries,
  resolveAdStatus,
  resolveBudgetMode,
  resolveBudgetLevel,
  validateRow,
  ROW_STATUS
} from '../src/validators.js';

test('resolveCountries resolves Vietnamese names and codes', () => {
  assert.deepStrictEqual(resolveCountries('Việt Nam'), { codes: ['VN'], unknown: [] });
  assert.deepStrictEqual(resolveCountries('vn, us'), { codes: ['VN', 'US'], unknown: [] });
  assert.deepStrictEqual(resolveCountries('Thái Lan | vn'), { codes: ['TH', 'VN'], unknown: [] });
  assert.deepStrictEqual(resolveCountries('XYZ, Việt Nam'), { codes: ['VN'], unknown: ['XYZ'] });
});

test('resolveAdStatus resolves draft mode and strings correctly', () => {
  assert.strictEqual(resolveAdStatus('Bật', false), 'ACTIVE');
  assert.strictEqual(resolveAdStatus('active', false), 'ACTIVE');
  assert.strictEqual(resolveAdStatus('Tắt', false), 'PAUSED');
  assert.strictEqual(resolveAdStatus('Bật', true), 'PAUSED'); // Draft mode forces PAUSED
});

test('resolveBudgetMode resolves lifetime vs daily', () => {
  assert.strictEqual(resolveBudgetMode('Trọn đời'), 'lifetime');
  assert.strictEqual(resolveBudgetMode('Hàng ngày'), 'daily');
  assert.strictEqual(resolveBudgetMode('lifetime'), 'lifetime');
  assert.strictEqual(resolveBudgetMode('daily'), 'daily');
});

test('resolveBudgetLevel resolves campaign vs adset', () => {
  assert.strictEqual(resolveBudgetLevel('Chiến dịch'), 'campaign');
  assert.strictEqual(resolveBudgetLevel('CBO'), 'campaign');
  assert.strictEqual(resolveBudgetLevel('Nhóm'), 'adset');
  assert.strictEqual(resolveBudgetLevel('adset'), 'adset');
});

test('validateRow flags errors for missing required fields', () => {
  const row = {
    contentMode: 'NEW_CTA_CREATIVE',
    ctaHandling: 'AUTO',
    pageLink: '',
    postLink: '',
    campaignName: 'Campaign 1',
    adsetName: 'Adset 1',
    adName: 'Ad 1',
    campaignType: 'Tin nhắn',
    country: 'Việt Nam',
    budget: '500000',
    budgetMode: 'Hàng ngày',
    startDate: '24/06/2026',
    statusRaw: 'Bật'
  };

  const res = validateRow(row);
  assert.strictEqual(res.status, ROW_STATUS.MISSING);
  assert.strictEqual(res.errors.includes('Thiếu link bài viết'), true);
});

test('validateRow allows blank page field when post link is present', () => {
  const row = {
    contentMode: 'NEW_CTA_CREATIVE',
    ctaHandling: 'AUTO',
    pageLink: '',
    postLink: 'https://www.facebook.com/myPageName/posts/1234567890',
    campaignName: 'Campaign 1',
    adsetName: 'Adset 1',
    adName: 'Ad 1',
    campaignType: 'Tin nhắn',
    country: 'Việt Nam',
    budget: '500000',
    budgetMode: 'Hàng ngày',
    startDate: '24/06/2026',
    statusRaw: 'Bật',
    ctaLink: 'https://example.com'
  };

  const res = validateRow(row);
  assert.strictEqual(res.status, ROW_STATUS.VALID);
  assert.deepStrictEqual(res.errors, []);
});

test('validateRow passes valid rows', () => {
  const row = {
    contentMode: 'NEW_CTA_CREATIVE',
    ctaHandling: 'AUTO',
    pageLink: '123456789',
    postLink: '123456789_987654321',
    campaignName: 'Campaign 1',
    adsetName: 'Adset 1',
    adName: 'Ad 1',
    campaignType: 'Tin nhắn',
    country: 'Việt Nam',
    budget: '500000',
    budgetMode: 'Hàng ngày',
    startDate: '24/06/2026',
    statusRaw: 'Bật',
    ctaLink: 'https://example.com' // required for NEW_CTA_CREATIVE if ctype needs link (but messages is optional, though we add it anyway)
  };

  const res = validateRow(row);
  assert.strictEqual(res.status, ROW_STATUS.VALID);
  assert.strictEqual(res.errors.length, 0);
  assert.strictEqual(res.normalized.budget, 500000);
  assert.strictEqual(res.normalized.budgetMode, 'daily');
  assert.strictEqual(res.normalized.campaignType.objective, 'OUTCOME_ENGAGEMENT');
});

test('validateRow accepts minimal existing-post traffic rows', () => {
  const row = {
    pageLink: '123456789',
    postLink: '123456789_987654321',
    budget: '500000',
    startDate: '24/06/2026',
    endDate: '30/06/2026',
    budgetMode: 'Trọn đời'
  };

  const res = validateRow(row);
  assert.strictEqual(res.status, ROW_STATUS.VALID);
  assert.strictEqual(res.errors.length, 0);
  assert.strictEqual(res.normalized.contentMode, 'EXISTING_POST_STRICT');
  assert.strictEqual(res.normalized.campaignType.id, 'traffic');
  assert.strictEqual(res.normalized.countries[0], 'VN');
  assert.strictEqual(res.normalized.budgetMode, 'lifetime');
});

test('validateRow allows same-day short lifetime schedules when end time is later', () => {
  const row = {
    pageLink: '123456789',
    postLink: '123456789_987654321',
    budget: '500000',
    startDate: '24/06/2026',
    startTimeRaw: '08:00',
    endDate: '24/06/2026',
    endTimeRaw: '10:00',
    budgetMode: 'Trọn đời'
  };

  const res = validateRow(row);
  assert.strictEqual(res.status, ROW_STATUS.VALID);
  assert.deepStrictEqual(res.errors, []);
  assert.strictEqual(res.normalized.budgetMode, 'lifetime');
});

test('validateRow defaults same-day lifetime end date to end of day when end time is blank', () => {
  const row = {
    pageLink: '123456789',
    postLink: '123456789_987654321',
    budget: '500000',
    startDate: '24/06/2026',
    startTimeRaw: '08:00',
    endDate: '24/06/2026',
    budgetMode: 'Trọn đời'
  };

  const res = validateRow(row);
  assert.strictEqual(res.status, ROW_STATUS.VALID);
  assert.deepStrictEqual(res.errors, []);
  assert.match(res.normalized.endTime, /T23:59:00\.000Z$/);
});
