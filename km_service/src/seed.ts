/**
 * seed-reply-copilot.ts — Seed 10 telecom structured knowledge assets for Reply Copilot
 *
 * Run standalone: cd backend && bun run src/db/seed-reply-copilot.ts
 */
import { db, kmCandidates, kmAssets, kmAssetVersions, kmReviewPackages, kmDocuments, kmDocVersions, kmEvidenceRefs } from './db.js';
import { nanoid } from './nanoid.js';

interface ReplySceneSeed {
  category: string;
  standard_q: string;
  expanded_questions: string[];
  source_ref_id: string;
  evidence_locator: string;
  a: string;
  scene: { code: string; label: string; risk: 'low' | 'medium' | 'high' };
  required_slots: string[];
  recommended_terms: string[];
  forbidden_terms: string[];
  reply_options: Array<{ label: string; text: string }>;
  next_actions: string[];
  sources: string[];
  tags: string[];
  // Agent Copilot extended fields
  knowledge_type?: 'reply' | 'rag_answer' | 'action' | 'risk' | 'followup';
  agent_answer?: string;
  customer_reply_followup?: string;
  customer_reply_risk_safe?: string;
  caution_notes?: string[];
  escalation_conditions?: string[];
  citations?: Array<{ title: string; version: string; anchor: string }>;
  fallback_policy?: 'suggest_supplement' | 'show_related' | 'escalate';
  applicable_scope?: Record<string, string[]>;
  emotion_hints?: string[];
}

