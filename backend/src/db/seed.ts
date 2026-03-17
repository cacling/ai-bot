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

  // ── 9. MCP Server 注册数据 ─────────────────────────────────────────────────
  console.log('[seed] 写入 MCP Server 注册数据...');
  db.delete(mcpServers).run();
  db.insert(mcpServers).values([
    {
      id: 'mcp-telecom',
      name: 'telecom-service',
      description: '电信业务系统 MCP 服务（用户查询、账单、套餐、退订、故障诊断）',
      transport: 'http',
      status: 'active',
      enabled: true,
      url: 'http://localhost:8003/mcp',
      tools_cache: JSON.stringify([
        { name: 'query_subscriber', description: '根据手机号查询电信用户信息', inputSchema: {} },
        { name: 'query_bill', description: '查询用户指定月份的账单明细', inputSchema: {} },
        { name: 'query_plans', description: '获取所有可用套餐列表或查询指定套餐详情', inputSchema: {} },
        { name: 'cancel_service', description: '退订用户已订阅的增值业务', inputSchema: {} },
        { name: 'diagnose_network', description: '对指定手机号进行网络故障诊断', inputSchema: {} },
        { name: 'diagnose_app', description: '对指定手机号的营业厅 App 进行问题诊断', inputSchema: {} },
        { name: 'issue_invoice', description: '为指定用户的指定月份账单开具电子发票', inputSchema: {} },
      ]),
      created_at: now,
      updated_at: now,
    },
    {
      id: 'mcp-outbound',
      name: 'outbound-service',
      description: '外呼场景 MCP 服务（通话记录、短信发送、回访任务、营销记录）',
      transport: 'http',
      status: 'active',
      enabled: true,
      url: 'http://localhost:8004/mcp',
      tools_cache: JSON.stringify([
        { name: 'record_call_result', description: '记录本次外呼通话结果', inputSchema: {} },
        { name: 'send_followup_sms', description: '向客户发送跟进短信', inputSchema: {} },
        { name: 'create_callback_task', description: '创建回访任务', inputSchema: {} },
        { name: 'record_marketing_result', description: '记录营销外呼的通话结果', inputSchema: {} },
      ]),
      created_at: now,
      updated_at: now,
    },
    {
      id: 'mcp-account',
      name: 'account-service',
      description: '账户操作 MCP 服务（身份验证、余额查询、合约查询、停机申请）',
      transport: 'http',
      status: 'active',
      enabled: true,
      url: 'http://localhost:8005/mcp',
      tools_cache: JSON.stringify([
        { name: 'verify_identity', description: '验证用户身份（通过短信验证码）', inputSchema: {} },
        { name: 'check_account_balance', description: '查询用户账户余额和欠费状态', inputSchema: {} },
        { name: 'check_contracts', description: '查询用户当前有效合约列表', inputSchema: {} },
        { name: 'apply_service_suspension', description: '执行停机操作', inputSchema: {} },
      ]),
      created_at: now,
      updated_at: now,
    },
  ]).run();
  console.log('[seed] MCP Server 注册数据写入完成：3 个 Server');

  console.log('[seed] 初始化完成！');
  process.exit(0);
}

seed().catch((err) => {
  console.error('[seed] 失败:', err);
  process.exit(1);
});
