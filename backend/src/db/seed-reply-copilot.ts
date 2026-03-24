/**
 * seed-reply-copilot.ts — Seed 5 MVP structured knowledge assets for Reply Copilot
 *
 * Run: cd backend && bun run src/db/seed-reply-copilot.ts
 */
import { db } from '.';
import { kmCandidates, kmAssets, kmAssetVersions, kmReviewPackages } from './schema';
import { nanoid } from './nanoid';

const SCENES = [
  {
    q: '套餐升级后为什么没生效？',
    a: '套餐变更通常在下一个计费周期生效，即次月1日零点。如果是立即生效型套餐，请核实办理渠道和确认短信。',
    scene: { code: 'plan_change_not_effective', label: '套餐生效异常', risk: 'medium' },
    required_slots: ['手机号', '办理时间', '办理渠道', '是否收到确认短信'],
    recommended_terms: ['以系统记录为准', '下个计费周期生效', '为您核实办理状态'],
    forbidden_terms: ['系统出错了', '肯定已经生效', '你自己操作有问题'],
    reply_options: [
      { label: '标准版', text: '已为您查询到套餐变更记录，根据规则该变更将在下一个计费周期（次月1日）生效。如需确认具体生效时间，请提供办理时间和渠道，我为您进一步核实。' },
      { label: '安抚版', text: '理解您对套餐变更的关注，这边先帮您核实一下办理记录和生效规则，尽快给您一个明确的答复。' },
    ],
    next_actions: ['查询套餐变更记录', '确认生效规则', '必要时发起人工复核工单'],
    sources: ['套餐变更生效规则 v2026.02'],
    tags: ['套餐', '生效', '升级', '降档', '变更'],
  },
  {
    q: '流量用得很快，是不是乱扣费了？',
    a: '请先确认是否有大流量应用在后台运行。可以查询详单核实流量去向。如确有异常，将为您发起争议核查。',
    scene: { code: 'billing_traffic_dispute', label: '流量/扣费争议', risk: 'medium' },
    required_slots: ['手机号', '异常月份', '是否开启了移动数据'],
    recommended_terms: ['以账单和详单为准', '为您核实流量明细', '按规则处理'],
    forbidden_terms: ['肯定是您自己用了', '不可能扣错', '系统不会出错'],
    reply_options: [
      { label: '标准版', text: '已为您查询到本月流量使用明细，以详单数据为准。如果您对某些流量记录有疑问，可以指定时段，我为您进一步核实。' },
      { label: '安抚版', text: '理解您对扣费的担忧，这边先帮您调取详细的流量使用记录，逐项核实是否存在异常扣费情况。' },
    ],
    next_actions: ['查询流量详单', '核实套外流量扣费', '必要时发起争议工单'],
    sources: ['计费规则与争议处理规范 第5章'],
    tags: ['流量', '扣费', '争议', '详单', '异常'],
  },
  {
    q: '充值后为什么还是停机？',
    a: '充值到账后系统需要一定时间处理复机，通常几分钟到半小时。如超时未恢复，需核查充值流水和复机状态。',
    scene: { code: 'recharge_no_restore', label: '充值未复机', risk: 'medium' },
    required_slots: ['手机号', '充值时间', '充值渠道', '当前停机提示'],
    recommended_terms: ['到账状态核查中', '复机存在处理时延', '以系统恢复结果为准'],
    forbidden_terms: ['充值失败了吧', '马上恢复', '系统故障'],
    reply_options: [
      { label: '标准版', text: '这边先帮您核实充值到账和复机状态。为尽快确认处理进度，麻烦提供一下手机号和充值时间。' },
      { label: '安抚版', text: '理解您现在无法通话会比较着急，这边先马上帮您查一下充值和复机状态，尽快帮您解决。' },
    ],
    next_actions: ['查充值流水', '查停复机状态', '超时则发起复机异常工单'],
    sources: ['停复机规则 v2026.03', '充值到账时效规范'],
    tags: ['充值', '停机', '复机', '到账', '缴费'],
  },
  {
    q: '宽带断网了怎么办？',
    a: '请先检查光猫指示灯状态。如果是区域性故障，会有修复时间预估。如果是个别故障，可以远程重启或安排上门维修。',
    scene: { code: 'broadband_outage', label: '宽带断网', risk: 'low' },
    required_slots: ['宽带账号或手机号', '断网时间', '光猫指示灯状态', '是否多台设备均无法上网'],
    recommended_terms: ['先帮您排查', '如需上门维修将为您预约', '预计恢复时间'],
    forbidden_terms: ['肯定是你路由器的问题', '我们这边没问题', '不归我们管'],
    reply_options: [
      { label: '标准版', text: '了解到您的宽带无法上网，先帮您排查一下。请问光猫的指示灯是什么状态？是否所有设备都无法连接？' },
      { label: '安抚版', text: '理解断网给您带来了不便，这边先帮您查一下是否有区域性故障，同时也排查一下您的线路状态。' },
    ],
    next_actions: ['查询区域告警', '远程重启光猫', '必要时预约上门维修'],
    sources: ['宽带故障处理规范', '装维工单流程'],
    tags: ['宽带', '断网', '光猫', '网速', '故障'],
  },
  {
    q: '我要投诉，态度太差了要赔偿',
    a: '非常抱歉给您带来了不好的体验。会认真记录您的反馈，按投诉处理流程进行核查和回复。',
    scene: { code: 'complaint_compensation', label: '投诉赔付争议', risk: 'high' },
    required_slots: ['手机号', '投诉事由', '涉及的服务人员或时间', '期望的处理结果'],
    recommended_terms: ['为您升级核查', '认真对待您的反馈', '按规则处理', '预计时效'],
    forbidden_terms: ['不可能赔', '这个不归我们管', '你自己的问题', '保证今天解决'],
    reply_options: [
      { label: '标准版', text: '非常抱歉给您带来了不好的体验。已认真记录您的反馈，将按投诉处理流程为您升级核查，预计会在24小时内给您回复处理结果。' },
      { label: '安抚版', text: '非常理解您的心情，对于您反映的问题我们非常重视。这边会立即为您升级处理，指定专人跟进，尽快给您一个满意的答复。' },
    ],
    next_actions: ['创建投诉工单', '转二线主管审核', '48小时内回访'],
    sources: ['投诉处理规范 v2026.01', '赔付审批流程'],
    tags: ['投诉', '赔偿', '态度', '补偿', '减免', '升级'],
  },
];

