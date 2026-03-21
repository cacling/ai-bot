/**
 * check_app_version.ts
 * TC1 · 检查点 #1 — 应用版本验证
 *
 * 对应流程图节点 #1：
 *   "您是否已安装/更新至最新版本的 App？"
 *
 * 版本落后可能导致安全模块被识别为不兼容而触发锁定。
 * 返回 error 时，后续检查不必继续（更新 App 即可）。
 */
import type { AppUserContext, SecurityCheckStep } from './app_types.ts';

/** 将 "1.2.3" 解析为可比较的整数三元组 */
function parseVersion(v: string): [number, number, number] {
  const [major = 0, minor = 0, patch = 0] = v.split('.').map(Number);
  return [major, minor, patch];
}

/** 语义化版本比较：返回负数/0/正数 */
function compareVersions(a: string, b: string): number {
  const [aMaj, aMin, aPat] = parseVersion(a);
  const [bMaj, bMin, bPat] = parseVersion(b);
  return aMaj !== bMaj ? aMaj - bMaj : aMin !== bMin ? aMin - bMin : aPat - bPat;
}

export function checkAppVersion(ctx: AppUserContext): SecurityCheckStep {
  const diff = compareVersions(ctx.installed_app_version, ctx.latest_app_version);

  if (diff === 0) {
    return {
      step: '应用版本检查',
      status: 'ok',
      detail: `已安装最新版本 ${ctx.latest_app_version}，版本正常。`,
    };
  }

  const [iMaj] = parseVersion(ctx.installed_app_version);
  const [lMaj] = parseVersion(ctx.latest_app_version);
  const majorOutdated = lMaj > iMaj;

  return {
    step: '应用版本检查',
    status: majorOutdated ? 'error' : 'warning',
    detail: majorOutdated
      ? `当前版本 ${ctx.installed_app_version} 与最新版本 ${ctx.latest_app_version} 相差主版本，旧版安全模块已不兼容。`
      : `当前版本 ${ctx.installed_app_version}，最新版本为 ${ctx.latest_app_version}，建议更新。`,
    action:
      ctx.device_os === 'ios'
        ? '请前往 App Store 搜索应用名称并点击"更新"，完成后重新打开 App 尝试登录。'
        : '请前往 Google Play 或手机应用商店搜索应用名称并更新，完成后重新打开 App 尝试登录。',
  };
}
