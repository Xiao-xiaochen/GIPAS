import { Context } from 'koishi';
import { Config } from '../../config';
import { addSystemStatusCommands } from './SystemStatus';
import { addQuickStatusCommands } from './QuickStatus';
import { addChartCommands } from './Chart/PieChart';

export function registerGIPASInfoCommands(ctx: Context, config: Config) {
  // 注册系统状态命令
  addSystemStatusCommands(ctx, config);
  
  // 注册快速状态命令
  addQuickStatusCommands(ctx, config);
  
  // 注册图表命令
  addChartCommands(ctx, config);
}
