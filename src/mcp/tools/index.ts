import { ToolRegistry } from '../tool-registry.js';
import { zcwChangeDetailTool } from './change-detail.js';
import { zcwDashboardSnapshotTool } from './dashboard-snapshot.js';
import { zcwDoctorTool } from './doctor.js';
import { zcwStatusTool } from './status.js';

export function createZCWMcpRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(zcwStatusTool);
  registry.register(zcwDashboardSnapshotTool);
  registry.register(zcwChangeDetailTool);
  registry.register(zcwDoctorTool);
  return registry;
}