async function seed() {
  console.log('Seeding Reply Copilot knowledge assets...');
  const now = new Date().toISOString();
  const pkgId = nanoid();
  const candidateIds: string[] = [];

  for (const s of SCENES) {
    const candId = nanoid();
    const assetId = nanoid();
    const versionId = nanoid();
    candidateIds.push(candId);

    const structured = JSON.stringify({
      scene: s.scene,
      required_slots: s.required_slots,
      recommended_terms: s.recommended_terms,
      forbidden_terms: s.forbidden_terms,
      reply_options: s.reply_options,
      next_actions: s.next_actions,
      sources: s.sources,
      retrieval_tags: s.tags,
    });

    await db.insert(kmCandidates).values({
      id: candId, source_type: 'manual', normalized_q: s.q, draft_answer: s.a,
      category: s.scene.label, risk_level: s.scene.risk, scene_code: s.scene.code,
      retrieval_tags_json: JSON.stringify(s.tags), structured_json: structured,
      gate_evidence: 'pass', gate_conflict: 'pass', gate_ownership: 'pass',
      status: 'published', review_pkg_id: pkgId, created_by: 'seed',
      created_at: now, updated_at: now,
    });

    await db.insert(kmAssets).values({
      id: assetId, title: s.q, asset_type: 'qa', status: 'online',
      current_version: 1, owner: 'seed', created_at: now, updated_at: now,
    });

    await db.insert(kmAssetVersions).values({
      id: versionId, asset_id: assetId, version_no: 1,
      content_snapshot: JSON.stringify({ q: s.q, a: s.a }),
      structured_snapshot_json: structured,
      effective_from: now, created_at: now,
    });

    console.log(`  + ${s.scene.label} (${s.scene.code})`);
  }

  await db.insert(kmReviewPackages).values({
    id: pkgId, title: 'Reply Copilot MVP - 5场景',
    status: 'published', risk_level: 'medium',
    candidate_ids_json: JSON.stringify(candidateIds),
    created_by: 'seed', created_at: now, updated_at: now,
  });

  console.log(`Seeded ${SCENES.length} Reply Copilot assets`);
}

seed().catch(console.error);
