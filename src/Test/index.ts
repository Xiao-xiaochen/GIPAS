import { Context } from 'koishi';
import { Config } from '../config';

// GIPAS的测试模块
import { HolidayTest } from './HolidayTest';

// 导出单独的函数供其他模块使用
export { HolidayTest };

// 测试系统统一入口
export function TestSystem(ctx: Context, config: Config) {
  const logger = ctx.logger('gipas:test-system');

  // GIPAS的Debug功能
  logger.info('加载测试功能...');
  HolidayTest(ctx, config);

  logger.info('测试系统已启用');
}