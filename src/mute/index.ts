// mute module
import { Context } from 'koishi';
import { Config } from '../index';

export async function setGuildMute(guildId: string, mute: boolean, ctx: Context, config: Config) {
  if (!guildId) {
    ctx.logger('gipas').warn('无法执行全体禁言/解禁：未设置激活的服务器ID。');
    return;
  }
  const actionText = mute ? '禁言' : '解除禁言';
  try {
    const botId = ctx.self;
    if (!botId) {
      ctx.logger('gipas').error('无法获取机器人自身ID (ctx.self)');
      return;
    }
    const bot = ctx.bots[`${ctx.platform}:${botId}`];
    if (!bot) {
      ctx.logger('gipas').error(`无法获取机器人实例 (Platform: ${ctx.platform}, ID: ${botId})。`);
      return;
    }
    ctx.logger('gipas').info(`开始为服务器 ${guildId} 执行全体${actionText}操作 (API: set_group_whole_ban)...`);
    try {
      await (bot as any).invoke('set_group_whole_ban', { group_id: parseInt(guildId), enable: mute });
      ctx.logger('gipas').info(`服务器 ${guildId} 全体${actionText}API调用成功。`);
    } catch (e) {
      ctx.logger('gipas').error(`执行全体${actionText}API调用失败 (服务器 ${guildId}):`, e.message || e);
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