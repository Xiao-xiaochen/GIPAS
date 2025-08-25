import { Context } from 'koishi';
import { Config } from '../config';

// GIPAS的手动管理模块
import { SetTitle } from './SetTitle';
import { GeneralMute } from './GeneralMute';
import { ClearReset } from './ClearRecord';

// 导出单独的函数供其他模块使用
export { SetTitle, GeneralMute, ClearReset };

// 手动管理系统统一入口
export function ManualManagement(ctx: Context, config: Config) {
  const logger = ctx.logger('gipas:manual-management');

  // GIPAS的手动管理功能
  logger.info('加载手动管理功能...');
  SetTitle(ctx);
  ClearReset(ctx);
  GeneralMute(ctx, config);

  logger.info('手动管理系统已启用');
}