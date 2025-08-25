/**
 * GIPAS 工具函数统一入口
 * 
 * 工具函数按功能分类：
 * - AI: AI服务相关工具
 * - Election: 选举相关工具
 * - Group: 群组管理工具
 * - OneBot: OneBot协议工具
 * - System: 系统通用工具
 */

// AI服务工具
export * from './AI';

// 选举工具
export * from './Election';

// 群组管理工具
export * from './Group';

// 系统工具
export * from './System';

// 重新导出常用工具函数（保持向后兼容）
export { AIServiceManager } from './AI/AIServiceManager';
export { ElectionIdParser } from './Election/ElectionIdParser';
export { setGroupAdmin, batchSetGroupAdmin } from './Group/GroupAdminManagement';