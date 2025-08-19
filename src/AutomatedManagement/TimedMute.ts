import { Context } from 'koishi';
import { Config } from '../config';
import { SetGroupMute } from '../Utils/OnebotOperate';

export function TimedMute(ctx: Context, config: Config) {
  const logger = ctx.logger('gipas:timed-mute');
  
  // 存储已注册的定时任务
  const registeredJobs = new Map<string, () => void>();

  // 初始化定时禁言
  function initTimedMute() {
    // 清除之前的定时任务
    registeredJobs.forEach(dispose => dispose());
    registeredJobs.clear();

    // 为每个配置的群组设置定时任务
    config.timedMuteGroups.forEach(groupConfig => {
      const { guildId, schedule1, schedule2 } = groupConfig;

      // 设置第一组定时任务
      if (schedule1.enabled) {
        setupScheduleWithNotifications(guildId, schedule1.muteTime, schedule1.unmuteTime, '第一组');
      }

      // 设置第二组定时任务
      if (schedule2.enabled) {
        setupScheduleWithNotifications(guildId, schedule2.muteTime, schedule2.unmuteTime, '第二组');
      }
    });
  }

  // 解析 cron 表达式获取下次执行时间
  function getNextExecutionTime(cronExpression: string): Date | null {
    try {
      // 简单的 cron 解析，假设格式为 "秒 分 时 日 月 星期"
      const parts = cronExpression.split(' ');
      if (parts.length !== 6) return null;

      const [sec, min, hour] = parts;
      const now = new Date();
      const next = new Date();
      
      next.setHours(parseInt(hour), parseInt(min), parseInt(sec), 0);
      
      // 如果时间已过，设置为明天
      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }
      
      return next;
    } catch (error) {
      logger.error('解析 cron 表达式失败:', error);
      return null;
    }
  }

  // 发送群消息
  async function sendGroupMessage(guildId: string, message: string) {
    try {
      const bot = ctx.bots[0];
      if (bot) {
        await bot.sendMessage(guildId, message);
      }
    } catch (error) {
      logger.error(`发送群消息失败 (${guildId}):`, error);
    }
  }

  // 设置带提醒的定时任务
  function setupScheduleWithNotifications(guildId: string, muteTime: string, unmuteTime: string, scheduleName: string) {
    try {
      // 获取禁言时间
      const muteDateTime = getNextExecutionTime(muteTime);
      if (!muteDateTime) {
        logger.error(`无法解析禁言时间: ${muteTime}`);
        return;
      }

      // 设置提醒任务 (5分钟前)
      const remind5min = new Date(muteDateTime.getTime() - 5 * 60 * 1000);
      const remind5minCron = `${remind5min.getSeconds()} ${remind5min.getMinutes()} ${remind5min.getHours()} * * *`;
      const remind5minKey = `remind5-${guildId}-${scheduleName}`;
      const remind5minDispose = ctx.cron(remind5minCron, async () => {
        await sendGroupMessage(guildId, `⚠️ 提醒：5分钟后将开始禁言 (${scheduleName})`);
      });
      registeredJobs.set(remind5minKey, remind5minDispose);

      // 设置提醒任务 (3分钟前)
      const remind3min = new Date(muteDateTime.getTime() - 3 * 60 * 1000);
      const remind3minCron = `${remind3min.getSeconds()} ${remind3min.getMinutes()} ${remind3min.getHours()} * * *`;
      const remind3minKey = `remind3-${guildId}-${scheduleName}`;
      const remind3minDispose = ctx.cron(remind3minCron, async () => {
        await sendGroupMessage(guildId, `⚠️ 提醒：3分钟后将开始禁言 (${scheduleName})`);
      });
      registeredJobs.set(remind3minKey, remind3minDispose);

      // 设置提醒任务 (1分钟前)
      const remind1min = new Date(muteDateTime.getTime() - 1 * 60 * 1000);
      const remind1minCron = `${remind1min.getSeconds()} ${remind1min.getMinutes()} ${remind1min.getHours()} * * *`;
      const remind1minKey = `remind1-${guildId}-${scheduleName}`;
      const remind1minDispose = ctx.cron(remind1minCron, async () => {
        await sendGroupMessage(guildId, `⚠️ 提醒：1分钟后将开始禁言 (${scheduleName})`);
      });
      registeredJobs.set(remind1minKey, remind1minDispose);

      // 注册禁言定时任务
      const muteJobKey = `mute-${guildId}-${scheduleName}`;
      const muteDispose = ctx.cron(muteTime, async () => {
        try {
          logger.info(`执行定时禁言: 群组 ${guildId} (${scheduleName})`);
          
          // 创建一个临时session用于执行禁言操作
          const session = {
            guildId: guildId,
            bot: ctx.bots[0] // 使用第一个可用的bot
          };
          
          if (session.bot) {
            await SetGroupMute(ctx, session as any, guildId, true);
            await sendGroupMessage(guildId, `🔇 定时禁言已生效 (${scheduleName})`);
            logger.info(`群组 ${guildId} 定时禁言成功 (${scheduleName})`);
          } else {
            logger.error(`群组 ${guildId} 定时禁言失败: 没有可用的bot (${scheduleName})`);
          }
        } catch (error) {
          logger.error(`群组 ${guildId} 定时禁言失败 (${scheduleName}):`, error);
        }
      });
      registeredJobs.set(muteJobKey, muteDispose);

      // 注册解禁定时任务
      const unmuteJobKey = `unmute-${guildId}-${scheduleName}`;
      const unmuteDispose = ctx.cron(unmuteTime, async () => {
        try {
          logger.info(`执行定时解禁: 群组 ${guildId} (${scheduleName})`);
          
          // 创建一个临时session用于执行解禁操作
          const session = {
            guildId: guildId,
            bot: ctx.bots[0] // 使用第一个可用的bot
          };
          
          if (session.bot) {
            await SetGroupMute(ctx, session as any, guildId, false);
            await sendGroupMessage(guildId, `🔊 定时解禁已生效 (${scheduleName})`);
            logger.info(`群组 ${guildId} 定时解禁成功 (${scheduleName})`);
          } else {
            logger.error(`群组 ${guildId} 定时解禁失败: 没有可用的bot (${scheduleName})`);
          }
        } catch (error) {
          logger.error(`群组 ${guildId} 定时解禁失败 (${scheduleName}):`, error);
        }
      });
      registeredJobs.set(unmuteJobKey, unmuteDispose);

      logger.info(`已设置群组 ${guildId} 的定时任务 (${scheduleName}): 禁言 ${muteTime}, 解禁 ${unmuteTime}`);
      logger.info(`已设置提醒任务: 5分钟前、3分钟前、1分钟前`);
    } catch (error) {
      logger.error(`设置群组 ${guildId} 定时任务失败 (${scheduleName}):`, error);
    }
  }

  // 监听配置变化，重新初始化定时任务（但避免无限循环）
  let isInitializing = false;
  ctx.on('config', () => {
    if (isInitializing) return;
    logger.info('配置已更新，重新初始化定时禁言任务');
    isInitializing = true;
    setTimeout(() => {
      initTimedMute();
      isInitializing = false;
    }, 100);
  });

  // 插件启动时初始化（延迟执行避免配置冲突）
  ctx.on('ready', () => {
    setTimeout(() => {
      logger.info('初始化定时禁言系统');
      initTimedMute();
    }, 1000);
  });

  // 插件卸载时清理定时任务
  ctx.on('dispose', () => {
    logger.info('清理定时禁言任务');
    registeredJobs.forEach(dispose => dispose());
    registeredJobs.clear();
  });

  // 添加手动控制命令
  ctx.command('定时禁言状态', { authority: 3 })
    .action(async ({ session }) => {
      if (!session) {
        return '无效的会话';
      }

      const guildId = session.guildId;
      if (!guildId) {
        return '无效的频道';
      }

      const groupConfig = config.timedMuteGroups.find(g => g.guildId === guildId);
      if (!groupConfig) {
        return `群组 ${guildId} 未配置定时禁言`;
      }

      let status = `群组 ${guildId} 定时禁言状态:\n`;
      
      if (groupConfig.schedule1.enabled) {
        status += `第一组: 启用\n  禁言时间: ${groupConfig.schedule1.muteTime}\n  解禁时间: ${groupConfig.schedule1.unmuteTime}\n`;
      } else {
        status += `第一组: 禁用\n`;
      }

      if (groupConfig.schedule2.enabled) {
        status += `第二组: 启用\n  禁言时间: ${groupConfig.schedule2.muteTime}\n  解禁时间: ${groupConfig.schedule2.unmuteTime}`;
      } else {
        status += `第二组: 禁用`;
      }

      status += `\n\n💡 系统会在禁言前5分钟、3分钟、1分钟发送提醒`;

      return status;
    });

  ctx.command('重载定时禁言', { authority: 4 })
    .action(async () => {
      try {
        initTimedMute();
        return '定时禁言任务已重新加载';
      } catch (error) {
        logger.error('重载定时禁言任务失败:', error);
        return '重载定时禁言任务失败，请查看日志';
      }
    });
}