/**
 * all.ts — 本地开发/测试时一键启动所有 MCP 服务
 *
 * 每个服务独立进程，任何一个 crash 不影响其他。
 */
import { spawn } from "node:child_process";
import path from "node:path";

const services = [
  { name: "user-info", file: "services/user_info_service.ts", port: process.env.PORT_USER_INFO ?? "18003" },
  { name: "business", file: "services/business_service.ts", port: process.env.PORT_BUSINESS ?? "18004" },
  { name: "diagnosis", file: "services/diagnosis_service.ts", port: process.env.PORT_DIAGNOSIS ?? "18005" },
  { name: "outbound", file: "services/outbound_service.ts", port: process.env.PORT_OUTBOUND ?? "18006" },
  { name: "account", file: "services/account_service.ts", port: process.env.PORT_ACCOUNT ?? "18007" },
];

const srcDir = path.dirname(new URL(import.meta.url).pathname);

for (const svc of services) {
  const child = spawn("node", ["--import", "tsx/esm", path.join(srcDir, svc.file)], {
    stdio: "inherit",
    env: { ...process.env, PORT: svc.port },
  });

  child.on("exit", (code) => {
    console.error(`[all] ${svc.name} exited with code ${code}`);
  });

  console.log(`[all] Starting ${svc.name} on port ${svc.port}`);
}
