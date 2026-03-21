/**
 * check_device_security.ts
 * TC1 · 检查点 #4 & TC3（设备安全层）
 *
 * 涵盖以下检测项（每项独立返回一个 Step）：
 *   4a. Root / 越狱检测
 *   4b. 开发者模式检测
 *   4c. 模拟器/虚拟机环境检测
 *   4d. 虚假 GPS 应用（位置欺骗）
 *   4e. VPN / 代理应用
 *   4f. 远程控制 / 屏幕共享应用
 *
 * 对应流程图节点 #4：
 *   "我可以确认您没有安装'虚假'的 GPS/WiFi/VPN/远程访问类应用吗？"
 */
import type { AppUserContext, SecurityCheckStep } from './app_types.ts';

export function checkDeviceSecurity(ctx: AppUserContext): SecurityCheckStep[] {
  const steps: SecurityCheckStep[] = [];

  // ── 4a. Root / 越狱 ──────────────────────────────────────────────────────
  steps.push(
    ctx.device_rooted
      ? {
          step: 'Root / 越狱检测',
          status: 'error',
          detail:
            ctx.device_os === 'android'
              ? '检测到设备已 Root。Root 环境会绕过系统沙箱，使 App 数据面临被读取或篡改的风险。'
              : '检测到设备已越狱（Jailbreak）。越狱环境无法保证 App 运行在受信任的沙箱中。',
          action:
            '出于安全原因，本 App 无法在 Root / 越狱设备上运行。建议使用未修改的设备登录，或恢复设备出厂状态后重试。',
          escalate: true,
        }
      : {
          step: 'Root / 越狱检测',
          status: 'ok',
          detail: '设备未检测到 Root / 越狱，系统完整性正常。',
        },
  );

  // ── 4b. 开发者模式 ────────────────────────────────────────────────────────
  steps.push(
    ctx.developer_mode_on
      ? {
          step: '开发者模式检测',
          status: 'warning',
          detail: '检测到设备已开启开发者模式（USB 调试 / 开发者选项已启用）。此模式下部分安全策略会降级。',
          action:
            ctx.device_os === 'android'
              ? '请前往 设置 → 开发者选项 → 关闭开发者模式，然后重启手机后重试。'
              : '请前往 设置 → 隐私与安全 → 开发者模式 → 关闭，然后重启手机后重试。',
        }
      : {
          step: '开发者模式检测',
          status: 'ok',
          detail: '开发者模式未开启，设备配置正常。',
        },
  );

  // ── 4c. 模拟器 / 虚拟机 ───────────────────────────────────────────────────
  steps.push(
    ctx.running_on_emulator
      ? {
          step: '模拟器环境检测',
          status: 'error',
          detail: '检测到当前运行在模拟器或虚拟机环境中，这不是真实的物理设备。',
          action: '请在实体手机上安装并使用本 App，模拟器环境不被支持。',
          escalate: true,
        }
      : {
          step: '模拟器环境检测',
          status: 'ok',
          detail: '已确认为实体设备，环境正常。',
        },
  );

  // ── 4d. 虚假 GPS（位置欺骗） ──────────────────────────────────────────────
  steps.push(
    ctx.has_fake_gps
      ? {
          step: '虚假 GPS 应用检测',
          status: 'error',
          detail:
            '检测到设备安装了 GPS 位置欺骗类应用（Mock Location）。此类应用可伪造地理位置，触发 App 安全锁定机制。',
          action:
            '请卸载所有 GPS 位置欺骗应用（常见应用：Fake GPS Location、GPS Joystick 等），卸载后重新打开 App 尝试登录。',
        }
      : {
          step: '虚假 GPS 应用检测',
          status: 'ok',
          detail: '未检测到位置欺骗类应用，GPS 环境正常。',
        },
  );

  // ── 4e. VPN / 代理 ────────────────────────────────────────────────────────
  steps.push(
    ctx.has_vpn_active
      ? {
          step: 'VPN / 代理检测',
          status: 'warning',
          detail:
            '检测到设备当前正在使用 VPN 或网络代理。VPN 会隐藏真实 IP，可能触发异地登录风控策略。',
          action: '请关闭 VPN 或代理后重新打开 App 尝试登录。若仍需使用 VPN，请联系客服申请白名单。',
        }
      : {
          step: 'VPN / 代理检测',
          status: 'ok',
          detail: '未检测到活跃的 VPN 或代理连接，网络环境正常。',
        },
  );

  // ── 4f. 远程控制 / 屏幕共享 ──────────────────────────────────────────────
  const hasRemoteRisk = ctx.has_remote_access_app || ctx.has_screen_share_active;
  steps.push(
    hasRemoteRisk
      ? {
          step: '远程控制 / 屏幕共享检测',
          status: 'error',
          detail: ctx.has_screen_share_active
            ? '检测到当前有屏幕共享会话正在进行。在屏幕共享状态下登录营业厅 App 存在账号信息泄露风险。'
            : '检测到设备安装了远程控制类应用（如 TeamViewer、AnyDesk、向日葵等），此类应用可能被他人远程操控您的设备。',
          action: ctx.has_screen_share_active
            ? '请立即结束所有屏幕共享会话，确认设备安全后再登录 App。如您未主动开启屏幕共享，请立即联系客服挂失账号。'
            : '请卸载所有远程控制类应用，卸载后重新打开 App 尝试登录。',
          escalate: ctx.has_screen_share_active,
        }
      : {
          step: '远程控制 / 屏幕共享检测',
          status: 'ok',
          detail: '未检测到远程控制或屏幕共享应用，设备访问环境安全。',
        },
  );

  return steps;
}
