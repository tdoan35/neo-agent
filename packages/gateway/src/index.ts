export { startGateway, checkPidFile, DEFAULT_GATEWAY_CONFIG } from './daemon.js';
export type { Gateway, GatewayConfig } from './daemon.js';
export { startHealthServer } from './health.js';
export type { HealthServer } from './health.js';
export { runDiagnostics } from './doctor.js';
export type { DiagnosticResult } from './doctor.js';
export { ProcessManager } from './process-mgr/manager.js';
export type { ManagedProcess, ProcessStatus } from './process-mgr/manager.js';
