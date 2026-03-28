/**
 * 故障诊断服务 — diagnose_network, diagnose_app
 * Port: 18005
 *
 * 重构2：MCP Server = 防腐层，调用 mock_apis (demo backend)
 * 诊断逻辑已迁移到 mock_apis/src/diagnosis/，由 /api/diagnosis/* 端点执行
 */
import { backendPost, mcpLog, startMcpHttpServer, z, McpServer, performance } from "../shared/server.js";

export function registerDiagnosisTools(server: McpServer): void {
  server.tool("diagnose_network", "对指定手机号进行网络故障诊断，检查信号、基站、DNS、路由等状态", {
    phone: z.string().describe("用户手机号"),
    issue_type: z.enum(["no_signal", "slow_data", "call_drop", "no_network"]).describe("故障类型"),
    lang: z.enum(["zh", "en"]).optional().describe("返回语言"),
  }, async ({ phone, issue_type, lang = "zh" }) => {
    const t0 = performance.now();
    try {
      const res = await backendPost<{
        success: boolean; msisdn?: string; issue_type?: string; severity?: string;
        escalate?: boolean; diagnostic_steps?: any[]; conclusion?: string;
      }>('/api/diagnosis/network/analyze', { msisdn: phone, issue_type, lang });

      if (!res.success) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ phone, issue_type, diagnostic_steps: [], conclusion: null, severity: null, should_escalate: false, next_action: null }) }] };
      }

      const severity = res.severity ?? "normal";
      const shouldEscalate = res.escalate ?? false;
      const suggestions: Record<string, Record<string, string>> = {
        no_signal: { zh: "请检查 SIM 卡是否松动，或尝试切换飞行模式后重新搜网。", en: "Please check if the SIM card is loose, or try toggling airplane mode." },
        slow_data: { zh: "建议关闭后台高流量应用，或切换至 WiFi 网络。", en: "Try closing background apps or switching to WiFi." },
        call_drop: { zh: "建议避免在信号弱的室内通话，或移至开阔区域。", en: "Try moving to an open area with better signal." },
        no_network: { zh: "请检查 APN 设置是否正确，或重置网络设置。", en: "Please check your APN settings or reset network settings." },
      };
      const nextAction = severity === "normal"
        ? (lang === "en" ? "All checks passed. If the issue persists, please try restarting your device." : "各项检测正常。如问题持续，建议重启设备后观察。")
        : shouldEscalate
        ? (lang === "en" ? "Multiple critical issues detected. Recommend transferring to a human agent." : "检测到多项严重问题，建议转接人工客服处理。")
        : (suggestions[issue_type]?.[lang] ?? (lang === "en" ? "Please follow the diagnostic suggestions." : "请按照诊断建议操作。"));

      mcpLog("diagnosis", "diagnose_network", { phone, issue_type, severity, success: true, ms: Math.round(performance.now() - t0) });
      return { content: [{ type: "text" as const, text: JSON.stringify({
        phone,
        issue_type: res.issue_type ?? issue_type,
        diagnostic_steps: res.diagnostic_steps ?? [],
        conclusion: res.conclusion ?? null,
        severity,
        should_escalate: shouldEscalate,
        next_action: nextAction,
      }) }] };
    } catch (err) {
      mcpLog("diagnosis", "diagnose_network", { phone, issue_type, error: String(err), ms: Math.round(performance.now() - t0) });
      return { content: [{ type: "text" as const, text: JSON.stringify({ phone, issue_type, diagnostic_steps: [], conclusion: null, severity: null, should_escalate: false, next_action: null }) }] };
    }
  });

  server.tool("diagnose_app", "对指定手机号的营业厅 App 进行问题诊断", {
    phone: z.string().describe("用户手机号"),
    issue_type: z.enum(["app_locked", "login_failed", "device_incompatible", "suspicious_activity"]).describe("故障类型"),
  }, async ({ phone, issue_type }) => {
    const t0 = performance.now();
    try {
      const res = await backendPost<{
        success: boolean; issue_type?: string; lock_reason?: string;
        diagnostic_steps?: any[]; conclusion?: string;
        escalation_path?: string; customer_actions?: string[];
      }>('/api/diagnosis/app/analyze', { msisdn: phone, issue_type });

      if (!res.success) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ phone, issue_type, diagnostic_steps: [], conclusion: null, escalation_path: null, customer_actions: [], risk_level: "none", next_step: null, action_count: 0, lock_reason: null }) }] };
      }

      const steps = res.diagnostic_steps ?? [];
      const hasError = steps.some((s: any) => s.status === "error");
      const hasEscalate = steps.some((s: any) => s.escalate);
      const riskLevel = hasEscalate && hasError ? "high" : hasEscalate ? "medium" : hasError ? "low" : "none";
      const escalationPath = res.escalation_path ?? "self_service";
      const nextStep = escalationPath === "security_team"
        ? "检测到高风险问题，请立即转接安全团队处理，请勿让客户继续尝试登录。"
        : escalationPath === "frontline"
        ? "自助排查已完成但问题未解决，需转一线客服获取截图进行人工审查。"
        : hasError
        ? "发现可修复问题，请引导客户按建议操作后重新尝试。"
        : "所有检查项通过，请引导客户重新尝试登录。";

      mcpLog("diagnosis", "diagnose_app", { phone, issue_type, risk_level: riskLevel, success: true, ms: Math.round(performance.now() - t0) });
      return { content: [{ type: "text" as const, text: JSON.stringify({
        phone,
        issue_type: res.issue_type ?? issue_type,
        diagnostic_steps: steps,
        conclusion: res.conclusion ?? null,
        escalation_path: escalationPath,
        customer_actions: res.customer_actions ?? [],
        risk_level: riskLevel,
        next_step: nextStep,
        action_count: (res.customer_actions ?? []).length,
        lock_reason: res.lock_reason !== "unknown" ? res.lock_reason : null,
      }) }] };
    } catch (err) {
      mcpLog("diagnosis", "diagnose_app", { phone, issue_type, error: String(err), ms: Math.round(performance.now() - t0) });
      return { content: [{ type: "text" as const, text: JSON.stringify({ phone, issue_type, diagnostic_steps: [], conclusion: null, escalation_path: null, customer_actions: [], risk_level: "none", next_step: null, action_count: 0, lock_reason: null }) }] };
    }
  });

}

function createServer(): McpServer {
  const server = new McpServer({ name: "diagnosis-service", version: "2.0.0" });
  registerDiagnosisTools(server);
  return server;
}

startMcpHttpServer("diagnosis-service", Number(process.env.PORT ?? 18005), createServer);
