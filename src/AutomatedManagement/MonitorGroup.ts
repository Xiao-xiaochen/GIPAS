// MonitorGroup.ts

import { Context } from 'koishi';
import { Config } from '../config'; 
// 导入 GuildMessageHistories，因为这里要管理它
import { GuildMessageHistories } from '../index'; // 从 index.ts 导入，因为它在那里声明

// 移除 GoogleGenAI 和 Content 的导入，因为这个文件不再直接与 Gemini API 交互

export async function InitializeChatSession(ctx: Context, config: Config, guildId: string): Promise<boolean> {
  // 不再创建 Gemini Chat 实例

  // 确保消息历史 Map 中有该群组的条目
  if (!GuildMessageHistories.has(guildId)) {
    GuildMessageHistories.set(guildId, []); // 初始化为空数组
    ctx.logger('gipas').info(`为群组 ${guildId} 初始化消息历史记录。`);
  } else {
    ctx.logger('gipas').debug(`群组 ${guildId} 的消息历史记录已存在。`);
  }

  // 始终返回 true，表示该群组的基础会话（现在主要是消息历史）已准备好
  return true; 
}