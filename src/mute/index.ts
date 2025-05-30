// mute module
import { Config } from '../config';
import { Context, Session } from 'koishi';

export async function setGuildMute(guildId: string, mute: boolean, ctx: Context, config: Config, session?: Session) {
  if (!guildId) {
    ctx.logger('gipas').warn('无法执行全体禁言/解禁：未设置激活的服务器ID。');
    return;
  }
  const actionText = mute ? '禁言' : '解除禁言';
  try {
    let botPlatform: string | undefined;
    let botId: string | undefined;

    if (session && session.platform && session.selfId) {
      botPlatform = session.platform;
      botId = session.selfId;
      ctx.logger('gipas').debug(`从 session 获取到 platform: ${botPlatform}, selfId: ${botId}`);
    } else if (config.cronBotPlatform && config.cronBotSelfId) {
      botPlatform = config.cronBotPlatform;
      botId = config.cronBotSelfId;
      ctx.logger('gipas').debug(`从 config 获取到定时任务机器人 platform: ${botPlatform}, selfId: ${botId}`);
    } else {
      ctx.logger('gipas').error('无法确定用于禁言操作的机器人实例。请检查配置或确保在有 session 的上下文调用。');
      return;
    }

    if (!botPlatform || !botId) {
       ctx.logger('gipas').error(`获取到的机器人 platform 或 selfId 为空。Platform: ${botPlatform}, ID: ${botId}`);
       return;
    }

    const bot = ctx.bots[`${botPlatform}:${botId}`];
    if (!bot) {
      ctx.logger('gipas').error(`无法获取机器人实例 (Platform: ${botPlatform}, ID: ${botId})。请检查机器人是否已连接。`);
      return;
    }
    ctx.logger('gipas').info(`开始为服务器 ${guildId} 执行全体${actionText}操作 (API: set_group_whole_ban)...`);
    const numericGuildId = parseInt(guildId);
    if (isNaN(numericGuildId)) {
      ctx.logger('gipas').error(`无法执行全体${actionText}：服务器ID "${guildId}" 不是有效的数字。`);
      return;
    }
    ctx.logger('gipas').debug(`原始 guildId: "${guildId}", 解析后 numericGuildId: ${numericGuildId}`);

    try {
      if (bot.internal?.setGroupWholeBan) {
        ctx.logger('gipas').info(`尝试使用 bot.internal.setGroupWholeBan 对服务器 ${numericGuildId} 执行全体${actionText}。`);
        await bot.internal.setGroupWholeBan(numericGuildId, mute);
        ctx.logger('gipas').info(`服务器 ${numericGuildId} 全体${actionText} (via bot.internal.setGroupWholeBan) 调用成功。`);
      } else if (typeof (bot as any).invoke === 'function') {
        ctx.logger('gipas').info(`尝试使用 (bot as any).invoke('set_group_whole_ban') 对服务器 ${numericGuildId} 执行全体${actionText}。`);
        await (bot as any).invoke('set_group_whole_ban', { group_id: numericGuildId, enable: mute });
        ctx.logger('gipas').info(`服务器 ${numericGuildId} 全体${actionText} (via invoke) 调用成功。`);
      } else {
        ctx.logger('gipas').error(`机器人实例上既没有 internal.setGroupWholeBan 方法，也没有 invoke 方法。无法执行全体${actionText}。`);
        return;
      }
    } catch (e) {
      ctx.logger('gipas').error(`执行全体${actionText}API调用失败 (服务器 ${numericGuildId}):`, e.message || e);
    }
  } catch (error) {
    ctx.logger('gipas').error(`执行全体${actionText}时发生错误:`, error);
  }
}

export function registerMuteCronJobs(ctx: Context, config: Config, getActiveGuildId: () => string | null) {
  ctx.cron(config.muteCron, () => {
    const activeGuildId = getActiveGuildId();
    if (activeGuildId) {
        ctx.logger('gipas').info(`触发工作日禁言任务 (Cron: ${config.muteCron})`);
        setGuildMute(activeGuildId, true, ctx, config);
    }
  });
  ctx.cron(config.unmuteCron, () => {
    const activeGuildId = getActiveGuildId();
    if (activeGuildId) {
        ctx.logger('gipas').info(`触发工作日解禁任务 (Cron: ${config.unmuteCron})`);
        setGuildMute(activeGuildId, false, ctx, config);
    }
  });
  ctx.cron(config.weekendMuteCron, () => {
    const activeGuildId = getActiveGuildId();
    if (activeGuildId) {
        ctx.logger('gipas').info(`触发周末禁言任务 (Cron: ${config.weekendMuteCron})`);
        setGuildMute(activeGuildId, true, ctx, config);
    }
  });
  ctx.cron(config.weekendUnmuteCron, () => {
    const activeGuildId = getActiveGuildId();
    if (activeGuildId) {
        ctx.logger('gipas').info(`触发周末解禁任务 (Cron: ${config.weekendUnmuteCron})`);
        setGuildMute(activeGuildId, false, ctx, config);
    }
  });
}