export const REPLY_COPILOT_SCENES: ReplySceneSeed[] = [
  {
    category: '资费类',
    standard_q: '5G套餐变更后何时生效？',
    expanded_questions: [
      '我昨天办了5G套餐，怎么今天还是原来的流量和网速？',
      '5G套餐不是已经办成功了吗，为什么现在还是原来的套餐？',
      '我升级了5G套餐，流量和速率怎么还没变？',
      '昨天改了5G套餐，今天看起来一点都没生效，这是为什么？',
      '我新办的5G套餐什么时候才能正式生效？',
      '套餐已经受理了，怎么还是原来的网速和流量包？',
      '5G套餐改完后多久能看到流量和网速变化？',
      '我办理了5G升级，为什么目前还按旧套餐显示？',
      '5G套餐不是说办好了，怎么今天用着还是老样子？',
      '昨天换了5G套餐，今天还没生效正常吗？',
    ],
    source_ref_id: 'dv-5g-v1',
    evidence_locator: '## 场景 1：5G套餐变更生效时效',
    a: '套餐变更通常分为立即生效和次月生效两类，需要结合受理记录、办理渠道和确认短信判断实际生效时间。',
    scene: { code: 'plan_change_effective_delay', label: '套餐变更 / 生效时效', risk: 'medium' },
    required_slots: ['手机号', '办理时间', '办理渠道', '办理的是变更还是新开', '是否收到办理成功短信'],
    recommended_terms: ['已受理', '预计生效时间', '以系统生效结果为准'],
    forbidden_terms: ['系统没同步', '今天肯定能好'],
    reply_options: [
      { label: '标准版', text: '已了解您对套餐暂未生效的疑问。这边先帮您核实5G套餐的受理记录和生效规则，套餐可能为立即生效或次月生效，具体以系统生效结果为准。麻烦提供一下手机号、办理时间和渠道，我继续为您确认。' },
      { label: '安抚版', text: '理解您已经办理套餐但体验还没变化会比较着急，这边先帮您查一下套餐是否已受理成功，以及预计生效时间，确认后第一时间告诉您下一步怎么处理。' },
    ],
    next_actions: ['查询套餐受理记录', '核对套餐生效规则', '必要时发起套餐生效复核'],
    sources: ['5G套餐资费说明（2026Q1）', '套餐变更生效规则 v2026.03'],
    tags: ['5G套餐', '套餐变更', '生效', '网速', '流量', '未生效'],
    knowledge_type: 'reply',
    agent_answer: '5G套餐变更分"立即生效"和"次月生效"两种，取决于办理渠道和套餐类型。线上渠道（APP/小程序）大多次月1号生效，营业厅办理可能当日生效。需核查受理记录中的"生效类型"字段。若超时未生效，可发起套餐生效复核工单。',
    customer_reply_followup: '请问您是通过哪个渠道办理的？APP、小程序还是营业厅？另外办理时有没有收到确认短信？',
    customer_reply_risk_safe: '套餐变更的生效时间确实因渠道和类型有所不同，这边需要先帮您核实具体情况，暂时无法给出确定的生效时间，请您稍等。',
    caution_notes: ['不要承诺具体生效时间', '不要说"系统延迟"等模糊说法', '如客户已等超过3个工作日需升级处理'],
    escalation_conditions: ['客户等待超过3个工作日仍未生效', '受理记录显示成功但系统未切换'],
    citations: [{ title: '5G套餐资费说明（2026Q1）', version: 'v2026.03', anchor: '§3.2 生效规则' }],
    fallback_policy: 'suggest_supplement',
    applicable_scope: { channels: ['online', 'voice'] },
    emotion_hints: ['焦虑', '不满'],
  },
  {
    category: '资费类',
    standard_q: '流量异常消耗和额外扣费如何核查？',
    expanded_questions: [
      '我这个月没怎么用，为什么流量一下子就没了，还扣了好多费？',
      '我明明没怎么上网，怎么流量已经快用完了？',
      '这个月流量消耗特别快，是不是乱扣费了？',
      '我流量突然没了，还多出很多费用，帮我查一下。',
      '没怎么用手机，为什么账单里多了这么多流量费用？',
      '我感觉流量被异常消耗了，能不能核对一下详单？',
      '怎么这几天流量掉得这么快，还产生套外费用了？',
      '我没有重度使用，为什么会扣这么多流量费？',
      '流量用超得太离谱了，我怀疑计费有问题。',
      '这个月流量和扣费都不正常，想查一下原因。',
    ],
    source_ref_id: 'dv-billing-v1',
    evidence_locator: '## 场景 2：流量异常与资费争议核查',
    a: '需要结合套餐内流量、套外流量和增值业务详单核实异常消耗或套外计费情况。',
    scene: { code: 'traffic_usage_billing_dispute', label: '流量异常 / 资费争议', risk: 'medium' },
    required_slots: ['手机号', '异常发生时间', '是否开热点', '是否境外/异地使用', '是否收到流量提醒短信'],
    recommended_terms: ['流量使用明细', '套外计费', '以账单与详单为准'],
    forbidden_terms: ['肯定是您自己用了', '系统不会出错'],
    reply_options: [
      { label: '标准版', text: '已收到您对流量和费用异常的反馈，这边会从套餐内流量、套外计费和增值业务三部分为您核实，具体以账单与详单为准。麻烦提供手机号和异常发生的大致时间，我先帮您查明细。' },
      { label: '安抚版', text: '理解您看到流量突然用完又产生费用会担心，这边先帮您调取流量使用明细和账单情况，确认是否存在套外计费或其他异常，再给您明确处理路径。' },
    ],
    next_actions: ['查询流量详单', '核查套外计费记录', '必要时发起资费争议工单'],
    sources: ['计费规则与争议处理规范 第5章', '流量提醒与套外计费说明'],
    tags: ['流量', '扣费', '详单', '套外', '异常', '费用'],
    knowledge_type: 'reply',
    agent_answer: '流量异常需分三步核查：1）套餐内流量是否用尽（查详单）；2）是否有套外流量产生（查计费记录）；3）是否订购了增值业务自动扣费。常见原因包括后台应用消耗、热点共享、系统更新等。如客户对计费仍有异议，可发起资费争议工单。',
    customer_reply_followup: '方便告诉我您手机号和异常发生的大致时间吗？另外近期有没有开过热点或在境外使用？',
    customer_reply_risk_safe: '流量消耗的原因比较多样，这边需要调取详单逐一核实才能给出准确结论，暂时无法直接判断是否存在计费异常，请您理解。',
    caution_notes: ['不要直接否定客户感受', '不要说"系统不会出错"', '如存在实际计费差异需及时升级'],
    escalation_conditions: ['详单核查后确认计费差异', '客户三次来电反映同一问题'],
    citations: [{ title: '计费规则与争议处理规范', version: 'v2026.01', anchor: '第5章 流量争议' }],
    fallback_policy: 'suggest_supplement',
    applicable_scope: { channels: ['online', 'voice'] },
    emotion_hints: ['焦虑', '怀疑'],
  },
  {
    category: '资费类',
    standard_q: '套餐降档后当月仍按原套餐计费怎么办？',
    expanded_questions: [
      '我明明申请了降套餐，怎么这个月还是按原套餐扣费？',
      '套餐都已经降档了，为什么账单还是老套餐价格？',
      '我申请了改低套餐，怎么这月还没按新资费算？',
      '不是已经帮我降套餐了吗，为什么还是原来的月费？',
      '我改了便宜的套餐，为什么本月还是旧套餐在扣钱？',
      '套餐降下来了，但这个月账单怎么没变？',
      '降套餐后什么时候才会按新套餐收费？',
      '我已经办理降档，为什么还按以前的套餐标准计费？',
      '这个月明明申请了套餐变更，为什么还是老价格？',
      '我想确认一下，降套餐为什么没有立刻体现在本月费用里？',
    ],
    source_ref_id: 'dv-5g-v1',
    evidence_locator: '## 场景 2：套餐降档与账期计费',
    a: '套餐降档通常与账期绑定，需要结合受理时间和生效周期判断本月是否仍按原套餐计费。',
    scene: { code: 'plan_downgrade_billing_cycle', label: '套餐变更争议 / 生效周期说明', risk: 'medium' },
    required_slots: ['手机号', '申请变更时间', '变更前后套餐名称', '受理渠道', '是否收到变更确认短信'],
    recommended_terms: ['本月资费周期', '变更生效规则', '以受理记录为准'],
    forbidden_terms: ['您办晚了', '这个没办法'],
    reply_options: [
      { label: '标准版', text: '已了解您对降套餐后仍按原套餐扣费的疑问。套餐变更通常会和本月资费周期绑定，具体要以受理记录和生效规则为准。请您提供申请时间、变更前后套餐名称和办理渠道，我帮您核对本月与下月分别按什么标准计费。' },
      { label: '安抚版', text: '理解您已经申请降档却仍看到原套餐扣费会有疑惑，这边先帮您核实受理记录和生效周期，确认是否卡在当期账期边界，再给您清楚说明后续计费方式。' },
    ],
    next_actions: ['查询套餐变更工单', '核对账期与生效时间', '必要时发起计费复核'],
    sources: ['套餐变更生效规则 v2026.03', '计费账期说明'],
    tags: ['降套餐', '原套餐扣费', '账期', '生效周期', '资费周期', '套餐变更'],
  },
  {
    category: '资费类',
    standard_q: '充值后仍未复机如何处理？',
    expanded_questions: [
      '我刚充完话费，为什么还是停机，电话也打不出去？',
      '已经交了费，号码怎么还没有恢复正常使用？',
      '我充值成功了，为什么还是显示停机状态？',
      '刚缴完费还是不能打电话，这是什么情况？',
      '我都充上话费了，怎么还没给我复机？',
      '充值后多久能恢复通话？我现在还是停机。',
      '为什么我刚付款成功，手机还是打不出去电话？',
      '已经补缴欠费了，号码怎么还没有恢复？',
      '我充值以后还是不能用，是到账了但没复机吗？',
      '话费已经充了，停机状态还在，帮我查下原因。',
    ],
    source_ref_id: 'dv-billing-v1',
    evidence_locator: '## 场景 3：充值到账后未复机',
    a: '充值到账后复机通常存在处理时延，需要结合充值流水和停复机状态进一步核实。',
    scene: { code: 'recharge_restore_delay', label: '停复机异常 / 充值到账核查', risk: 'medium' },
    required_slots: ['手机号', '充值时间', '充值金额', '充值渠道', '当前停机提示内容'],
    recommended_terms: ['到账状态核查中', '复机存在处理时延', '以系统状态恢复为准'],
    forbidden_terms: ['充值失败了吧', '马上就恢复'],
    reply_options: [
      { label: '标准版', text: '已了解您充值后仍无法正常通话的情况，这边先帮您核实充值到账和停复机状态。充值到账后复机可能存在短暂处理时延，具体以系统状态恢复为准。麻烦提供手机号、充值时间和渠道，我先为您查一下。' },
      { label: '安抚版', text: '理解您现在电话打不出去会比较着急，这边马上帮您查充值到账和复机状态，确认后会第一时间告诉您预计恢复时间；如果超时未恢复，也会继续为您升级处理。' },
    ],
    next_actions: ['查询充值流水', '查询停复机状态', '超时则发起复机异常工单'],
    sources: ['停复机规则 v2026.03', '充值到账时效规范'],
    tags: ['充值', '停机', '复机', '打不出去', '到账', '缴费'],
  },
  {
    category: '网络类',
    standard_q: '宽带装机预约未按时上门怎么办？',
    expanded_questions: [
      '你们宽带师傅约了今天上门，到现在没人来，什么时候装？',
      '宽带安装预约的是今天，怎么一直没人联系我？',
      '师傅说今天来装宽带，现在还没到，想问下进度。',
      '我预约了宽带上门安装，结果今天没人上门怎么办？',
      '宽带装机已经超时了，能帮我催一下吗？',
      '预约好的装宽带时间过了，师傅为什么没来？',
      '今天本来安排装宽带，到现在还没动静。',
      '安装宽带的工作人员失约了，什么时候能重新安排？',
      '宽带预约上门没来人，想确认一下工单状态。',
      '我今天一直在等装宽带，师傅还没到，怎么处理？',
    ],
    source_ref_id: 'dv-network-v1',
    evidence_locator: '## 场景 1：宽带装机预约未履约',
    a: '需要核查装维预约时间、师傅排期和工单状态，并根据结果催办或改约。',
    scene: { code: 'broadband_install_delay', label: '宽带装机延迟 / 上门履约', risk: 'medium' },
    required_slots: ['宽带订单号', '预约时间', '安装地址', '联系电话', '是否收到装维联系'],
    recommended_terms: ['预约上门时间', '装维师傅排期', '正在协助催办'],
    forbidden_terms: ['师傅太忙了', '今天一定上门'],
    reply_options: [
      { label: '标准版', text: '很抱歉让您久等了，这边先帮您核实宽带装机工单的预约上门时间和装维师傅排期，并立即协助催办。请您提供宽带订单号、预约时间和安装地址，我查到后会同步您新的处理进展。' },
      { label: '安抚版', text: '理解您今天一直等装机却没有人上门会很影响安排，这边先马上帮您查工单状态并催装维处理，确认后尽快给您一个新的预计上门时间。' },
    ],
    next_actions: ['查询装机工单状态', '联系装维催办', '必要时重约上门时间'],
    sources: ['装维工单流程', '宽带装机履约规范'],
    tags: ['宽带', '装机', '上门', '师傅', '预约', '履约'],
  },
  {
    category: '网络类',
    standard_q: '宽带断网后如何判断恢复时效？',
    expanded_questions: [
      '家里宽带从昨晚开始就断网，重启路由器也没用，你们什么时候修好？',
      '家里宽带突然没网了，重启设备也不行，多久能恢复？',
      '从昨天晚上开始宽带就断了，现在还没好。',
      '路由器和光猫都重启过了，宽带还是不能上网。',
      '我家宽带一直断网，想知道什么时候能修复。',
      '宽带故障一晚上了，到底是线路问题还是区域问题？',
      '现在家里完全没网，帮我查一下宽带什么时候恢复。',
      '宽带断了很久了，能不能给个预计修复时间？',
      '昨晚开始宽带就异常，今天还是没恢复正常。',
      '家里宽带上不了网，重启也没用，什么时候能处理好？',
    ],
    source_ref_id: 'dv-network-v1',
    evidence_locator: '## 场景 2：宽带断网与恢复时效',
    a: '需要先区分用户侧设备问题和区域故障，再给出报障、恢复时效或上门维修路径。',
    scene: { code: 'broadband_outage_repair', label: '宽带故障 / 网络恢复时效', risk: 'medium' },
    required_slots: ['宽带账号', '故障开始时间', '光猫/路由器指示灯状态', '是否全屋断网', '同小区邻居是否也异常'],
    recommended_terms: ['线路异常核查', '区域网络波动', '预计恢复时间以处理进度为准'],
    forbidden_terms: ['基站坏了', '今晚一定修好'],
    reply_options: [
      { label: '标准版', text: '已收到您家里宽带断网的情况，这边先帮您做线路异常核查。我们会先判断是用户侧设备问题还是区域网络波动，再为您安排报障或上门处理，预计恢复时间需要以处理进度为准。麻烦提供宽带账号和当前光猫指示灯状态。' },
      { label: '安抚版', text: '理解从昨晚开始一直断网会很影响使用，这边先帮您查是否存在区域故障，同时也排查您本地线路状态，确认后尽快同步预计恢复时间和后续处理方式。' },
    ],
    next_actions: ['查询区域告警', '远程线路诊断', '必要时创建宽带报障工单'],
    sources: ['宽带故障处理规范', '区域网络故障通报流程'],
    tags: ['宽带断网', '昨晚开始', '路由器', '光猫', '修好', '恢复'],
  },
  {
    category: '网络类',
    standard_q: '国际漫游开通后仍无法上网如何排查？',
    expanded_questions: [
      '我出国了，为什么手机一点网都没有？漫游不是早就开了吗？',
      '人在国外，手机没有数据网络，漫游不是已经开通了吗？',
      '我开了国际漫游，但出境后还是上不了网。',
      '到了国外手机没信号上网，能帮我查下漫游吗？',
      '漫游功能应该开着，为什么在国外完全没有数据？',
      '我出国后手机不能上网，是漫游没生效吗？',
      '国际漫游开通了，但境外网络一直连不上。',
      '在国外只能收短信不能上网，漫游是不是有问题？',
      '我现在境外没有网络，想确认漫游状态是否正常。',
      '出国后手机没法使用流量，明明之前就开通过漫游。',
    ],
    source_ref_id: 'dv-mobile-service-v1',
    evidence_locator: '## 场景 1：国际漫游开通后无法上网',
    a: '需要从漫游功能状态、终端设置和境外合作网络三层排查境外上网异常。',
    scene: { code: 'international_roaming_data_issue', label: '国际漫游 / 境外上网异常', risk: 'medium' },
    required_slots: ['手机号', '所在国家/地区', '出境时间', '是否能通话/收短信', '手机制式和数据漫游开关状态'],
    recommended_terms: ['漫游功能状态', '当地网络覆盖', '终端网络设置', '以境外运营商接入情况为准'],
    forbidden_terms: ['国外信号都不好', '不是我们的问题'],
    reply_options: [
      { label: '标准版', text: '已了解您在境外无法上网的情况，这边先帮您确认漫游功能状态，并从终端网络设置和当地网络覆盖两方面一起排查。境外上网情况还需要结合合作运营商接入结果判断，麻烦提供当前所在国家或地区，以及是否还能正常通话或收短信。' },
      { label: '安抚版', text: '理解您出国后突然没有网络会很不方便，这边先帮您查漫游功能是否正常开通，再结合手机设置和当地网络接入情况一起排查，尽快给您临时处理办法和下一步路径。' },
    ],
    next_actions: ['核查漫游开通状态', '指导检查终端设置', '必要时升级国际漫游保障'],
    sources: ['国际漫游服务说明', '境外合作网络接入规范'],
    tags: ['出国', '漫游', '一点网都没有', '境外上网', '数据漫游', '当地网络'],
  },
  {
    category: '业务类',
    standard_q: '副卡无法共享主卡流量如何核查？',
    expanded_questions: [
      '我副卡为什么不能用主卡流量？不是说共享的吗？',
      '主卡流量副卡怎么一点都用不了？',
      '不是说家庭套餐可以共享流量吗，为什么副卡没法用？',
      '副卡现在上不了网，主卡流量也没有共享过去。',
      '我想确认一下，副卡为什么没吃到主卡的流量包？',
      '副卡用流量就提示异常，主副卡不是绑定了吗？',
      '主卡套餐支持共享，为什么副卡这边还是单独计费？',
      '副卡不能共享主卡流量，是绑定关系出问题了吗？',
      '我们是主副卡关系，为什么副卡没有共享权益？',
      '副卡无法走主卡流量，帮我查一下共享状态。',
    ],
    source_ref_id: 'dv-mobile-service-v1',
    evidence_locator: '## 场景 2：主副卡流量共享异常',
    a: '需要核查主副卡成员关系、套餐共享资格和近期套餐变更，判断是绑定失败、套餐不支持还是系统延迟。',
    scene: { code: 'secondary_card_sharing_issue', label: '副卡共享异常 / 套餐权益核查', risk: 'medium' },
    required_slots: ['主副卡号码', '套餐名称', '绑定关系建立时间', '副卡当前提示', '是否新近变更过套餐'],
    recommended_terms: ['共享规则', '成员关系状态', '套餐权益范围'],
    forbidden_terms: ['这套餐本来就不共享吧', '您理解错了'],
    reply_options: [
      { label: '标准版', text: '已了解您副卡无法使用主卡流量的情况，这边先帮您核查共享规则、成员关系状态和套餐权益范围。通常需要区分是未绑定成功、套餐不支持共享，还是系统处理延迟。请您提供主副卡号码、套餐名称以及绑定时间，我继续为您确认。' },
      { label: '安抚版', text: '理解您看到副卡不能共享流量会比较困惑，这边先帮您查主副卡关系和套餐权益，确认问题原因后会尽快告诉您怎么恢复或补救。' },
    ],
    next_actions: ['查询主副卡绑定关系', '核查套餐共享资格', '必要时发起共享权益修复'],
    sources: ['家庭融合套餐共享规则', '主副卡成员关系维护规范'],
    tags: ['副卡', '主卡流量', '共享', '成员关系', '权益', '绑定'],
  },
  {
    category: '业务类',
    standard_q: '携号转网资格受限时如何解释处理？',
    expanded_questions: [
      '我想携号转网，结果提示我不能转，凭什么不让我转？',
      '携号转网查询说我不符合条件，具体为什么？',
      '我号码为什么不能携转？系统提示受限。',
      '我想转网走人，但短信提示我没有资格。',
      '携号转网被拦了，想知道到底卡在哪个条件上。',
      '为什么我查携转资格时提示不能办理？',
      '想办携号转网，结果说我暂时不能转，帮我解释下。',
      '我号码携转失败了，是不是有合约或者欠费问题？',
      '系统提示我不能携转，能帮我核查限制原因吗？',
      '我现在想转网，但被提示不满足条件，这是什么情况？',
    ],
    source_ref_id: 'dv-mobile-service-v1',
    evidence_locator: '## 场景 3：携号转网资格受限',
    a: '携号转网资格通常受合约、欠费、实名一致性等条件限制，需要先核查具体限制提示。',
    scene: { code: 'number_portability_restriction', label: '携号转网 / 限制条件解释', risk: 'medium' },
    required_slots: ['手机号', '查询到的限制提示', '是否有合约/欠费', '实名状态', '近期是否补换卡或过户'],
    recommended_terms: ['资格校验', '限制条件', '以携转查询结果为准'],
    forbidden_terms: ['您转不了', '公司不让转'],
    reply_options: [
      { label: '标准版', text: '已了解您在办理携号转网时被提示无法办理的情况，这边先帮您做资格校验。携转通常会受到合约、欠费、实名一致性等限制条件影响，具体以携转查询结果为准。请您提供手机号和提示内容，我帮您确认当前受限原因。' },
      { label: '安抚版', text: '理解您看到不能携转的提示会比较不满，这边先帮您核查具体限制条件，确认是合约、欠费还是实名状态影响，再告诉您如何解除或进一步申诉。' },
    ],
    next_actions: ['查询携转资格结果', '核查合约与欠费状态', '必要时引导提交申诉'],
    sources: ['携号转网资格校验规范', '号码过户与补换卡规则'],
    tags: ['携号转网', '不能转', '资格校验', '限制', '合约', '实名'],
  },
  {
    category: '风控投诉类',
    standard_q: '号码因异常使用被停机后如何处理？',
    expanded_questions: [
      '我号码突然被停机了，说什么异常使用，我正常打电话凭什么封我？',
      '我的手机号怎么突然被停用了，还说有异常使用？',
      '号码被你们停机了，提示风险异常，这是什么意思？',
      '我正常在用手机，为什么突然说异常使用给我停机？',
      '刚刚收到短信说号码异常，然后就被停机了。',
      '为什么我的号码被风控停机了，我需要怎么恢复？',
      '你们把我手机号封了，说存在异常使用，我想申诉。',
      '号码无缘无故被停机，还让我核验身份，怎么回事？',
      '我电话突然不能用了，系统提示异常使用，帮我查一下。',
      '手机号码被安全停机了，我想知道复机需要什么材料。',
    ],
    source_ref_id: 'dv-security-v1',
    evidence_locator: '## 场景 1：号码异常使用停机',
    a: '该类场景需要走安全核验流程，结合停机通知、近期使用行为和实名信息判断复机路径。',
    scene: { code: 'security_suspension_verification', label: '高风险停机 / 实名与安全管控', risk: 'high' },
    required_slots: ['手机号', '停机时间', '收到的短信内容', '近期是否频繁外呼', '是否更换设备/地点', '实名信息是否一致'],
    recommended_terms: ['号码状态异常', '需进一步核验身份或使用情况', '以审核结果为准'],
    forbidden_terms: ['系统误封', '我们也不知道为什么停'],
    reply_options: [
      { label: '标准版', text: '已收到您关于号码异常停机的反馈。这类情况通常需要先核查号码状态异常原因，并进一步核验身份或使用情况，最终以审核结果为准。请您提供停机时间、收到的短信内容以及近期是否更换过设备或地点，我帮您确认具体复机路径。' },
      { label: '安抚版', text: '理解号码突然停机会非常影响正常通信，这边先帮您核查当前状态，并尽快引导您完成必要的身份或使用情况核验，确认后会同步您处理时效和复机方式。' },
    ],
    next_actions: ['查询安全停机原因', '发起实名/风险核验', '跟进复机审核时效'],
    sources: ['号码安全管控规范', '实名核验与复机流程'],
    tags: ['停机', '异常使用', '封我', '号码状态异常', '实名', '安全管控'],
  },
];

