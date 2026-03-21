/**
 * check_suspicious_apps.ts
 * TC1 · 检查点 #2 & #3 — 可疑应用排查
 *
 * 对应流程图两个节点：
 *   #2 — "在上次成功登录与 App 被锁定之间，您是否安装过任何新应用？"
 *   #3 — "您的设备上是否有任何不熟悉的应用？"
 *
 * 两个节点的处理逻辑：
 *   - 后端已将用户设备应用列表与黑名单比对，输出 flagged_apps[]
 *   - 若有命中 → 返回 error，给出"删除并重试"指引
 *   - 若无命中 → 返回 ok，提示用户自查不熟悉的应用
 *
 * 注意：客服仍需向用户口头确认 #2 / #3，本脚本仅提供系统层面的比对结果。
 */
import type { AppUserContext, SecurityCheckStep } from './types.ts';

// ─── 黑名单应用分类（用于生成可读的提示） ────────────────────────────────────

const APP_CATEGORIES: Record<string, string> = {
  // 远程控制
  'com.teamviewer.teamviewer': '远程控制（TeamViewer）',
  'com.anydesk.anydeskandroid': '远程控制（AnyDesk）',
  'com.sunlogin.client': '远程控制（向日葵）',
  'com.todesk.client': '远程控制（ToDesk）',
  // 虚假 GPS
  'com.lexa.fakegps': '虚假 GPS（Fake GPS Location）',
  'com.incorporateapps.fakegps.fre': '虚假 GPS（GPS Joystick）',
  'com.blogspot.newappswork.gpsfaker': '虚假 GPS（GPS Faker）',
  // VPN 滥用
  'free.vpn.unblock.proxy.vpnmonster': 'VPN 代理（VPN Monster）',
  'com.fast.free.unblock.secure.vpn': 'VPN 代理（Fast VPN）',
  // 屏幕录制/共享
  'com.mobizen.mirroring': '屏幕共享（Mobizen）',
  'com.mirrativ.android': '屏幕直播（Mirrativ）',
  // 诈骗工具
  'com.app.cloner': '应用克隆器',
  'com.lbe.parallel.intl': '多开框架（Parallel Space）',
  'com.excelliance.dualaid': '多开框架（Dual Space）',
};

/** 将包名映射为可读描述，未知包名直接返回原值 */
function describeApp(pkg: string): string {
  return APP_CATEGORIES[pkg] ?? pkg;
}

// ─── 检查点 #2 — 近期安装的新应用 ────────────────────────────────────────────

/**
 * 系统层面：比对 flagged_apps 中属于"近期新增"范畴的条目
 * 客服层面：口头询问用户，并根据用户回答决定是否继续排查 #3
 */
export function checkRecentlyInstalledApps(ctx: AppUserContext): SecurityCheckStep {
  if (ctx.flagged_apps.length === 0) {
    return {
      step: '近期安装应用检查（#2）',
      status: 'ok',
      detail:
        '系统未在黑名单中匹配到近期安装的可疑应用。请口头向客户确认：上次成功登录后是否安装过任何新应用。',
    };
  }

  const appList = ctx.flagged_apps.map(describeApp).join('、');

  return {
    step: '近期安装应用检查（#2）',
    status: 'error',
    detail: `系统检测到以下应用命中安全黑名单：${appList}。这些应用可能干扰 App 的安全运行环境，导致账号被锁定。`,
    action:
      `请引导客户删除以下应用：${appList}。` +
      '删除后，请客户重启手机，再重新打开 App 尝试登录。',
  };
}

// ─── 检查点 #3 — 不熟悉的应用 ────────────────────────────────────────────────

/**
 * 当 #2 客户回答"否"（无近期新安装）后，进入 #3 排查。
 * 若 flagged_apps 非空（后端已有命中），说明这些应用安装已久但仍属可疑。
 */
export function checkUnfamiliarApps(ctx: AppUserContext): SecurityCheckStep {
  if (ctx.flagged_apps.length === 0) {
    return {
      step: '不熟悉应用检查（#3）',
      status: 'ok',
      detail:
        '系统黑名单未发现可疑应用。请口头向客户询问：设备上是否有任何不熟悉或不记得安装的应用。' +
        '若客户发现可疑应用，引导其删除后重新尝试登录。',
    };
  }

  const appList = ctx.flagged_apps.map(describeApp).join('、');

  return {
    step: '不熟悉应用检查（#3）',
    status: 'error',
    detail:
      `系统在黑名单中发现以下已安装应用：${appList}。` +
      '即使客户声称不知情，这些应用的存在已触发 App 安全策略。',
    action:
      `请引导客户找到并删除以下应用：${appList}。` +
      '如客户不确定如何找到该应用，可指引其前往 设置 → 应用管理 中搜索名称后卸载。' +
      '删除后重启手机，再重新打开 App 尝试登录。',
  };
}

// ─── 联合入口（供编排器使用） ─────────────────────────────────────────────────

/** 返回 [#2 步骤, #3 步骤]，编排器按序执行 */
export function checkSuspiciousApps(ctx: AppUserContext): [SecurityCheckStep, SecurityCheckStep] {
  return [checkRecentlyInstalledApps(ctx), checkUnfamiliarApps(ctx)];
}
