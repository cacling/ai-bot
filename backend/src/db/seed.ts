/**
 * seed.ts — 初始化电信业务数据
 *
 * 将模拟数据写入 SQLite 数据库。
 * 运行方式：bun run db:seed
 *
 * 幂等设计：先清空再插入，可重复执行。
 */

import { db } from './index';
import {
  bills,
  mockUsers,
  outboundTasks,
  plans,
  subscriberSubscriptions,
  subscribers,
  valueAddedServices,
} from './schema';

/** 返回最近 n 个月的 YYYY-MM 字符串，[0] 为最近月，[1] 为上月，依此类推 */
function recentMonths(n: number): string[] {
  const result: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    result.push(month);
  }
  return result;
}

async function seed() {
  console.log('[seed] 开始初始化数据...');

  // ── 1. 套餐 ─────────────────────────────────────────────────────────────────
  console.log('[seed] 写入套餐数据...');
  db.delete(plans).run();
  db.insert(plans).values([
    {
      plan_id: 'plan_10g',
      name: '基础 10G 套餐',
      monthly_fee: 30,
      data_gb: 10,
      voice_min: 200,
      sms: 50,
      features: JSON.stringify(['免费来电显示', '语音信箱']),
      description: '适合轻度用户，满足日常通话与基础上网需求',
    },
    {
      plan_id: 'plan_50g',
      name: '畅享 50G 套餐',
      monthly_fee: 50,
      data_gb: 50,
      voice_min: 500,
      sms: 100,
      features: JSON.stringify(['免费来电显示', '语音信箱', 'WiFi 热点共享']),
      description: '主流套餐，适合中度用户，流量充足，通话自由',
    },
    {
      plan_id: 'plan_100g',
      name: '超值 100G 套餐',
      monthly_fee: 88,
      data_gb: 100,
      voice_min: 1000,
      sms: 200,
      features: JSON.stringify(['免费来电显示', '语音信箱', 'WiFi 热点共享', '国内漫游免费']),
      description: '大流量套餐，适合重度用户或经常出差人员',
    },
    {
      plan_id: 'plan_unlimited',
      name: '无限流量套餐',
      monthly_fee: 128,
      data_gb: -1,
      voice_min: -1,
      sms: -1,
      features: JSON.stringify(['免费来电显示', '语音信箱', 'WiFi 热点共享', '国内漫游免费', '视频会员权益']),
      description: '旗舰无限套餐，流量/通话/短信不限量，畅享无忧',
    },
  ]).run();

  // ── 2. 增值业务 ──────────────────────────────────────────────────────────────
  console.log('[seed] 写入增值业务数据...');
  db.delete(valueAddedServices).run();
  db.insert(valueAddedServices).values([
    { service_id: 'video_pkg', name: '视频会员流量包（20GB/月）', monthly_fee: 20, effective_end: '次月1日00:00' },
    { service_id: 'sms_100', name: '短信百条包（100条/月）', monthly_fee: 5, effective_end: '次月1日00:00' },
    { service_id: 'roaming_pkg', name: '国内漫游免费包', monthly_fee: 10, effective_end: '次月1日00:00' },
    { service_id: 'game_pkg', name: '游戏加速包（10GB/月）', monthly_fee: 15, effective_end: '次月1日00:00' },
  ]).run();

  // ── 3. 用户（依赖套餐）──────────────────────────────────────────────────────
  console.log('[seed] 写入用户数据...');
  db.delete(subscriberSubscriptions).run();
  db.delete(subscribers).run();
  db.insert(subscribers).values([
    {
      phone: '13800000001',
      name: '张三',
      id_type: '居民身份证',
      plan_id: 'plan_50g',
      status: 'active',
      balance: 45.8,
      data_used_gb: 32.5,
      voice_used_min: 280,
      activated_at: '2023-06-15',
    },
    {
      phone: '13800000002',
      name: '李四',
      id_type: '居民身份证',
      plan_id: 'plan_unlimited',
      status: 'active',
      balance: 128.0,
      data_used_gb: 89.2,
      voice_used_min: 0,
      activated_at: '2022-11-01',
    },
    {
      phone: '13800000003',
      name: '王五',
      id_type: '居民身份证',
      plan_id: 'plan_10g',
      status: 'suspended',
      balance: -23.5,
      data_used_gb: 10,
      voice_used_min: 200,
      activated_at: '2024-01-20',
    },
  ]).run();

  // ── 4. 用户已订增值业务 ──────────────────────────────────────────────────────
  console.log('[seed] 写入用户订阅关系...');
  db.insert(subscriberSubscriptions).values([
    { phone: '13800000001', service_id: 'video_pkg' },
    { phone: '13800000001', service_id: 'sms_100' },
    { phone: '13800000002', service_id: 'video_pkg' },
  ]).run();

  // ── 5. 账单（依赖用户）──────────────────────────────────────────────────────
  console.log('[seed] 写入账单数据...');
  const [m0, m1, m2] = recentMonths(3); // m0=本月, m1=上月, m2=上上月
  console.log(`[seed] 账单月份: ${m2}, ${m1}, ${m0}`);
  db.delete(bills).run();
  db.insert(bills).values([
    // 13800000001
    { phone: '13800000001', month: m0, total: 68.0,  plan_fee: 50.0, data_fee: 8.0,  voice_fee: 0, sms_fee: 0, value_added_fee: 8.0, tax: 2.0,  status: 'paid' },
    { phone: '13800000001', month: m1, total: 72.5,  plan_fee: 50.0, data_fee: 12.5, voice_fee: 0, sms_fee: 0, value_added_fee: 8.0, tax: 2.0,  status: 'paid' },
    { phone: '13800000001', month: m2, total: 58.0,  plan_fee: 50.0, data_fee: 0,    voice_fee: 0, sms_fee: 0, value_added_fee: 6.0, tax: 2.0,  status: 'paid' },
    // 13800000002
    { phone: '13800000002', month: m0, total: 158.0, plan_fee: 128.0, data_fee: 0, voice_fee: 0, sms_fee: 0, value_added_fee: 20.0, tax: 10.0, status: 'paid' },
    { phone: '13800000002', month: m1, total: 158.0, plan_fee: 128.0, data_fee: 0, voice_fee: 0, sms_fee: 0, value_added_fee: 20.0, tax: 10.0, status: 'paid' },
    { phone: '13800000002', month: m2, total: 158.0, plan_fee: 128.0, data_fee: 0, voice_fee: 0, sms_fee: 0, value_added_fee: 20.0, tax: 10.0, status: 'paid' },
    // 13800000003
    { phone: '13800000003', month: m0, total: 36.0,  plan_fee: 30.0, data_fee: 0, voice_fee: 0, sms_fee: 0, value_added_fee: 5.0, tax: 1.0, status: 'overdue' },
    { phone: '13800000003', month: m1, total: 36.0,  plan_fee: 30.0, data_fee: 0, voice_fee: 0, sms_fee: 0, value_added_fee: 5.0, tax: 1.0, status: 'paid' },
    { phone: '13800000003', month: m2, total: 36.0,  plan_fee: 30.0, data_fee: 0, voice_fee: 0, sms_fee: 0, value_added_fee: 5.0, tax: 1.0, status: 'paid' },
  ]).run();

  // ── 6. mock_users ────────────────────────────────────────────────────────────
  console.log('[seed] 写入 mock_users 数据...');
  db.delete(mockUsers).run();
  db.insert(mockUsers).values([
    // 入呼用户
    { id: 'U001', phone: '13800000001', name: '张三', plan_zh: '畅享50G套餐 · 50元/月',    plan_en: '50G Data Plan · ¥50/mo',      status: 'active',    tag_zh: '正常用户', tag_en: 'Active',    tag_color: 'bg-green-100 text-green-600',   type: 'inbound'  },
    { id: 'U002', phone: '13800000002', name: '李四', plan_zh: '无限流量套餐 · 128元/月',  plan_en: 'Unlimited Plan · ¥128/mo',    status: 'active',    tag_zh: 'VIP用户',  tag_en: 'VIP',       tag_color: 'bg-blue-100 text-blue-600',    type: 'inbound'  },
    { id: 'U003', phone: '13800000003', name: '王五', plan_zh: '基础10G套餐 · 30元/月',    plan_en: '10G Basic Plan · ¥30/mo',     status: 'suspended', tag_zh: '欠费停机', tag_en: 'Suspended', tag_color: 'bg-red-100 text-red-600',      type: 'inbound'  },
    // 外呼催收
    { id: 'C001', phone: '13900000001', name: '张明', plan_zh: '宽带包年套餐',  plan_en: 'Annual Broadband',  status: 'suspended', tag_zh: '逾期30天', tag_en: '30d Overdue', tag_color: 'bg-red-100 text-red-600',       type: 'outbound' },
    { id: 'C002', phone: '13900000002', name: '李华', plan_zh: '家庭融合套餐',  plan_en: 'Family Bundle',     status: 'suspended', tag_zh: '逾期45天', tag_en: '45d Overdue', tag_color: 'bg-red-100 text-red-600',       type: 'outbound' },
    { id: 'C003', phone: '13900000003', name: '王芳', plan_zh: '流量月包',      plan_en: 'Monthly Data Pack', status: 'suspended', tag_zh: '逾期15天', tag_en: '15d Overdue', tag_color: 'bg-orange-100 text-orange-600', type: 'outbound' },
    // 外呼营销（电信）
    { id: 'M001', phone: '13900000004', name: '陈伟', plan_zh: '4G套餐 99元',       plan_en: '4G Plan ¥99',      status: 'active', tag_zh: '外呼营销', tag_en: 'Outbound', tag_color: 'bg-violet-100 text-violet-600',   type: 'outbound' },
    { id: 'M002', phone: '13900000005', name: '刘丽', plan_zh: '个人套餐 79元',     plan_en: 'Personal ¥79',     status: 'active', tag_zh: '外呼营销', tag_en: 'Outbound', tag_color: 'bg-violet-100 text-violet-600',   type: 'outbound' },
    { id: 'M003', phone: '13900000006', name: '赵强', plan_zh: '5G商务套餐 159元',  plan_en: '5G Business ¥159', status: 'active', tag_zh: '外呼营销', tag_en: 'Outbound', tag_color: 'bg-violet-100 text-violet-600',   type: 'outbound' },
    // 外呼营销（银行）
    { id: 'B001', phone: '13812345001', name: '王建国', plan_zh: '建行优质客户',   plan_en: 'CCB Prime',    status: 'active', tag_zh: '银行外呼', tag_en: 'Bank', tag_color: 'bg-emerald-100 text-emerald-600', type: 'outbound' },
    { id: 'B002', phone: '13812345002', name: '赵雪梅', plan_zh: '建行高净值客户', plan_en: 'CCB HNW',      status: 'active', tag_zh: '银行外呼', tag_en: 'Bank', tag_color: 'bg-emerald-100 text-emerald-600', type: 'outbound' },
    { id: 'B003', phone: '13812345003', name: '陈志远', plan_zh: '建行白金卡客户', plan_en: 'CCB Platinum', status: 'active', tag_zh: '银行外呼', tag_en: 'Bank', tag_color: 'bg-emerald-100 text-emerald-600', type: 'outbound' },
  ]).run();

  // ── 7. outbound_tasks ────────────────────────────────────────────────────────
  console.log('[seed] 写入 outbound_tasks 数据...');
  db.delete(outboundTasks).run();
  db.insert(outboundTasks).values([
    // 催收
    { id: 'C001', phone: '13900000001', task_type: 'collection',     label_zh: 'C001 · 张明 · 宽带包年 · 逾期30天 · ¥386',  label_en: 'C001 · Zhang Ming · Annual Broadband · 30 days overdue · ¥386',  data: JSON.stringify({ name: '张明', product_zh: '宽带包年套餐', product_en: 'Annual Broadband Plan', amount: 386,  days: 30  }) },
    { id: 'C002', phone: '13900000002', task_type: 'collection',     label_zh: 'C002 · 李华 · 家庭融合 · 逾期45天 · ¥1,280', label_en: 'C002 · Li Hua · Family Bundle · 45 days overdue · ¥1,280',        data: JSON.stringify({ name: '李华', product_zh: '家庭融合套餐', product_en: 'Family Bundle Plan',   amount: 1280, days: 45  }) },
    { id: 'C003', phone: '13900000003', task_type: 'collection',     label_zh: 'C003 · 王芳 · 流量月包 · 逾期15天 · ¥520',  label_en: 'C003 · Wang Fang · Monthly Data Pack · 15 days overdue · ¥520',  data: JSON.stringify({ name: '王芳', product_zh: '流量月包',     product_en: 'Monthly Data Pack',    amount: 520,  days: 15  }) },
    // 电信营销
    { id: 'M001', phone: '13900000004', task_type: 'marketing',      label_zh: 'M001 · 陈伟 · 5G升级专项活动 · ¥199/月',    label_en: 'M001 · Chen Wei · 5G Upgrade Campaign · ¥199/mo',                 data: JSON.stringify({ name: '陈伟', current_plan_zh: '4G套餐 99元',           current_plan_en: '4G Plan ¥99',                    target_plan_zh: '5G畅享套餐',   target_plan_en: '5G Unlimited Plan',   target_fee: 199, campaign_zh: '5G升级专项活动',   campaign_en: '5G Upgrade Campaign'       }) },
    { id: 'M002', phone: '13900000005', task_type: 'marketing',      label_zh: 'M002 · 刘丽 · 家庭融合推广活动 · ¥299/月',  label_en: 'M002 · Liu Li · Family Bundle Campaign · ¥299/mo',                data: JSON.stringify({ name: '刘丽', current_plan_zh: '个人套餐 79元+宽带 100元', current_plan_en: 'Personal ¥79 + Broadband ¥100',  target_plan_zh: '家庭融合套餐', target_plan_en: 'Family Bundle Plan',  target_fee: 299, campaign_zh: '家庭融合推广活动', campaign_en: 'Family Bundle Campaign'     }) },
    { id: 'M003', phone: '13900000006', task_type: 'marketing',      label_zh: 'M003 · 赵强 · 国际漫游出行季活动 · ¥98/月',  label_en: 'M003 · Zhao Qiang · Roaming Season Campaign · ¥98/mo',            data: JSON.stringify({ name: '赵强', current_plan_zh: '5G商务套餐 159元',      current_plan_en: '5G Business Plan ¥159',           target_plan_zh: '国际漫游月包', target_plan_en: 'Intl Roaming Monthly', target_fee: 98,  campaign_zh: '国际漫游出行季活动', campaign_en: 'Roaming Travel Season Campaign' }) },
    // 银行营销
    { id: 'B001', phone: '13812345001', task_type: 'bank-marketing', label_zh: 'B001 · 王建国 · 快享贷 · 低至3.65%年利率',        label_en: 'B001 · Wang Jianguo · QuickLoan · From 3.65% APR',           data: JSON.stringify({ name: '王建国', bank_zh: '建设银行', bank_en: 'CCB', product_name_zh: '快享贷（个人消费贷款）', product_name_en: 'QuickLoan (Personal Consumer Loan)', product_type: 'loan',        headline_zh: '最高50万额度，当日到账',          headline_en: 'Up to ¥500K, same-day disbursement',          expiry: '2026-03-31', segment_zh: '优质客户',   segment_en: 'Prime Customers'    }) },
    { id: 'B002', phone: '13812345002', task_type: 'bank-marketing', label_zh: 'B002 · 赵雪梅 · 睿盈180天理财 · 年化4.2%',         label_en: 'B002 · Zhao Xuemei · Ruiying 180D Wealth · 4.2% p.a.',       data: JSON.stringify({ name: '赵雪梅', bank_zh: '建设银行', bank_en: 'CCB', product_name_zh: '睿盈180天理财产品',         product_name_en: 'Ruiying 180-Day Wealth Product',             product_type: 'wealth',      headline_zh: '预期年化4.2%，历史业绩稳定',       headline_en: 'Expected 4.2% p.a., consistent track record', expiry: '2026-04-15', segment_zh: '高净值客户', segment_en: 'HNW Customers'      }) },
    { id: 'B003', phone: '13812345003', task_type: 'bank-marketing', label_zh: 'B003 · 陈志远 · 钻石Plus信用卡 · 额度提升10万',    label_en: 'B003 · Chen Zhiyuan · Diamond Plus Card · Limit +¥100K',    data: JSON.stringify({ name: '陈志远', bank_zh: '建设银行', bank_en: 'CCB', product_name_zh: '钻石Plus信用卡',            product_name_en: 'Diamond Plus Credit Card',                   product_type: 'credit_card', headline_zh: '额度升至10万，专属机场贵宾权益',    headline_en: 'Limit raised to ¥100K, airport lounge access', expiry: '2026-03-20', segment_zh: '白金卡客户', segment_en: 'Platinum Customers'  }) },
  ]).run();

  console.log('[seed] 初始化完成！');
  process.exit(0);
}

seed().catch((err) => {
  console.error('[seed] 失败:', err);
  process.exit(1);
});
