


// 插件核心逻辑
import { Context , Session } from 'koishi'
import { } from "koishi-plugin-cron"; 
import { Database } from './models';
import { Config as ConfigInterface } from './config';
export const name = 'gipas'
export const inject = { 
  required: [ 'cron', 'database' ] 
}
export { Config } from './config';


// GIPAS自动化管理模块
import { AutomatedManagement, InitializeChatSession, HandleMessage } from './AutomatedManagement/index'


// GIPAS手动管理模块
import { ManualManagement } from './ManualManagement';

// GIPAS威权民主选举模块
import { AuthoritarianDemocracy } from './AuthoritarianDemocracy';

// GIPAS测试模块
import { TestSystem } from './Test';



export const GuildMessageHistories: Map<string, { user: string; content: string; timestamp: Date }[]> = new Map();

export function apply(ctx: Context, config: ConfigInterface) {
  ctx.logger('gipas').info('插件已加载');

  // GIPAS核心逻辑
  Database(ctx);

  // GIPAS的测试功能
  TestSystem(ctx, config);

  // GIPAS的自动化管理功能
  AutomatedManagement(ctx, config);

  // GIPAS的手动管理功能
  ManualManagement(ctx, config);

  // GIPAS的威权民主选举功能
  AuthoritarianDemocracy(ctx, config);



  // GIPAS的监听功能
  const initializationPromises: Promise<boolean>[] = [];
  const GuildToInit = new Set(config.MonitoredGuildIds); 
  if (config.geminiApiKey) { // 这里虽然检查 API Key，但 InitializeChatSession 不再创建 Gemini 实例
    GuildToInit.forEach(guildId => {
      ctx.logger('gipas').info(`插件启动时，尝试为预设群组 ${guildId} 初始化消息历史...`);
      initializationPromises.push(InitializeChatSession(ctx, config, guildId));
    });
  } else {
    ctx.logger('gipas').warn('未配置 Gemini API Key，跳过预设群组的初始化。');
  }

  Promise.allSettled(initializationPromises).then(results => {
    results.forEach((result, index) => {
      const guildId = Array.from(GuildToInit)[index]; 
      if (result.status === 'fulfilled' && result.value) {
        ctx.logger('gipas').info(`预设群组 ${guildId} 初始化完成。`);
      } else {
        ctx.logger('gipas').error(`预设群组 ${guildId} 初始化失败: ${result.status === 'rejected' ? result.reason : '初始化函数返回false'}`);
      }
    });
    ctx.logger('gipas').info('所有预设群组初始化尝试完成。');
  }).catch(error => {
    ctx.logger('gipas').error('初始化预设群组时发生未预料的错误:', error);
  });

  ctx.middleware(async (session, next) => {
    const Content = session.content;
    if ( !Content ) {
      return;
    };
    const UserId = session.userId;
    if ( !UserId ) {
      return;
    };
    const GuildId = session.guildId;
    if ( !GuildId ) {
      return;
    };

    if ( !config.MonitoredGuildIds.includes( GuildId ) || session.selfId === session.userId ) {
      return next();
    };

    // 确保消息历史已初始化
    if ( !GuildMessageHistories.has( GuildId ) ) {
      ctx.logger('gipas').info(`消息触发群组 ${GuildId} 消息历史初始化...`);
      // InitializeChatSession 现在只负责初始化历史
      if ( !( await InitializeChatSession( ctx , config , GuildId ) ) ) { 
        ctx.logger('gipas').warn(`无法为频道 ${session.channelId} 初始化消息历史，消息处理跳过。`);
        return next(); 
      }
      ctx.logger('gipas').info(`群组 ${GuildId} 消息历史通过消息触发初始化完成。`);
    };

    const history = GuildMessageHistories.get( GuildId ) || [];
    // 确保 history 确实存在，理论上上面初始化后应该存在
    if( !GuildMessageHistories.has( GuildId ) ) { // 这个判断可能冗余，因为上面已经执行过
      GuildMessageHistories.set( GuildId, history );
    };
    const now = Date.now();
    history.push({ user: UserId, content: Content, timestamp: new Date(now) });
    // 历史消息长度和时间窗口管理
    while (history.length > config.MaxChatHistoryLength || (history.length > 0 && history[0].timestamp.getTime() < now - (5 * 60 * 1000))) {
      history.shift();
    }
    
    // **核心修改：不再获取 chatSession 并传递**
    // HandleMessage 不再需要 chatSession 参数了
    await HandleMessage( ctx , session , config, config.Rules, history); 
    return next();
  });

}