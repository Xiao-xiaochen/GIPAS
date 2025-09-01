import { Context } from 'koishi';
import { Config } from '../../config';
import { ImpeachmentCommands } from './ImpeachmentCommands';
import { ImpeachmentSessionManager } from './ImpeachmentSessionManager';

export function ImpeachmentProcess(ctx: Context, config: Config) {
  const logger = ctx.logger('gipas:impeachment-process');

  if (!config.electionEnabled) {
    logger.info('弹劾系统已禁用（选举系统未启用）');
    return;
  }

  // 初始化弹劾命令系统
  new ImpeachmentCommands(ctx, config);

  // 导出管理器供其他模块使用
  const sessionManager = new ImpeachmentSessionManager(ctx, config);

  logger.info('弹劾系统已启用');

  return {
    sessionManager
  };
}

// 导出类型和管理器
export { ImpeachmentSessionManager } from './ImpeachmentSessionManager';
export { ImpeachmentCommands } from './ImpeachmentCommands';