interface SeedReplyCopilotOptions {
  createdBy?: string;
  owner?: string;
  packageTitle?: string;
  includeConsoleLogs?: boolean;
  idPrefix?: string;
}

interface SeedReplyCopilotResult {
  packageId: string;
  candidateIds: string[];
  assetIds: string[];
  assetVersionIds: string[];
  evidenceIds: string[];
  documentIds: string[];
  documentVersionIds: string[];
  count: number;
}

const REPLY_COPILOT_DOCS = [
  {
    idSuffix: 'doc-mobile-service',
    versionIdSuffix: 'dv-mobile-service-v1',
    title: '移动业务与跨网服务处理规范',
    owner: '赵六',
    classification: 'internal',
    source: 'upload',
    filePath: 'data/km-documents/mobile-service-guide-v1.md',
    scopeJson: JSON.stringify({ region: '全国', channel: '在线客服' }),
    effectiveFrom: '2026-03-01',
    effectiveTo: '2026-12-31',
    diffSummary: '首版：覆盖国际漫游、副卡共享、携号转网三个高频移动业务场景',
  },
  {
    idSuffix: 'doc-security-guide',
    versionIdSuffix: 'dv-security-v1',
    title: '号码安全管控与复机处理规范',
    owner: '周七',
    classification: 'sensitive',
    source: 'upload',
    filePath: 'data/km-documents/security-guide-v1.md',
    scopeJson: JSON.stringify({ region: '全国', channel: '在线客服' }),
    effectiveFrom: '2026-03-01',
    effectiveTo: '2026-12-31',
    diffSummary: '首版：覆盖异常使用停机、身份核验与复机处理口径',
  },
  {
    idSuffix: 'doc-5g-plans',
    versionIdSuffix: 'dv-5g-plans-v1',
    title: '5G套餐资费说明（2026Q1）',
    owner: '李四',
    classification: 'internal',
    source: 'upload',
    filePath: 'data/km-documents/5g-plans-v1.md',
    scopeJson: JSON.stringify({ region: '全国', channel: '在线客服' }),
    effectiveFrom: '2026-03-01',
    effectiveTo: '2026-12-31',
    diffSummary: '首版：覆盖5G套餐资费与合约期说明',
  },
  {
    idSuffix: 'doc-billing-rules',
    versionIdSuffix: 'dv-billing-rules-v1',
    title: '计费规则与争议处理规范',
    owner: '王五',
    classification: 'internal',
    source: 'upload',
    filePath: 'data/km-documents/billing-rules-v1.md',
    scopeJson: JSON.stringify({ region: '全国', channel: '在线客服' }),
    effectiveFrom: '2026-03-01',
    effectiveTo: '2026-12-31',
    diffSummary: '首版：覆盖计费规则、异常账单争议处理口径',
  },
  {
    idSuffix: 'doc-cancel-policy',
    versionIdSuffix: 'dv-cancel-policy-v1',
    title: '增值业务退订政策（2026版）',
    owner: '赵六',
    classification: 'internal',
    source: 'upload',
    filePath: 'data/km-documents/cancel-policy-v1.md',
    scopeJson: JSON.stringify({ region: '全国', channel: '在线客服' }),
    effectiveFrom: '2026-03-01',
    effectiveTo: '2026-12-31',
    diffSummary: '首版：覆盖增值业务退订政策与合约期限制',
  },
  {
    idSuffix: 'doc-complaint-guide',
    versionIdSuffix: 'dv-complaint-guide-v1',
    title: '客户投诉处理操作指引',
    owner: '钱八',
    classification: 'internal',
    source: 'upload',
    filePath: 'data/km-documents/complaint-guide-v1.md',
    scopeJson: JSON.stringify({ region: '全国', channel: '在线客服' }),
    effectiveFrom: '2026-03-01',
    effectiveTo: '2026-12-31',
    diffSummary: '首版：覆盖投诉受理、升级、回访全流程',
  },
  {
    idSuffix: 'doc-network-faq',
    versionIdSuffix: 'dv-network-faq-v1',
    title: '宽带故障排查FAQ手册',
    owner: '孙九',
    classification: 'internal',
    source: 'upload',
    filePath: 'data/km-documents/network-faq-v1.md',
    scopeJson: JSON.stringify({ region: '全国', channel: '在线客服' }),
    effectiveFrom: '2026-03-01',
    effectiveTo: '2026-12-31',
    diffSummary: '首版：覆盖宽带常见故障排查与处理方案',
  },
];

