
import { Context } from 'koishi';
import { Config } from '../config';

// GIPAS的档案系统
import { FileSystem } from './GroupFileSystem/ApplyFile';
import { ZanSystem } from './GroupFileSystem/Zan';

// GIPAS的自动管理模块
import { TimedMute } from './TimedMute/TimedMuteCore';
import { setupManualOverrideCommands } from './TimedMute/ManualOverrideCommands';

// GIPAS的监听系统
import { InitializeChatSession } from './ViolationMonitoring/MonitorGroup';
import { HandleMessage } from './ViolationMonitoring/HandleMessage';

// 导出单独的函数供其他模块使用
export { InitializeChatSession, HandleMessage, FileSystem, ZanSystem, TimedMute, setupManualOverrideCommands };

// 自动化管理系统统一入口
export function AutomatedManagement(ctx: Context, config: Config) {
  const logger = ctx.logger('gipas:automated-management');

  // GIPAS的档案系统功能
  logger.info('加载档案系统功能...');
  ZanSystem(ctx, config);
  FileSystem(ctx, config);

  // GIPAS的定时管理功能
  logger.info('加载定时管理功能...');
  const timedMuteCore = TimedMute(ctx, config);
  setupManualOverrideCommands(ctx, config, timedMuteCore);

  logger.info('自动化管理系统已启用');
  logger.info(`监控群组: ${config.MonitoredGuildIds.length}个`);
  logger.info(`定时禁言群组: ${config.timedMuteGroups.length}个`);
}
