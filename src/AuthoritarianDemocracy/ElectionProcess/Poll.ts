import { Context } from 'koishi';
import { Config } from '../../config';
import { ReelectionPoll } from './Poll/index';

// 保持向后兼容性，导出原有的函数
export { ReelectionPoll };

// 也可以直接调用新的模块化系统
export function ReelectionPollLegacy(ctx: Context, config: Config) {
  return ReelectionPoll(ctx, config);
}
