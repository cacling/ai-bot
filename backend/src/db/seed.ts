/**
 * seed.ts — 初始化电信业务数据
 *
 * 将模拟数据写入 SQLite 数据库。
 * 运行方式：bun run db:seed
 *
 * 幂等设计：先清空再插入，可重复执行。
 */

import { db } from './index';
import { eq } from 'drizzle-orm';
import {
  bills,
  callbackTasks,
  deviceContexts,
  mockUsers,
  outboundTasks,
  plans,
  subscriberSubscriptions,
  subscribers,
  valueAddedServices,
  users,
  kmDocuments,
  kmDocVersions,
  kmPipelineJobs,
  kmCandidates,
  kmEvidenceRefs,
  kmConflictRecords,
  kmReviewPackages,
  kmActionDrafts,
  kmAssets,
  kmAssetVersions,
  kmGovernanceTasks,
  kmRegressionWindows,
  kmAuditLogs,
  mcpServers,
  skillRegistry,
  skillVersions,
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
  ]).run();

  // ── 7a. callback_tasks（清空即可，运行时产生数据）────────────────────────────
  console.log('[seed] 清空 callback_tasks...');
  db.delete(callbackTasks).run();

  // ── 7b. device_contexts ────────────────────────────────────────────────────
  console.log('[seed] 写入 device_contexts 数据...');
  db.delete(deviceContexts).run();
  db.insert(deviceContexts).values([
    { phone: '13800000001', installed_app_version: '3.2.1', latest_app_version: '3.5.0', device_os: 'android', os_version: 'Android 13', device_rooted: false, developer_mode_on: false, running_on_emulator: false, has_vpn_active: false, has_fake_gps: false, has_remote_access_app: false, has_screen_share_active: false, flagged_apps: '[]', login_location_changed: false, new_device: false, otp_delivery_issue: false },
    { phone: '13800000002', installed_app_version: '3.5.0', latest_app_version: '3.5.0', device_os: 'ios', os_version: 'iOS 17.4', device_rooted: false, developer_mode_on: false, running_on_emulator: false, has_vpn_active: true, has_fake_gps: false, has_remote_access_app: false, has_screen_share_active: false, flagged_apps: '[]', login_location_changed: false, new_device: false, otp_delivery_issue: false },
    { phone: '13800000003', installed_app_version: '3.0.0', latest_app_version: '3.5.0', device_os: 'android', os_version: 'Android 12', device_rooted: false, developer_mode_on: true, running_on_emulator: false, has_vpn_active: false, has_fake_gps: false, has_remote_access_app: false, has_screen_share_active: false, flagged_apps: '[]', login_location_changed: true, new_device: true, otp_delivery_issue: false },
  ]).run();

  // ── 7c. outbound_tasks ─────────────────────────────────────────────────────
  console.log('[seed] 写入 outbound_tasks 数据...');
  db.delete(outboundTasks).run();
  db.insert(outboundTasks).values([
    // 催收
    { id: 'C001', phone: '13900000001', task_type: 'collection', label_zh: 'C001 · 张明 · 宽带包年 · 逾期30天 · ¥386', label_en: 'C001 · Zhang Ming · Annual Broadband · 30 days overdue · ¥386', data: JSON.stringify({
      zh: { case_id: 'C001', customer_name: '张明', overdue_amount: 386, overdue_days: 30, due_date: '2026-03-15', product_name: '宽带包年套餐', strategy: '轻催' },
      en: { case_id: 'C001', customer_name: 'Zhang Ming', overdue_amount: 386, overdue_days: 30, due_date: '2026-03-15', product_name: 'Annual Broadband Plan', strategy: 'soft' },
    }) },
    { id: 'C002', phone: '13900000002', task_type: 'collection', label_zh: 'C002 · 李华 · 家庭融合 · 逾期45天 · ¥1,280', label_en: 'C002 · Li Hua · Family Bundle · 45 days overdue · ¥1,280', data: JSON.stringify({
      zh: { case_id: 'C002', customer_name: '李华', overdue_amount: 1280, overdue_days: 45, due_date: '2026-03-10', product_name: '家庭融合套餐', strategy: '中催' },
      en: { case_id: 'C002', customer_name: 'Li Hua', overdue_amount: 1280, overdue_days: 45, due_date: '2026-03-10', product_name: 'Family Bundle Plan', strategy: 'medium' },
    }) },
    { id: 'C003', phone: '13900000003', task_type: 'collection', label_zh: 'C003 · 王芳 · 流量月包 · 逾期15天 · ¥520', label_en: 'C003 · Wang Fang · Monthly Data Pack · 15 days overdue · ¥520', data: JSON.stringify({
      zh: { case_id: 'C003', customer_name: '王芳', overdue_amount: 520, overdue_days: 15, due_date: '2026-03-20', product_name: '流量月包', strategy: '轻催' },
      en: { case_id: 'C003', customer_name: 'Wang Fang', overdue_amount: 520, overdue_days: 15, due_date: '2026-03-20', product_name: 'Monthly Data Plan', strategy: 'soft' },
    }) },
    // 营销
    { id: 'M001', phone: '13900000004', task_type: 'marketing', label_zh: 'M001 · 陈伟 · 5G升级专项活动 · ¥199/月', label_en: 'M001 · Chen Wei · 5G Upgrade Campaign · ¥199/mo', data: JSON.stringify({
      zh: { campaign_id: 'M001', campaign_name: '5G升级专项活动', customer_name: '陈伟', current_plan: '4G畅享套餐 99元/月（100GB流量）', target_plan_name: '5G畅享套餐', target_plan_fee: 199, target_plan_data: '300GB（5G速率）', target_plan_voice: '600分钟', target_plan_features: ['解锁5G网速', '流量翻三倍', '首月免月租'], promo_note: '首月免月租，本月底前办理有效', talk_template: '5G_upgrade_v2' },
      en: { campaign_id: 'M001', campaign_name: '5G Upgrade Campaign', customer_name: 'Chen Wei', current_plan: '4G Unlimited Plan ¥99/mo (100GB data)', target_plan_name: '5G Unlimited Plan', target_plan_fee: 199, target_plan_data: '300GB (5G speed)', target_plan_voice: '600 minutes', target_plan_features: ['Unlock 5G speed', '3x more data', 'First month free'], promo_note: 'First month free — offer valid through end of this month', talk_template: '5G_upgrade_v2' },
    }) },
    { id: 'M002', phone: '13900000005', task_type: 'marketing', label_zh: 'M002 · 刘丽 · 家庭融合推广活动 · ¥299/月', label_en: 'M002 · Liu Li · Family Bundle Campaign · ¥299/mo', data: JSON.stringify({
      zh: { campaign_id: 'M002', campaign_name: '家庭融合推广活动', customer_name: '刘丽', current_plan: '个人4G套餐 79元/月（50GB流量）+ 宽带 100元/月', target_plan_name: '家庭融合套餐', target_plan_fee: 299, target_plan_data: '主卡200GB + 3张副卡各50GB', target_plan_voice: '主卡不限分钟', target_plan_features: ['手机+宽带500M合一', '3张副卡共享流量', '每月节省约100元'], promo_note: '宽带免费升速至500M，24个月合约', talk_template: 'family_bundle_v1' },
      en: { campaign_id: 'M002', campaign_name: 'Family Bundle Promotion', customer_name: 'Liu Li', current_plan: 'Personal 4G Plan ¥79/mo (50GB data) + Broadband ¥100/mo', target_plan_name: 'Family Bundle Plan', target_plan_fee: 299, target_plan_data: 'Primary line 200GB + 3 sub-lines 50GB each', target_plan_voice: 'Primary line unlimited minutes', target_plan_features: ['Mobile + 500M broadband combined', '3 shared sub-lines', 'Save ~¥100/month'], promo_note: 'Free broadband speed upgrade to 500M, 24-month contract', talk_template: 'family_bundle_v1' },
    }) },
    { id: 'M003', phone: '13900000006', task_type: 'marketing', label_zh: 'M003 · 赵强 · 国际漫游出行季活动 · ¥98/月', label_en: 'M003 · Zhao Qiang · Roaming Season Campaign · ¥98/mo', data: JSON.stringify({
      zh: { campaign_id: 'M003', campaign_name: '国际漫游出行季活动', customer_name: '赵强', current_plan: '5G商务套餐 159元/月', target_plan_name: '国际漫游月包', target_plan_fee: 98, target_plan_data: '日韩港澳台及东南亚10国每日1GB高速', target_plan_voice: '接听免费，拨出0.5元/分钟', target_plan_features: ['落地即用', '超量不断网', '比直接漫游省60%'], promo_note: '出境前1天激活即可，30天内有效', talk_template: 'roaming_v1' },
      en: { campaign_id: 'M003', campaign_name: 'International Roaming Travel Season', customer_name: 'Zhao Qiang', current_plan: '5G Business Plan ¥159/mo', target_plan_name: 'International Roaming Monthly Pack', target_plan_fee: 98, target_plan_data: '1GB/day high-speed in Japan, Korea, HK, Macau, Taiwan & 10 SE Asian countries', target_plan_voice: 'Free incoming calls, outgoing ¥0.5/min', target_plan_features: ['Ready on arrival', 'No cutoff after cap', 'Save 60% vs. standard roaming'], promo_note: 'Activate 1 day before departure — valid for 30 days', talk_template: 'roaming_v1' },
    }) },
  ]).run();

  // ── 默认用户 ─────────────────────────────────────────────────────
  console.log('[seed] 写入默认用户...');
  db.delete(users).run();
  db.insert(users).values([
    { id: 'admin',         name: '管理员',    role: 'admin' },
    { id: 'flow_manager',  name: '流程管理员', role: 'flow_manager' },
    { id: 'config_editor', name: '配置编辑员', role: 'config_editor' },
    { id: 'reviewer',      name: '审核员',    role: 'reviewer' },
    { id: 'auditor',       name: '审计员',    role: 'auditor' },
  ]).run();

  // ── 8. 知识管理演示数据 ────────────────────────────────────────────────────
  console.log('[seed] 写入知识管理演示数据...');

  // 清空（按外键依赖顺序）
  db.delete(kmAuditLogs).run();
  db.delete(kmRegressionWindows).run();
  db.delete(kmGovernanceTasks).run();
  db.delete(kmAssetVersions).run();
  db.delete(kmAssets).run();
  db.delete(kmActionDrafts).run();
  db.delete(kmReviewPackages).run();
  db.delete(kmConflictRecords).run();
  db.delete(kmEvidenceRefs).run();
  db.delete(kmCandidates).run();
  db.delete(kmPipelineJobs).run();
  db.delete(kmDocVersions).run();
  db.delete(kmDocuments).run();

  const now = new Date().toISOString();
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString();
  const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
  const oneWeekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const nextQuarter = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);

  // ── 8.1 文档 ──────────────────────────────────────────────────────
  db.insert(kmDocuments).values([
    { id: 'doc-cancel-policy',   title: '增值业务退订政策（2026版）', source: 'upload',    classification: 'internal', owner: '张三', status: 'active', created_at: oneWeekAgo, updated_at: yesterday },
    { id: 'doc-billing-rules',   title: '计费规则与争议处理规范',       source: 'upload',    classification: 'sensitive', owner: '李四', status: 'active', created_at: oneWeekAgo, updated_at: twoDaysAgo },
    { id: 'doc-5g-plans',        title: '5G套餐资费说明（2026Q1）',   source: 'connector', classification: 'public',    owner: '王五', status: 'active', created_at: threeDaysAgo, updated_at: threeDaysAgo },
    { id: 'doc-network-faq',     title: '宽带故障排查FAQ手册',        source: 'upload',    classification: 'internal', owner: '张三', status: 'active', created_at: oneWeekAgo, updated_at: oneWeekAgo },
    { id: 'doc-complaint-guide', title: '客户投诉处理操作指引',        source: 'upload',    classification: 'sensitive', owner: '李四', status: 'active', created_at: twoDaysAgo, updated_at: yesterday },
  ]).run();

  // ── 8.2 文档版本 ──────────────────────────────────────────────────
  db.insert(kmDocVersions).values([
    { id: 'dv-cancel-v1', document_id: 'doc-cancel-policy', version_no: 1, scope_json: '{"region":"全国","channel":"全渠道"}', effective_from: '2026-01-01', effective_to: '2026-12-31', diff_summary: null, status: 'parsed', created_at: oneWeekAgo },
    { id: 'dv-cancel-v2', document_id: 'doc-cancel-policy', version_no: 2, scope_json: '{"region":"全国","channel":"全渠道"}', effective_from: '2026-03-01', effective_to: '2026-12-31', diff_summary: '退订时限从7个工作日缩短为5个工作日；新增即时退订通道', status: 'parsed', created_at: yesterday },
    { id: 'dv-billing-v1', document_id: 'doc-billing-rules', version_no: 1, scope_json: '{"region":"全国","channel":"线上"}', effective_from: '2026-01-01', effective_to: '2026-06-30', diff_summary: null, status: 'parsed', created_at: oneWeekAgo },
    { id: 'dv-5g-v1',     document_id: 'doc-5g-plans',      version_no: 1, scope_json: '{"region":"全国","channel":"全渠道"}', effective_from: '2026-01-01', effective_to: '2026-03-31', diff_summary: null, status: 'parsed', created_at: threeDaysAgo },
    { id: 'dv-network-v1', document_id: 'doc-network-faq',   version_no: 1, scope_json: '{"region":"全国","channel":"客服"}', effective_from: '2025-07-01', effective_to: '2026-06-30', diff_summary: null, status: 'parsed', created_at: oneWeekAgo },
    { id: 'dv-complaint-v1', document_id: 'doc-complaint-guide', version_no: 1, scope_json: '{"region":"全国","channel":"全渠道"}', effective_from: '2026-03-01', effective_to: '2026-12-31', diff_summary: null, status: 'draft', created_at: twoDaysAgo },
  ]).run();

  // ── 8.3 流水线作业 ────────────────────────────────────────────────
  db.insert(kmPipelineJobs).values([
    { id: 'job-cancel-parse',    doc_version_id: 'dv-cancel-v2', stage: 'parse',    status: 'success', candidate_count: 0, started_at: yesterday, finished_at: yesterday, created_at: yesterday },
    { id: 'job-cancel-chunk',    doc_version_id: 'dv-cancel-v2', stage: 'chunk',    status: 'success', candidate_count: 0, started_at: yesterday, finished_at: yesterday, created_at: yesterday },
    { id: 'job-cancel-generate', doc_version_id: 'dv-cancel-v2', stage: 'generate', status: 'success', candidate_count: 3, started_at: yesterday, finished_at: yesterday, created_at: yesterday },
    { id: 'job-cancel-validate', doc_version_id: 'dv-cancel-v2', stage: 'validate', status: 'success', candidate_count: 0, started_at: yesterday, finished_at: yesterday, created_at: yesterday },
    { id: 'job-complaint-parse', doc_version_id: 'dv-complaint-v1', stage: 'parse', status: 'failed', error_code: 'OCR_LANG', error_message: 'OCR语言包不匹配，请尝试切换为中文简体模式', started_at: yesterday, finished_at: yesterday, created_at: yesterday },
  ]).run();

  // ── 8.4 知识候选 ──────────────────────────────────────────────────
  db.insert(kmCandidates).values([
    // 已发布（退订政策产出）
    { id: 'cand-001', source_type: 'parsing', source_ref_id: 'dv-cancel-v2', normalized_q: '如何退订增值业务？', draft_answer: '您可以通过以下方式退订：1）营业厅App → 我的服务 → 增值业务 → 退订；2）拨打10000号转人工；3）营业厅柜台办理。退订后次月生效，当月费用不退。', category: '业务办理', risk_level: 'low', gate_evidence: 'pass', gate_conflict: 'pass', gate_ownership: 'pass', status: 'published', review_pkg_id: 'rpkg-001', created_by: '张三', created_at: twoDaysAgo, updated_at: yesterday },
    { id: 'cand-002', source_type: 'parsing', source_ref_id: 'dv-cancel-v2', normalized_q: '退订增值业务后费用如何计算？', draft_answer: '退订当月仍按月度全额计费，次月起停止扣费。已享受优惠期内退订需补缴优惠差额。', category: '费用查询', risk_level: 'low', gate_evidence: 'pass', gate_conflict: 'pass', gate_ownership: 'pass', status: 'published', review_pkg_id: 'rpkg-001', created_by: '张三', created_at: twoDaysAgo, updated_at: yesterday },
    { id: 'cand-003', source_type: 'parsing', source_ref_id: 'dv-cancel-v2', normalized_q: '退订增值业务需要多长时间生效？', draft_answer: '常规退订：次月1日零点生效。即时退订通道（2026年3月起新增）：提交后实时生效，当月按天折算退费。', category: '业务办理', risk_level: 'low', gate_evidence: 'pass', gate_conflict: 'pass', gate_ownership: 'pass', status: 'published', review_pkg_id: 'rpkg-001', created_by: '张三', created_at: twoDaysAgo, updated_at: yesterday },

    // 门槛通过，待入评审包
    { id: 'cand-004', source_type: 'parsing', source_ref_id: 'dv-billing-v1', normalized_q: '账单金额与实际使用不符怎么办？', draft_answer: '请先核实账单明细（App → 我的账单 → 明细），如确认异常可在线提交争议工单，客服将在3个工作日内回复处理结果。', category: '费用查询', risk_level: 'medium', gate_evidence: 'pass', gate_conflict: 'pass', gate_ownership: 'pass', status: 'gate_pass', created_by: '李四', created_at: twoDaysAgo, updated_at: twoDaysAgo },
    { id: 'cand-005', source_type: 'manual', source_ref_id: null, normalized_q: '5G套餐升级后原套餐剩余流量如何处理？', draft_answer: '升级当月，原套餐剩余流量与新套餐流量叠加使用；次月起按新套餐标准计量。', category: '套餐变更', risk_level: 'low', gate_evidence: 'pass', gate_conflict: 'pass', gate_ownership: 'pass', status: 'gate_pass', created_by: '王五', created_at: yesterday, updated_at: yesterday },

    // 门槛未通过（缺证据）
    { id: 'cand-006', source_type: 'feedback', source_ref_id: null, normalized_q: '宽带网速慢有哪些可能原因？', draft_answer: '常见原因包括：光猫缓存满、WiFi信道拥堵、光纤接口松动、区域网络高峰。建议先重启光猫，仍无改善请报修。', category: '故障排查', risk_level: 'low', gate_evidence: 'fail', gate_conflict: 'pass', gate_ownership: 'pass', status: 'draft', created_by: '张三', created_at: yesterday, updated_at: yesterday },
    { id: 'cand-007', source_type: 'feedback', source_ref_id: null, normalized_q: '投诉处理流程是怎样的？', draft_answer: '投诉受理 → 48小时内首次回复 → 问题定位 → 解决方案确认 → 执行 → 回访确认满意。', category: '投诉处理', risk_level: 'high', gate_evidence: 'fail', gate_conflict: 'pass', gate_ownership: 'pending', status: 'draft', created_by: '李四', created_at: yesterday, updated_at: yesterday },

    // 存在冲突
    { id: 'cand-008', source_type: 'parsing', source_ref_id: 'dv-5g-v1', normalized_q: '5G畅享套餐月费多少？', draft_answer: '5G畅享套餐月费199元，含100GB全国通用流量、1000分钟国内通话、视频会员权益。', category: '套餐查询', risk_level: 'low', gate_evidence: 'pass', gate_conflict: 'fail', gate_ownership: 'pass', status: 'draft', created_by: '王五', created_at: yesterday, updated_at: yesterday },
  ]).run();

  // ── 8.5 证据引用 ──────────────────────────────────────────────────
  db.insert(kmEvidenceRefs).values([
    { id: 'ev-001', candidate_id: 'cand-001', doc_version_id: 'dv-cancel-v2', locator: '第2章第1节「退订渠道」', status: 'pass', rule_version: 'v1.0', reviewed_by: 'reviewer', reviewed_at: yesterday, created_at: twoDaysAgo },
    { id: 'ev-002', candidate_id: 'cand-002', doc_version_id: 'dv-cancel-v2', locator: '第3章「费用结算规则」第2条', status: 'pass', rule_version: 'v1.0', reviewed_by: 'reviewer', reviewed_at: yesterday, created_at: twoDaysAgo },
    { id: 'ev-003', candidate_id: 'cand-003', doc_version_id: 'dv-cancel-v2', locator: '第2章第3节「即时退订」', status: 'pass', rule_version: 'v1.0', reviewed_by: 'reviewer', reviewed_at: yesterday, created_at: twoDaysAgo },
    { id: 'ev-004', candidate_id: 'cand-004', doc_version_id: 'dv-billing-v1', locator: '第5章「争议处理」', status: 'pass', rule_version: 'v1.0', reviewed_by: 'reviewer', reviewed_at: twoDaysAgo, created_at: twoDaysAgo },
    { id: 'ev-005', candidate_id: 'cand-005', doc_version_id: 'dv-5g-v1', locator: '第4节「套餐变更」', status: 'pass', rule_version: 'v1.0', reviewed_by: 'reviewer', reviewed_at: yesterday, created_at: yesterday },
    { id: 'ev-006', candidate_id: 'cand-008', doc_version_id: 'dv-5g-v1', locator: '第1节「套餐一览」', status: 'pass', rule_version: 'v1.0', reviewed_by: 'reviewer', reviewed_at: yesterday, created_at: yesterday },
    // cand-006, cand-007 没有证据 → 门槛fail
  ]).run();

  // ── 8.6 冲突记录 ──────────────────────────────────────────────────
  db.insert(kmConflictRecords).values([
    { id: 'conf-001', conflict_type: 'wording', item_a_id: 'cand-008', item_b_id: 'asset-003', overlap_scope: '5G畅享套餐月费：候选说199元，现有资产说189元（促销价）', blocking_policy: 'block_submit', status: 'pending', created_at: yesterday },
  ]).run();

  // ── 8.7 评审包 ────────────────────────────────────────────────────
  db.insert(kmReviewPackages).values([
    // 已发布
    { id: 'rpkg-001', title: '退订政策首批知识入库', status: 'published', risk_level: 'low', impact_summary: '覆盖增值业务退订场景的3条核心QA', candidate_ids_json: '["cand-001","cand-002","cand-003"]', approval_policy: '运营双人复核', approval_snapshot: JSON.stringify({ submitted_by: '张三', submitted_at: twoDaysAgo, approved_by: 'reviewer', approved_at: yesterday }), submitted_by: '张三', submitted_at: twoDaysAgo, approved_by: 'reviewer', approved_at: yesterday, created_by: '张三', created_at: twoDaysAgo, updated_at: yesterday },
    // 草稿（待提交）
    { id: 'rpkg-002', title: '计费争议与套餐升级知识补充', status: 'draft', risk_level: 'medium', impact_summary: '补充计费争议处理和5G升级场景', candidate_ids_json: '["cand-004","cand-005"]', created_by: '李四', created_at: yesterday, updated_at: yesterday },
  ]).run();

  // ── 8.8 动作草案 ──────────────────────────────────────────────────
  db.insert(kmActionDrafts).values([
    // 已执行（退订政策发布）
    { id: 'adraft-001', action_type: 'publish', review_pkg_id: 'rpkg-001', status: 'done', change_summary: '退订政策首批3条QA发布上线', rollback_point_id: 'rollback_adraft-001', regression_window_id: 'regwin-001', executed_by: 'admin', executed_at: yesterday, created_by: '张三', created_at: yesterday, updated_at: yesterday },
    // 草稿（降权示例）
    { id: 'adraft-002', action_type: 'downgrade', target_asset_id: 'asset-003', status: 'draft', change_summary: '5G畅享套餐价格存疑，暂时降权处理', created_by: '王五', created_at: now, updated_at: now },
  ]).run();

  // ── 8.9 知识资产 ──────────────────────────────────────────────────
  db.insert(kmAssets).values([
    { id: 'asset-001', title: '如何退订增值业务？',         asset_type: 'qa', status: 'online', current_version: 1, scope_json: '{"region":"全国","channel":"全渠道"}', owner: '张三', next_review_date: nextQuarter, created_at: yesterday, updated_at: yesterday },
    { id: 'asset-002', title: '退订增值业务后费用如何计算？', asset_type: 'qa', status: 'online', current_version: 1, scope_json: '{"region":"全国","channel":"全渠道"}', owner: '张三', next_review_date: nextQuarter, created_at: yesterday, updated_at: yesterday },
    { id: 'asset-003', title: '退订增值业务需要多长时间生效？', asset_type: 'qa', status: 'online', current_version: 1, scope_json: '{"region":"全国","channel":"全渠道"}', owner: '张三', next_review_date: nextQuarter, created_at: yesterday, updated_at: yesterday },
    // 一个已有的5G资产（用于冲突演示）
    { id: 'asset-004', title: '5G畅享套餐月费多少？', asset_type: 'qa', status: 'online', current_version: 1, scope_json: '{"region":"全国","channel":"全渠道"}', owner: '王五', next_review_date: nextMonth, created_at: oneWeekAgo, updated_at: oneWeekAgo },
  ]).run();

  // ── 8.10 资产版本 ─────────────────────────────────────────────────
  db.insert(kmAssetVersions).values([
    { id: 'av-001', asset_id: 'asset-001', version_no: 1, content_snapshot: JSON.stringify({ q: '如何退订增值业务？', a: '您可以通过以下方式退订：1）营业厅App → 我的服务 → 增值业务 → 退订；2）拨打10000号转人工；3）营业厅柜台办理。退订后次月生效，当月费用不退。' }), scope_snapshot: '{"region":"全国","channel":"全渠道"}', evidence_summary: '退订政策2026版 第2章第1节', action_draft_id: 'adraft-001', effective_from: yesterday, created_at: yesterday },
    { id: 'av-002', asset_id: 'asset-002', version_no: 1, content_snapshot: JSON.stringify({ q: '退订增值业务后费用如何计算？', a: '退订当月仍按月度全额计费，次月起停止扣费。已享受优惠期内退订需补缴优惠差额。' }), scope_snapshot: '{"region":"全国","channel":"全渠道"}', evidence_summary: '退订政策2026版 第3章第2条', action_draft_id: 'adraft-001', effective_from: yesterday, created_at: yesterday },
    { id: 'av-003', asset_id: 'asset-003', version_no: 1, content_snapshot: JSON.stringify({ q: '退订增值业务需要多长时间生效？', a: '常规退订次月生效。即时退订通道（2026年3月起）实时生效，按天折算退费。' }), scope_snapshot: '{"region":"全国","channel":"全渠道"}', evidence_summary: '退订政策2026版 第2章第3节', action_draft_id: 'adraft-001', effective_from: yesterday, created_at: yesterday },
    { id: 'av-004', asset_id: 'asset-004', version_no: 1, content_snapshot: JSON.stringify({ q: '5G畅享套餐月费多少？', a: '5G畅享套餐月费189元（促销期），含80GB流量、800分钟通话。' }), scope_snapshot: '{"region":"全国","channel":"全渠道"}', evidence_summary: '5G套餐资费说明 第1节', effective_from: oneWeekAgo, created_at: oneWeekAgo },
  ]).run();

  // ── 8.11 治理任务 ─────────────────────────────────────────────────
  db.insert(kmGovernanceTasks).values([
    { id: 'task-001', task_type: 'evidence_gap',   source_type: 'candidate',        source_ref_id: 'cand-006', priority: 'medium', assignee: '张三', status: 'open',        due_date: nextMonth, created_at: yesterday, updated_at: yesterday },
    { id: 'task-002', task_type: 'evidence_gap',   source_type: 'candidate',        source_ref_id: 'cand-007', priority: 'high',   assignee: '李四', status: 'open',        due_date: nextMonth, created_at: yesterday, updated_at: yesterday },
    { id: 'task-003', task_type: 'conflict_arb',   source_type: 'conflict_record',  source_ref_id: 'conf-001', priority: 'high',   assignee: '王五', status: 'in_progress', due_date: nextMonth, created_at: yesterday, updated_at: now },
    { id: 'task-004', task_type: 'failure_fix',    source_type: 'pipeline_job',     source_ref_id: 'job-complaint-parse', priority: 'medium', assignee: '张三', status: 'open', due_date: nextMonth, created_at: yesterday, updated_at: yesterday },
    { id: 'task-005', task_type: 'review_expiry',  source_type: 'asset',            source_ref_id: 'asset-004',           priority: 'low',    assignee: '王五', status: 'open', due_date: nextMonth, conclusion: null, created_at: now, updated_at: now },
  ]).run();

  // ── 8.12 回归窗口 ─────────────────────────────────────────────────
  db.insert(kmRegressionWindows).values([
    { id: 'regwin-001', linked_type: 'action_draft', linked_id: 'adraft-001', metrics_json: JSON.stringify({ recall_score: 0.85, self_resolve_rate: 0.72, transfer_rate: 0.08 }), threshold_json: JSON.stringify({ recall_score: 0.7, self_resolve_rate: 0.6 }), verdict: 'pass', observe_from: yesterday, observe_until: new Date(Date.now() + 7 * 86400000).toISOString(), concluded_at: now, created_at: yesterday },
  ]).run();

  // ── 8.13 审计日志 ─────────────────────────────────────────────────
  db.insert(kmAuditLogs).values([
    { action: 'create_document',   object_type: 'document',        object_id: 'doc-cancel-policy',  operator: '张三',    risk_level: null, detail_json: JSON.stringify({ title: '增值业务退订政策（2026版）' }), created_at: oneWeekAgo },
    { action: 'create_document',   object_type: 'document',        object_id: 'doc-billing-rules',  operator: '李四',    risk_level: null, detail_json: JSON.stringify({ title: '计费规则与争议处理规范' }), created_at: oneWeekAgo },
    { action: 'evidence_pass',     object_type: 'evidence_ref',    object_id: 'ev-001',             operator: 'reviewer', risk_level: null, detail_json: null, created_at: yesterday },
    { action: 'evidence_pass',     object_type: 'evidence_ref',    object_id: 'ev-002',             operator: 'reviewer', risk_level: null, detail_json: null, created_at: yesterday },
    { action: 'evidence_pass',     object_type: 'evidence_ref',    object_id: 'ev-003',             operator: 'reviewer', risk_level: null, detail_json: null, created_at: yesterday },
    { action: 'submit_review',     object_type: 'review_package',  object_id: 'rpkg-001',           operator: '张三',    risk_level: null, detail_json: null, created_at: twoDaysAgo },
    { action: 'approve_review',    object_type: 'review_package',  object_id: 'rpkg-001',           operator: 'reviewer', risk_level: null, detail_json: null, created_at: yesterday },
    { action: 'execute_publish',   object_type: 'action_draft',    object_id: 'adraft-001',         operator: 'admin',   risk_level: 'high', detail_json: JSON.stringify({ action_type: 'publish', review_pkg_id: 'rpkg-001' }), created_at: yesterday },
  ]).run();

  console.log('[seed] 知识管理数据写入完成：5篇文档 / 8条候选 / 4条资产 / 2个评审包 / 5个治理任务');

  // ── 9. MCP Server 注册数据（upsert：已存在则跳过，保留用户修改）──────────────
  console.log('[seed] 写入 MCP Server 注册数据...');
  // ── Mock 规则定义（覆盖所有 Skill 分支场景）───────────────────────────────
  const userInfoMockRules = JSON.stringify([
    // query_subscriber
    { tool_name: 'query_subscriber', match: 'phone == "13800000001"', response: '{"found":true,"subscriber":{"phone":"13800000001","name":"张三","plan":"畅享50G套餐","plan_id":"plan_50g","status":"active","balance":45.8,"data_used_gb":32.5,"data_total_gb":50,"voice_used_min":280,"voice_total_min":500,"subscriptions":["video_pkg","sms_100"]}}' },
    { tool_name: 'query_subscriber', match: 'phone == "13800000002"', response: '{"found":true,"subscriber":{"phone":"13800000002","name":"李四","plan":"无限流量套餐","plan_id":"plan_unlimited","status":"active","balance":128,"data_used_gb":89.2,"data_total_gb":-1,"voice_used_min":0,"voice_total_min":-1,"subscriptions":["video_pkg"]}}' },
    { tool_name: 'query_subscriber', match: 'phone == "13800000003"', response: '{"found":true,"subscriber":{"phone":"13800000003","name":"王五","plan":"基础10G套餐","plan_id":"plan_10g","status":"suspended","balance":-23.5,"data_used_gb":10,"data_total_gb":10,"voice_used_min":200,"voice_total_min":200,"subscriptions":[]}}' },
    { tool_name: 'query_subscriber', match: '', response: '{"found":false,"message":"未找到该手机号的用户信息"}' },
    // query_bill
    { tool_name: 'query_bill', match: 'phone == "13800000001"', response: '{"found":true,"note":"以下为最近3个月账单","bills":[{"phone":"13800000001","month":"2026-03","month_label":"2026年3月","total":68,"plan_fee":50,"data_fee":8,"voice_fee":0,"value_added_fee":8,"tax":2,"status":"paid"},{"phone":"13800000001","month":"2026-02","month_label":"2026年2月","total":72.5,"plan_fee":50,"data_fee":12.5,"voice_fee":0,"value_added_fee":8,"tax":2,"status":"paid"},{"phone":"13800000001","month":"2026-01","month_label":"2026年1月","total":58,"plan_fee":50,"data_fee":0,"voice_fee":0,"value_added_fee":6,"tax":2,"status":"paid"}]}' },
    { tool_name: 'query_bill', match: 'phone == "13800000003"', response: '{"found":true,"note":"以下为最近1个月账单","bills":[{"phone":"13800000003","month":"2026-03","month_label":"2026年3月","total":36,"plan_fee":30,"data_fee":0,"voice_fee":0,"value_added_fee":5,"tax":1,"status":"overdue"}]}' },
    { tool_name: 'query_bill', match: '', response: '{"found":false,"message":"未找到该手机号的账单记录"}' },
    // query_plans
    { tool_name: 'query_plans', match: 'plan_id == "plan_unlimited"', response: '{"found":true,"plan":{"plan_id":"plan_unlimited","name":"无限流量套餐","monthly_fee":128,"data_gb":-1,"voice_min":-1,"sms":-1,"features":["免费来电显示","语音信箱","WiFi热点共享","国内漫游免费","视频会员权益"],"description":"旗舰无限套餐"}}' },
    { tool_name: 'query_plans', match: '', response: '{"found":true,"plans":[{"plan_id":"plan_10g","name":"基础10G套餐","monthly_fee":30,"data_gb":10,"voice_min":200,"features":["免费来电显示"]},{"plan_id":"plan_50g","name":"畅享50G套餐","monthly_fee":50,"data_gb":50,"voice_min":500,"features":["免费来电显示","WiFi热点共享"]},{"plan_id":"plan_100g","name":"超值100G套餐","monthly_fee":88,"data_gb":100,"voice_min":1000,"features":["免费来电显示","WiFi热点共享","国内漫游免费"]},{"plan_id":"plan_unlimited","name":"无限流量套餐","monthly_fee":128,"data_gb":-1,"voice_min":-1,"features":["免费来电显示","WiFi热点共享","国内漫游免费","视频会员权益"]}]}' },
  ]);

  const businessMockRules = JSON.stringify([
    // cancel_service
    { tool_name: 'cancel_service', match: 'phone == "13800000001" && service_id == "video_pkg"', response: '{"success":true,"phone":"13800000001","service_id":"video_pkg","service_name":"视频会员流量包（20GB/月）","monthly_fee":20,"effective_end":"次月1日00:00","message":"已成功退订「视频会员流量包」，将于次月1日生效"}' },
    { tool_name: 'cancel_service', match: 'phone == "13800000001" && service_id == "sms_100"', response: '{"success":true,"phone":"13800000001","service_id":"sms_100","service_name":"短信百条包（100条/月）","monthly_fee":5,"effective_end":"次月1日00:00","message":"已成功退订「短信百条包」"}' },
    { tool_name: 'cancel_service', match: 'service_id == "nonexistent"', response: '{"success":false,"message":"用户未订阅该业务"}' },
    { tool_name: 'cancel_service', match: '', response: '{"success":false,"message":"未找到该手机号"}' },
    // issue_invoice
    { tool_name: 'issue_invoice', match: 'phone == "13800000001"', response: '{"success":true,"invoice_no":"INV-202603-0001-MOCK","phone":"13800000001","total":68,"email":"te****@example.com","status":"已发送","message":"电子发票已发送"}' },
    { tool_name: 'issue_invoice', match: '', response: '{"success":false,"message":"未找到账单记录，无法开具发票"}' },
  ]);

  const diagnosisMockRules = JSON.stringify([
    // diagnose_network — 6 个分支
    { tool_name: 'diagnose_network', match: 'issue_type == "slow_data" && phone == "13800000001"', response: '{"success":true,"phone":"13800000001","issue_type":"slow_data","diagnostic_steps":[{"step":"账号状态","status":"ok","detail":"正常","action":""},{"step":"流量余额","status":"ok","detail":"剩余17.5GB","action":""},{"step":"APN配置","status":"ok","detail":"正常","action":""},{"step":"基站信号","status":"warning","detail":"信号强度-85dBm，低于正常范围","action":"建议移至开阔区域"},{"step":"网络拥塞","status":"warning","detail":"当前基站负载82%","action":"建议错峰使用或连接WiFi"}],"conclusion":"网络拥塞导致网速下降"}' },
    { tool_name: 'diagnose_network', match: 'issue_type == "no_signal"', response: '{"success":true,"issue_type":"no_signal","diagnostic_steps":[{"step":"账号状态","status":"error","detail":"账户已停机（欠费）","action":"请先缴清欠费"}],"conclusion":"账户欠费停机，需先缴费恢复"}' },
    { tool_name: 'diagnose_network', match: 'issue_type == "no_network" && phone == "13800000001"', response: '{"success":true,"issue_type":"no_network","diagnostic_steps":[{"step":"账号状态","status":"ok","detail":"正常","action":""},{"step":"APN配置","status":"warning","detail":"APN设置异常","action":"请重置APN为默认值"}],"conclusion":"APN配置异常导致无法上网"}' },
    { tool_name: 'diagnose_network', match: 'issue_type == "slow_data" && phone == "13800000003"', response: '{"success":true,"issue_type":"slow_data","diagnostic_steps":[{"step":"账号状态","status":"ok","detail":"","action":""},{"step":"流量余额","status":"error","detail":"本月流量已用完（10GB/10GB）","action":"建议购买流量加油包或升级套餐"}],"conclusion":"流量已耗尽"}' },
    { tool_name: 'diagnose_network', match: 'issue_type == "call_drop"', response: '{"success":true,"issue_type":"call_drop","diagnostic_steps":[{"step":"账号状态","status":"ok","detail":"正常","action":""},{"step":"基站信号","status":"ok","detail":"信号良好","action":""},{"step":"网络拥塞","status":"ok","detail":"负载正常","action":""}],"conclusion":"各项指标正常，建议观察"}' },
    { tool_name: 'diagnose_network', match: '', response: '{"success":false,"message":"诊断失败，请稍后重试"}' },
    // diagnose_app — 4 个分支
    { tool_name: 'diagnose_app', match: 'issue_type == "app_locked"', response: '{"success":true,"issue_type":"app_locked","diagnostic_steps":[{"step":"账号状态","status":"error","detail":"账号已被锁定","action":"需联系安全团队解锁"}],"conclusion":"账号被锁定","escalation_path":"security_team","customer_actions":["联系客服热线10000","携带身份证到营业厅"]}' },
    { tool_name: 'diagnose_app', match: 'issue_type == "login_failed"', response: '{"success":true,"issue_type":"login_failed","diagnostic_steps":[{"step":"登录历史","status":"warning","detail":"连续3次密码错误","action":"重置密码"}],"conclusion":"密码错误次数过多","escalation_path":"self_service","customer_actions":["通过App找回密码","使用短信验证码登录"]}' },
    { tool_name: 'diagnose_app', match: 'issue_type == "device_incompatible"', response: '{"success":true,"issue_type":"device_incompatible","diagnostic_steps":[{"step":"App版本","status":"error","detail":"当前版本3.0.0，最新3.5.0","action":"请更新至最新版本"}],"conclusion":"App版本过低","escalation_path":"self_service","customer_actions":["前往应用商店更新"]}' },
    { tool_name: 'diagnose_app', match: 'issue_type == "suspicious_activity"', response: '{"success":true,"issue_type":"suspicious_activity","diagnostic_steps":[{"step":"设备安全","status":"error","detail":"检测到异常登录地点","action":"建议修改密码并开启双重验证"}],"conclusion":"存在异常活动","escalation_path":"security_team","customer_actions":["立即修改密码","检查账户是否有异常操作"]}' },
    { tool_name: 'diagnose_app', match: '', response: '{"success":true,"diagnostic_steps":[{"step":"全部检查","status":"ok","detail":"未发现异常","action":""}],"conclusion":"App运行正常","escalation_path":"self_service","customer_actions":[]}' },
  ]);

  const outboundMockRules = JSON.stringify([
    // record_call_result — 始终成功
    { tool_name: 'record_call_result', match: '', response: '{"success":true,"message":"通话结果已记录"}' },
    // send_followup_sms
    { tool_name: 'send_followup_sms', match: 'phone == "13900000099"', response: '{"success":false,"message":"短信发送失败，号码不可达"}' },
    { tool_name: 'send_followup_sms', match: 'sms_type == "payment_link"', response: '{"success":true,"message":"还款链接短信已发送"}' },
    { tool_name: 'send_followup_sms', match: 'sms_type == "plan_detail"', response: '{"success":true,"message":"套餐详情短信已发送"}' },
    { tool_name: 'send_followup_sms', match: '', response: '{"success":true,"message":"短信已发送"}' },
    // create_callback_task
    { tool_name: 'create_callback_task', match: '', response: '{"success":true,"callback_task_id":"CB-MOCK-001","message":"回访任务已创建"}' },
    // record_marketing_result
    { tool_name: 'record_marketing_result', match: '', response: '{"success":true,"message":"营销结果已记录"}' },
  ]);

  const accountMockRules = JSON.stringify([
    // verify_identity
    { tool_name: 'verify_identity', match: 'otp == "1234"', response: '{"success":true,"verified":true,"customer_name":"张三","message":"身份验证通过"}' },
    { tool_name: 'verify_identity', match: 'otp == "0000"', response: '{"success":true,"verified":true,"customer_name":"用户","message":"身份验证通过"}' },
    { tool_name: 'verify_identity', match: '', response: '{"success":false,"verified":false,"message":"验证码错误，请重新输入"}' },
    // check_account_balance
    { tool_name: 'check_account_balance', match: 'phone == "13800000003"', response: '{"success":true,"phone":"13800000003","balance":-23.5,"has_arrears":true,"arrears_amount":23.5,"status":"suspended","message":"账户存在欠费 ¥23.50，需先缴清欠费才能办理停机"}' },
    { tool_name: 'check_account_balance', match: 'phone == "13800000001"', response: '{"success":true,"phone":"13800000001","balance":45.8,"has_arrears":false,"arrears_amount":0,"status":"active","message":"账户余额 ¥45.80，无欠费"}' },
    { tool_name: 'check_account_balance', match: '', response: '{"success":true,"balance":0,"has_arrears":false,"arrears_amount":0,"status":"active","message":"账户余额 ¥0.00，无欠费"}' },
    // check_contracts
    { tool_name: 'check_contracts', match: 'phone == "13800000001"', response: '{"success":true,"phone":"13800000001","contracts":[{"contract_id":"CT001","name":"24个月合约套餐","end_date":"2027-06-30","penalty":200,"risk_level":"high"}],"has_active_contracts":true,"has_high_risk":true,"message":"存在高风险合约，停机需支付违约金 ¥200"}' },
    { tool_name: 'check_contracts', match: 'phone == "13800000002"', response: '{"success":true,"phone":"13800000002","contracts":[],"has_active_contracts":false,"has_high_risk":false,"message":"无有效合约，可直接办理停机"}' },
    { tool_name: 'check_contracts', match: '', response: '{"success":true,"contracts":[],"has_active_contracts":false,"has_high_risk":false,"message":"无有效合约"}' },
    // apply_service_suspension
    { tool_name: 'apply_service_suspension', match: 'phone == "13800000003"', response: '{"success":false,"message":"该号码已处于停机状态"}' },
    { tool_name: 'apply_service_suspension', match: '', response: '{"success":true,"phone":"13800000001","suspension_type":"temporary","effective_date":"2026-03-18","resume_deadline":"2026-06-16","message":"临时停机已生效，请在 2026-06-16 前办理复机"}' },
  ]);

  db.insert(mcpServers).values([
    {
      id: 'mcp-user-info', name: 'user-info-service',
      description: '用户信息服务（用户查询、账单、套餐）',
      transport: 'http', status: 'active', enabled: true,
      url: 'http://127.0.0.1:18003/mcp',
      tools_json: JSON.stringify([
        { name: 'query_subscriber', description: '根据手机号查询电信用户信息（套餐、状态、余额、流量使用情况）', inputSchema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' } }, required: ['phone'] } },
        { name: 'query_bill', description: '查询用户指定月份的账单明细（月费、流量费、通话费、增值业务费、税费）', inputSchema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' }, month: { type: 'string', description: '账单月份，格式 YYYY-MM' } }, required: ['phone'] } },
        { name: 'query_plans', description: '获取所有可用套餐列表，或查询指定套餐详情', inputSchema: { type: 'object', properties: { plan_id: { type: 'string', description: '套餐 ID，不传则返回所有套餐列表' } } } },
      ]),
      mock_rules: userInfoMockRules,
      created_at: now, updated_at: now,
    },
    {
      id: 'mcp-business', name: 'business-service',
      description: '业务办理服务（退订、开发票）',
      transport: 'http', status: 'active', enabled: true,
      url: 'http://127.0.0.1:18004/mcp',
      tools_json: JSON.stringify([
        { name: 'cancel_service', description: '退订用户已订阅的增值业务', inputSchema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' }, service_id: { type: 'string', description: '要退订的业务 ID（如 video_pkg、sms_100）' } }, required: ['phone', 'service_id'] } },
        { name: 'issue_invoice', description: '为指定用户的指定月份账单开具电子发票', inputSchema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' }, month: { type: 'string', description: '账单月份，格式 YYYY-MM' }, email: { type: 'string', description: '发票接收邮箱' } }, required: ['phone', 'month', 'email'] } },
      ]),
      mock_rules: businessMockRules,
      created_at: now, updated_at: now,
    },
    {
      id: 'mcp-diagnosis', name: 'diagnosis-service',
      description: '故障诊断服务（网络诊断、App诊断）',
      transport: 'http', status: 'active', enabled: true,
      url: 'http://127.0.0.1:18005/mcp',
      tools_json: JSON.stringify([
        { name: 'diagnose_network', description: '对指定手机号进行网络故障诊断', inputSchema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' }, issue_type: { type: 'string', enum: ['no_signal', 'slow_data', 'call_drop', 'no_network'], description: '故障类型' }, lang: { type: 'string', enum: ['zh', 'en'], description: '语言' } }, required: ['phone', 'issue_type'] } },
        { name: 'diagnose_app', description: '对指定手机号的营业厅 App 进行问题诊断', inputSchema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' }, issue_type: { type: 'string', enum: ['app_locked', 'login_failed', 'device_incompatible', 'suspicious_activity'], description: '问题类型' } }, required: ['phone', 'issue_type'] } },
      ]),
      mock_rules: diagnosisMockRules,
      created_at: now, updated_at: now,
    },
    {
      id: 'mcp-outbound', name: 'outbound-service',
      description: '外呼服务（通话记录、短信、回访、营销记录）',
      transport: 'http', status: 'active', enabled: true,
      url: 'http://127.0.0.1:18006/mcp',
      tools_json: JSON.stringify([
        { name: 'record_call_result', description: '记录本次外呼通话结果', inputSchema: { type: 'object', properties: { result: { type: 'string', enum: ['ptp', 'refusal', 'dispute', 'no_answer', 'busy', 'converted', 'callback', 'not_interested', 'non_owner', 'verify_failed'], description: '通话结果' }, remark: { type: 'string', description: '备注' }, callback_time: { type: 'string', description: '回拨时间' }, ptp_date: { type: 'string', description: '承诺还款日期' } }, required: ['result'] } },
        { name: 'send_followup_sms', description: '向客户发送跟进短信', inputSchema: { type: 'object', properties: { phone: { type: 'string', description: '客户手机号' }, sms_type: { type: 'string', enum: ['payment_link', 'plan_detail', 'callback_reminder', 'product_detail'], description: '短信类型' } }, required: ['phone', 'sms_type'] } },
        { name: 'create_callback_task', description: '创建回访任务', inputSchema: { type: 'object', properties: { original_task_id: { type: 'string', description: '原始任务 ID' }, callback_phone: { type: 'string', description: '回访电话' }, preferred_time: { type: 'string', description: '客户期望的回访时间' }, customer_name: { type: 'string', description: '客户姓名' }, product_name: { type: 'string', description: '关联产品名' } }, required: ['original_task_id', 'callback_phone', 'preferred_time'] } },
        { name: 'record_marketing_result', description: '记录营销外呼的通话结果', inputSchema: { type: 'object', properties: { campaign_id: { type: 'string', description: '营销活动 ID' }, phone: { type: 'string', description: '客户手机号' }, result: { type: 'string', enum: ['converted', 'callback', 'not_interested', 'no_answer', 'busy', 'wrong_number', 'dnd'], description: '营销结果' }, callback_time: { type: 'string', description: '回拨时间' } }, required: ['campaign_id', 'phone', 'result'] } },
      ]),
      mock_rules: outboundMockRules,
      created_at: now, updated_at: now,
    },
    {
      id: 'mcp-account', name: 'account-service',
      description: '账户操作服务（身份验证、余额、合约、停机）',
      transport: 'http', status: 'active', enabled: true,
      url: 'http://127.0.0.1:18007/mcp',
      tools_json: JSON.stringify([
        { name: 'verify_identity', description: '验证用户身份（通过短信验证码）', inputSchema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' }, otp: { type: 'string', description: '短信验证码' } }, required: ['phone', 'otp'] } },
        { name: 'check_account_balance', description: '查询用户账户余额和欠费状态', inputSchema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' } }, required: ['phone'] } },
        { name: 'check_contracts', description: '查询用户当前有效合约列表', inputSchema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' } }, required: ['phone'] } },
        { name: 'apply_service_suspension', description: '执行停机操作', inputSchema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' }, suspension_type: { type: 'string', enum: ['temporary', 'permanent'], description: '停机类型，默认临时停机' } }, required: ['phone'] } },
      ]),
      mock_rules: accountMockRules,
      created_at: now, updated_at: now,
    },
  ]).onConflictDoNothing().run();

  // 补全 Mock 规则：如果已有记录的 mock_rules 为空或规则数少于 seed 定义，用 seed 覆盖
  const mcpSeedRules: Record<string, string> = {
    'mcp-user-info': userInfoMockRules,
    'mcp-business': businessMockRules,
    'mcp-diagnosis': diagnosisMockRules,
    'mcp-outbound': outboundMockRules,
    'mcp-account': accountMockRules,
  };
  for (const [id, seedRules] of Object.entries(mcpSeedRules)) {
    const row = db.select().from(mcpServers).where(eq(mcpServers.id, id)).get();
    if (!row) continue;
    const existingRules = row.mock_rules ? JSON.parse(row.mock_rules) : [];
    const seedRulesParsed = JSON.parse(seedRules);
    if (existingRules.length < seedRulesParsed.length) {
      db.update(mcpServers).set({ mock_rules: seedRules }).where(eq(mcpServers.id, id)).run();
    }
  }

  // 补全工具定义：如果已有记录的 tools_json 中工具缺少 inputSchema，用 seed 补全
  const mcpSeedTools: Record<string, string> = {};
  // 从 insert values 中提取 seed 的 tools_json（重新构建，避免重复定义）
  for (const row of db.select().from(mcpServers).all()) {
    // 只处理 seed 创建的 5 个 server
    if (!['mcp-user-info', 'mcp-business', 'mcp-diagnosis', 'mcp-outbound', 'mcp-account'].includes(row.id)) continue;
    if (!row.tools_json) continue;
    const tools = JSON.parse(row.tools_json) as Array<{ name: string; inputSchema?: Record<string, unknown> }>;
    const hasEmptySchema = tools.some(t => !t.inputSchema || Object.keys(t.inputSchema).length === 0);
    if (!hasEmptySchema) continue;
    // Need to backfill — find the seed definition from the insert above
    mcpSeedTools[row.id] = row.id; // mark for update
  }
  // Seed tool definitions with full inputSchema
  const seedToolDefs: Record<string, Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>> = {
    'mcp-user-info': [
      { name: 'query_subscriber', description: '根据手机号查询电信用户信息（套餐、状态、余额、流量使用情况）', inputSchema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' } }, required: ['phone'] } },
      { name: 'query_bill', description: '查询用户指定月份的账单明细（月费、流量费、通话费、增值业务费、税费）', inputSchema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' }, month: { type: 'string', description: '账单月份，格式 YYYY-MM' } }, required: ['phone'] } },
      { name: 'query_plans', description: '获取所有可用套餐列表，或查询指定套餐详情', inputSchema: { type: 'object', properties: { plan_id: { type: 'string', description: '套餐 ID，不传则返回所有套餐列表' } } } },
    ],
    'mcp-business': [
      { name: 'cancel_service', description: '退订用户已订阅的增值业务', inputSchema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' }, service_id: { type: 'string', description: '要退订的业务 ID（如 video_pkg、sms_100）' } }, required: ['phone', 'service_id'] } },
      { name: 'issue_invoice', description: '为指定用户的指定月份账单开具电子发票', inputSchema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' }, month: { type: 'string', description: '账单月份，格式 YYYY-MM' }, email: { type: 'string', description: '发票接收邮箱' } }, required: ['phone', 'month', 'email'] } },
    ],
    'mcp-diagnosis': [
      { name: 'diagnose_network', description: '对指定手机号进行网络故障诊断', inputSchema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' }, issue_type: { type: 'string', enum: ['no_signal', 'slow_data', 'call_drop', 'no_network'], description: '故障类型' }, lang: { type: 'string', enum: ['zh', 'en'], description: '语言' } }, required: ['phone', 'issue_type'] } },
      { name: 'diagnose_app', description: '对指定手机号的营业厅 App 进行问题诊断', inputSchema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' }, issue_type: { type: 'string', enum: ['app_locked', 'login_failed', 'device_incompatible', 'suspicious_activity'], description: '问题类型' } }, required: ['phone', 'issue_type'] } },
    ],
    'mcp-outbound': [
      { name: 'record_call_result', description: '记录本次外呼通话结果', inputSchema: { type: 'object', properties: { result: { type: 'string', enum: ['ptp', 'refusal', 'dispute', 'no_answer', 'busy', 'converted', 'callback', 'not_interested', 'non_owner', 'verify_failed'], description: '通话结果' }, remark: { type: 'string', description: '备注' }, callback_time: { type: 'string', description: '回拨时间' }, ptp_date: { type: 'string', description: '承诺还款日期' } }, required: ['result'] } },
      { name: 'send_followup_sms', description: '向客户发送跟进短信', inputSchema: { type: 'object', properties: { phone: { type: 'string', description: '客户手机号' }, sms_type: { type: 'string', enum: ['payment_link', 'plan_detail', 'callback_reminder', 'product_detail'], description: '短信类型' } }, required: ['phone', 'sms_type'] } },
      { name: 'create_callback_task', description: '创建回访任务', inputSchema: { type: 'object', properties: { original_task_id: { type: 'string', description: '原始任务 ID' }, callback_phone: { type: 'string', description: '回访电话' }, preferred_time: { type: 'string', description: '客户期望的回访时间' }, customer_name: { type: 'string', description: '客户姓名' }, product_name: { type: 'string', description: '关联产品名' } }, required: ['original_task_id', 'callback_phone', 'preferred_time'] } },
      { name: 'record_marketing_result', description: '记录营销外呼的通话结果', inputSchema: { type: 'object', properties: { campaign_id: { type: 'string', description: '营销活动 ID' }, phone: { type: 'string', description: '客户手机号' }, result: { type: 'string', enum: ['converted', 'callback', 'not_interested', 'no_answer', 'busy', 'wrong_number', 'dnd'], description: '营销结果' }, callback_time: { type: 'string', description: '回拨时间' } }, required: ['campaign_id', 'phone', 'result'] } },
    ],
    'mcp-account': [
      { name: 'verify_identity', description: '验证用户身份（通过短信验证码）', inputSchema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' }, otp: { type: 'string', description: '短信验证码' } }, required: ['phone', 'otp'] } },
      { name: 'check_account_balance', description: '查询用户账户余额和欠费状态', inputSchema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' } }, required: ['phone'] } },
      { name: 'check_contracts', description: '查询用户当前有效合约列表', inputSchema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' } }, required: ['phone'] } },
      { name: 'apply_service_suspension', description: '执行停机操作', inputSchema: { type: 'object', properties: { phone: { type: 'string', description: '用户手机号' }, suspension_type: { type: 'string', enum: ['temporary', 'permanent'], description: '停机类型，默认临时停机' } }, required: ['phone'] } },
    ],
  };
  for (const [id, seedTools] of Object.entries(seedToolDefs)) {
    const row = db.select().from(mcpServers).where(eq(mcpServers.id, id)).get();
    if (!row) continue;
    const existing = row.tools_json ? JSON.parse(row.tools_json) as Array<{ name: string; inputSchema?: Record<string, unknown> }> : [];
    const hasEmptySchema = existing.some(t => !t.inputSchema || Object.keys(t.inputSchema).length === 0);
    if (!hasEmptySchema && existing.length >= seedTools.length) continue;
    // Merge: update inputSchema for existing tools, add missing tools
    const seedMap = new Map(seedTools.map(t => [t.name, t]));
    const merged = existing.map(t => {
      const seed = seedMap.get(t.name);
      if (seed && (!t.inputSchema || Object.keys(t.inputSchema).length === 0)) {
        return { ...t, inputSchema: seed.inputSchema, description: t.description || seed.description };
      }
      return t;
    });
    // Add tools that exist in seed but not in DB
    for (const st of seedTools) {
      if (!existing.some(t => t.name === st.name)) merged.push(st);
    }
    db.update(mcpServers).set({ tools_json: JSON.stringify(merged) }).where(eq(mcpServers.id, id)).run();
  }

  console.log('[seed] MCP Server 注册数据写入完成（Mock 规则与工具 Schema 已补全）');

  // ── 10. 技能注册 + v1 版本快照（upsert：已存在则跳过）─────────────────────
  console.log('[seed] 初始化技能注册表和版本快照...');

  const { initializeSkillVersion } = await import('../agent/km/skills/version-manager');

  const bizSkills = [
    { id: 'bill-inquiry',         desc: '电信账单查询技能' },
    { id: 'fault-diagnosis',      desc: '电信网络故障排查技能' },
    { id: 'outbound-collection',  desc: '外呼催收技能' },
    { id: 'outbound-marketing',   desc: '外呼营销技能' },
    { id: 'plan-inquiry',         desc: '套餐查询与推荐技能' },
    { id: 'service-cancel',       desc: '增值业务退订技能' },
    { id: 'service-suspension',   desc: '停机保号技能' },
    { id: 'telecom-app',          desc: '营业厅App问题诊断技能' },
  ];

  for (const skill of bizSkills) {
    await initializeSkillVersion(skill.id, skill.desc);
  }
  console.log(`[seed] 技能注册完成：${bizSkills.length} 个技能已发布 (v1)`);

  console.log('[seed] 初始化完成！');
  process.exit(0);
}

seed().catch((err) => {
  console.error('[seed] 失败:', err);
  process.exit(1);
});