function resolveSceneDocVersionId(sourceRefId: string, idPrefix: string): string {
  const knownPrefixes = REPLY_COPILOT_DOCS.map(d => d.versionIdSuffix);
  if (knownPrefixes.includes(sourceRefId)) {
    return `${idPrefix}-${sourceRefId}`;
  }
  return sourceRefId;
}

export async function seedReplyCopilotKnowledge(
  options: SeedReplyCopilotOptions = {},
): Promise<SeedReplyCopilotResult> {
  const now = new Date().toISOString();
  const nextQuarter = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
  const pkgId = nanoid();
  const candidateIds: string[] = [];
  const assetIds: string[] = [];
  const assetVersionIds: string[] = [];
  const evidenceIds: string[] = [];
  const documentIds: string[] = [];
  const documentVersionIds: string[] = [];
  const createdBy = options.createdBy ?? 'seed';
  const owner = options.owner ?? createdBy;
  const includeConsoleLogs = options.includeConsoleLogs ?? true;
  const idPrefix = options.idPrefix ?? 'reply-copilot';

  for (const doc of REPLY_COPILOT_DOCS) {
    const docId = `${idPrefix}-${doc.idSuffix}`;
    const versionId = `${idPrefix}-${doc.versionIdSuffix}`;
    documentIds.push(docId);
    documentVersionIds.push(versionId);
    await db.insert(kmDocuments).values({
      id: docId,
      title: doc.title,
      source: doc.source,
      classification: doc.classification,
      owner: doc.owner,
      status: 'active',
      created_at: now,
      updated_at: now,
    });
    await db.insert(kmDocVersions).values({
      id: versionId,
      document_id: docId,
      version_no: 1,
      file_path: doc.filePath,
      scope_json: doc.scopeJson,
      effective_from: doc.effectiveFrom,
      effective_to: doc.effectiveTo,
      diff_summary: doc.diffSummary,
      status: 'parsed',
      created_at: now,
    });
  }

  if (includeConsoleLogs) {
    console.log('Seeding Reply Copilot knowledge assets...');
  }

  for (const scene of REPLY_COPILOT_SCENES) {
    const candId = nanoid();
    const assetId = nanoid();
    const versionId = nanoid();
    const structured = JSON.stringify({
      scene: scene.scene,
      required_slots: scene.required_slots,
      recommended_terms: scene.recommended_terms,
      forbidden_terms: scene.forbidden_terms,
      reply_options: scene.reply_options,
      next_actions: scene.next_actions,
      sources: scene.sources,
      expanded_questions: scene.expanded_questions,
      retrieval_tags: scene.tags,
      // Agent Copilot extended fields
      knowledge_type: scene.knowledge_type ?? 'reply',
      agent_answer: scene.agent_answer ?? scene.a,
      customer_reply_followup: scene.customer_reply_followup ?? '',
      customer_reply_risk_safe: scene.customer_reply_risk_safe ?? '',
      caution_notes: scene.caution_notes ?? [],
      escalation_conditions: scene.escalation_conditions ?? [],
      citations: scene.citations ?? scene.sources.map(s => ({ title: s, version: '', anchor: '' })),
      fallback_policy: scene.fallback_policy ?? 'suggest_supplement',
      applicable_scope: scene.applicable_scope ?? { channels: ['online', 'voice'] },
      emotion_hints: scene.emotion_hints ?? [],
    });

    candidateIds.push(candId);
    assetIds.push(assetId);
    assetVersionIds.push(versionId);

    await db.insert(kmCandidates).values({
      id: candId,
      source_type: 'parsing',
      source_ref_id: resolveSceneDocVersionId(scene.source_ref_id, idPrefix),
      normalized_q: scene.standard_q,
      draft_answer: scene.a,
      variants_json: JSON.stringify(scene.expanded_questions),
      category: scene.category,
      scene_code: scene.scene.code,
      retrieval_tags_json: JSON.stringify(scene.tags),
      structured_json: structured,
      risk_level: scene.scene.risk,
      gate_evidence: 'pass',
      gate_conflict: 'pass',
      gate_ownership: 'pass',
      status: 'published',
      review_pkg_id: pkgId,
      created_by: createdBy,
      created_at: now,
      updated_at: now,
    });

    const evidenceId = nanoid();
    evidenceIds.push(evidenceId);
    const resolvedDocVersionId = resolveSceneDocVersionId(scene.source_ref_id, idPrefix);
    await db.insert(kmEvidenceRefs).values({
      id: evidenceId,
      candidate_id: candId,
      doc_version_id: resolvedDocVersionId,
      locator: scene.evidence_locator,
      status: 'pass',
      rule_version: 'reply-copilot.v1',
      reviewed_by: 'seed',
      reviewed_at: now,
      created_at: now,
    });

    await db.insert(kmAssets).values({
      id: assetId,
      title: scene.standard_q,
      asset_type: 'qa',
      status: 'online',
      current_version: 1,
      scope_json: JSON.stringify({ region: '全国', channel: '在线客服' }),
      owner,
      next_review_date: nextQuarter,
      created_at: now,
      updated_at: now,
    });

    await db.insert(kmAssetVersions).values({
      id: versionId,
      asset_id: assetId,
      version_no: 1,
      content_snapshot: JSON.stringify({ q: scene.standard_q, variants: scene.expanded_questions, a: scene.a }),
      scope_snapshot: JSON.stringify({ region: '全国', channel: '在线客服' }),
      evidence_summary: scene.sources.join(' / '),
      structured_snapshot_json: structured,
      effective_from: now,
      created_at: now,
    });

    if (includeConsoleLogs) {
      console.log(`  + ${scene.scene.label} (${scene.scene.code})`);
    }
  }

  await db.insert(kmReviewPackages).values({
    id: pkgId,
    title: options.packageTitle ?? 'Reply Copilot - 电信运营商 10场景',
    status: 'published',
    risk_level: 'high',
    candidate_ids_json: JSON.stringify(candidateIds),
    created_by: createdBy,
    created_at: now,
    updated_at: now,
  });

  if (includeConsoleLogs) {
    console.log(`Seeded ${REPLY_COPILOT_SCENES.length} Reply Copilot assets`);
  }

  return {
    packageId: pkgId,
    candidateIds,
    assetIds,
    assetVersionIds,
    evidenceIds,
    documentIds,
    documentVersionIds,
    count: REPLY_COPILOT_SCENES.length,
  };
}

if (import.meta.main) {
  seedReplyCopilotKnowledge().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
