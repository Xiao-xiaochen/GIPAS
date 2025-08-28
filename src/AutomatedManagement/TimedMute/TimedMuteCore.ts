import { Context } from 'koishi';
import { Config } from '../../config';
import { SetGroupMute } from '../../Utils/OneBot/OnebotOperate';
import { HolidayService } from '../../Utils/System/HolidayService';

// 全局锁，防止多个 TimedMute 实例同时运行
let globalTimedMuteInstance: any = null;

export function TimedMute(ctx: Context, config: Config) {
  // 如果已经有实例在运行，先清理它
  if (globalTimedMuteInstance) {
    const logger = ctx.logger('gipas:timed-mute');
    logger.warn('检测到已存在的 TimedMute 实例，正在清理...');
    
    // 触发之前实例的清理
    if (globalTimedMuteInstance.dispose) {
      globalTimedMuteInstance.dispose();
    }
    globalTimedMuteInstance = null;
  }
  const logger = ctx.logger('gipas:timed-mute');
  const holidayService = new HolidayService(ctx, config);
  
  // 存储已注册的定时任务
  const registeredJobs = new Map<string, () => void>();
  // 存储手动覆盖设置
  const manualOverrides = new Map<string, { date: string; useHolidayConfig: boolean; setBy: string; setAt: Date }>();
  // 防止重复初始化的标志
  let isInitializing = false;
  let isInitialized = false;

  // 初始化定时禁言
  async function initTimedMute(force: boolean = false) {
    if (isInitializing) {
      logger.warn('定时禁言系统正在初始化中，跳过重复初始化');
      return;
    }
    
    if (isInitialized && !force) {
      logger.debug('定时禁言系统已初始化，跳过重复初始化');
      return;
    }
    
    isInitializing = true;
    
    try {
      logger.info('开始初始化定时禁言系统');
      
      // 清除之前的定时任务（除了daily-reset任务）
      const dailyResetDispose = registeredJobs.get('daily-reset');
      registeredJobs.forEach((dispose, key) => {
        if (key !== 'daily-reset') {
          dispose();
        }
      });
      registeredJobs.clear();
      
      // 重新添加daily-reset任务
      if (dailyResetDispose) {
        registeredJobs.set('daily-reset', dailyResetDispose);
      }

      // 为每个配置的群组设置定时任务
      for (const groupConfig of config.timedMuteGroups) {
        await setupGroupSchedules(groupConfig);
      }
      
      isInitialized = true;
      logger.info('定时禁言系统初始化完成');
    } catch (error) {
      logger.error('定时禁言系统初始化失败:', error);
    } finally {
      isInitializing = false;
    }
  }

  // 为单个群组设置定时任务
  async function setupGroupSchedules(groupConfig: any) {
    const { guildId } = groupConfig;
    
    try {
      // 检查是否已经为该群组设置过任务
      const existingJobs = Array.from(registeredJobs.keys()).filter(key => key.includes(guildId));
      if (existingJobs.length > 0) {
        logger.debug(`群组 ${guildId} 已存在定时任务，跳过重复设置`);
        return;
      }
      
      // 获取明天的日期
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];
      
      // 判断明天应该使用哪种配置
      const scheduleType = await determineScheduleType(guildId, tomorrowStr);
      const schedules = scheduleType === 'holiday' 
        ? groupConfig.holidaySchedules 
        : groupConfig.workdaySchedules;
      
      logger.info(`群组 ${guildId} 明天 (${tomorrowStr}) 将使用${scheduleType === 'holiday' ? '节假日' : '工作日'}配置`);
      
      // 设置第一组定时任务
      if (schedules.schedule1.enabled) {
        await setupScheduleWithNotifications(
          guildId, 
          schedules.schedule1.muteTime, 
          schedules.schedule1.unmuteTime, 
          `${scheduleType === 'holiday' ? '节假日' : '工作日'}第一组`
        );
      }

      // 设置第二组定时任务
      if (schedules.schedule2.enabled) {
        await setupScheduleWithNotifications(
          guildId, 
          schedules.schedule2.muteTime, 
          schedules.schedule2.unmuteTime, 
          `${scheduleType === 'holiday' ? '节假日' : '工作日'}第二组`
        );
      }
      
    } catch (error) {
      logger.error(`设置群组 ${guildId} 定时任务失败:`, error);
    }
  }

  // 判断指定日期应该使用哪种配置
  async function determineScheduleType(guildId: string, date: string): Promise<'workday' | 'holiday'> {
    try {
      // 1. 检查手动覆盖
      const overrideKey = `${guildId}-${date}`;
      const override = manualOverrides.get(overrideKey);
      if (override) {
        logger.info(`群组 ${guildId} 日期 ${date} 使用手动设置: ${override.useHolidayConfig ? '节假日' : '工作日'}配置`);
        return override.useHolidayConfig ? 'holiday' : 'workday';
      }
      
      // 2. 使用节假日API判断
      const dateType = await holidayService.getDateType(date);
      const isHolidayType = (dateType === 'holiday' || dateType === 'weekend');
      
      logger.info(`群组 ${guildId} 日期 ${date} API判断结果: ${dateType}, 使用${isHolidayType ? '节假日' : '工作日'}配置`);
      return isHolidayType ? 'holiday' : 'workday';
      
    } catch (error) {
      logger.warn(`判断群组 ${guildId} 日期 ${date} 配置类型失败，使用默认工作日配置:`, error);
      return 'workday';
    }
  }

  // 设置手动覆盖
  function setManualOverride(guildId: string, date: string, useHolidayConfig: boolean, setBy: string): void {
    const overrideKey = `${guildId}-${date}`;
    manualOverrides.set(overrideKey, {
      date,
      useHolidayConfig,
      setBy,
      setAt: new Date()
    });
    
    logger.info(`设置手动覆盖: 群组 ${guildId} 日期 ${date} 使用${useHolidayConfig ? '节假日' : '工作日'}配置 (设置者: ${setBy})`);
  }

  // 取消手动覆盖
  function clearManualOverride(guildId: string, date: string): boolean {
    const overrideKey = `${guildId}-${date}`;
    const existed = manualOverrides.has(overrideKey);
    manualOverrides.delete(overrideKey);
    
    if (existed) {
      logger.info(`取消手动覆盖: 群组 ${guildId} 日期 ${date}`);
    }
    
    return existed;
  }

  // 检查是否有手动覆盖
  function hasManualOverride(guildId: string, date: string): boolean {
    const overrideKey = `${guildId}-${date}`;
    return manualOverrides.has(overrideKey);
  }

  // 获取手动覆盖信息
  function getManualOverride(guildId: string, date: string) {
    const overrideKey = `${guildId}-${date}`;
    return manualOverrides.get(overrideKey);
  }

  // 从cron表达式中提取分钟和小时
  function extractTimeFromCron(cronExpression: string): { minutes: number, hours: number } | null {
    try {
      // 假设cron表达式格式为 "秒 分 时 日 月 星期"
      const parts = cronExpression.split(' ');
      if (parts.length !== 6) return null;
      
      return {
        minutes: parseInt(parts[1]),
        hours: parseInt(parts[2])
      };
    } catch (error) {
      logger.error('解析cron表达式时间失败:', error);
      return null;
    }
  }

  // 发送群消息
  async function sendGroupMessage(guildId: string, message: string) {
    try {
      // 只使用OneBot协议的机器人发送消息，避免多个机器人同时发送
      const onebotBot = ctx.bots.find(bot => bot.platform === 'onebot');
      if (onebotBot) {
        await onebotBot.sendMessage(guildId, message);
      } else {
        logger.warn(`发送群消息失败 (${guildId}): 未找到OneBot协议机器人`);
      }
    } catch (error) {
      logger.error(`发送群消息失败 (${guildId}):`, error);
    }
  }

  // 设置带提醒的定时任务
  async function setupScheduleWithNotifications(guildId: string, muteTime: string, unmuteTime: string, scheduleName: string) {
    try {
      // 提取禁言时间的小时和分钟
      const timeInfo = extractTimeFromCron(muteTime);
      if (!timeInfo) {
        logger.error(`无法解析禁言时间: ${muteTime}`);
        return;
      }
      
      const { hours, minutes } = timeInfo;
      
      // 设置提醒任务 (5分钟前)
      let remind5MinHour = hours;
      let remind5MinMinute = minutes - 5;
      if (remind5MinMinute < 0) {
        remind5MinMinute += 60;
        remind5MinHour = (remind5MinHour - 1 + 24) % 24;
      }
      const remind5minCron = `0 ${remind5MinMinute} ${remind5MinHour} * * *`;
      const remind5minKey = `remind5-${guildId}-${scheduleName}`;
      const remind5minDispose = ctx.cron(remind5minCron, async () => {
        await sendGroupMessage(guildId, `⚠️ 提醒：5分钟后将开始禁言 (${scheduleName})`);
      });
      registeredJobs.set(remind5minKey, remind5minDispose);
      
      // 设置提醒任务 (3分钟前)
      let remind3MinHour = hours;
      let remind3MinMinute = minutes - 3;
      if (remind3MinMinute < 0) {
        remind3MinMinute += 60;
        remind3MinHour = (remind3MinHour - 1 + 24) % 24;
      }
      const remind3minCron = `0 ${remind3MinMinute} ${remind3MinHour} * * *`;
      const remind3minKey = `remind3-${guildId}-${scheduleName}`;
      const remind3minDispose = ctx.cron(remind3minCron, async () => {
        await sendGroupMessage(guildId, `⚠️ 提醒：3分钟后将开始禁言 (${scheduleName})`);
      });
      registeredJobs.set(remind3minKey, remind3minDispose);
      
      // 设置提醒任务 (1分钟前)
      let remind1MinHour = hours;
      let remind1MinMinute = minutes - 1;
      if (remind1MinMinute < 0) {
        remind1MinMinute += 60;
        remind1MinHour = (remind1MinHour - 1 + 24) % 24;
      }
      const remind1minCron = `0 ${remind1MinMinute} ${remind1MinHour} * * *`;
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
          
          // 获取可用的 OneBot 协议机器人
          const onebotBot = ctx.bots.find(bot => bot.platform === 'onebot');
          
          if (!onebotBot) {
            logger.error(`群组 ${guildId} 定时禁言失败: 未找到 OneBot 协议机器人 (${scheduleName})`);
            return;
          }
          
          // 创建一个临时session用于执行禁言操作
          const session = {
            guildId: guildId,
            bot: onebotBot,
            platform: 'onebot'
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
          
          // 获取可用的 OneBot 协议机器人
          const onebotBot = ctx.bots.find(bot => bot.platform === 'onebot');
          
          if (!onebotBot) {
            logger.error(`群组 ${guildId} 定时解禁失败: 未找到 OneBot 协议机器人 (${scheduleName})`);
            return;
          }
          
          // 创建一个临时session用于执行解禁操作
          const session = {
            guildId: guildId,
            bot: onebotBot,
            platform: 'onebot'
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

  // 每天凌晨重新设置定时任务
  const dailyResetDispose = ctx.cron('0 0 0 * * *', async () => {
    logger.info('每日重置定时禁言任务');
    await initTimedMute(true);
  });
  registeredJobs.set('daily-reset', dailyResetDispose);

  // 监听配置变化，重新初始化定时任务（防止重复初始化）
  let configChangeTimeout: NodeJS.Timeout | null = null;
  ctx.on('config', () => {
    if (isInitializing) {
      logger.debug('定时禁言系统正在初始化中，忽略配置变化事件');
      return;
    }
    
    // 使用防抖机制，避免配置频繁变化导致的重复初始化
    if (configChangeTimeout) {
      clearTimeout(configChangeTimeout);
    }
    
    configChangeTimeout = setTimeout(async () => {
      logger.info('配置已更新，重新初始化定时禁言任务');
      await initTimedMute(true);
      configChangeTimeout = null;
    }, 500); // 500ms防抖延迟
  });

  // 插件启动时初始化（只初始化一次）
  let readyInitialized = false;
  ctx.on('ready', () => {
    if (isInitialized || readyInitialized) {
      logger.debug('定时禁言系统已初始化，跳过重复初始化');
      return;
    }
    
    readyInitialized = true;
    setTimeout(async () => {
      logger.info('插件启动，初始化智能定时禁言系统');
      await initTimedMute();
    }, 1000);
  });

  // 创建清理函数
  const disposeInstance = () => {
    logger.info('清理定时禁言任务');
    
    // 清理配置变化的防抖定时器
    if (configChangeTimeout) {
      clearTimeout(configChangeTimeout);
      configChangeTimeout = null;
    }
    
    // 清理所有注册的定时任务
    registeredJobs.forEach(dispose => dispose());
    registeredJobs.clear();
    
    // 清理手动覆盖设置
    manualOverrides.clear();
    
    // 重置初始化状态
    isInitializing = false;
    isInitialized = false;
    
    // 清理全局实例引用
    if (globalTimedMuteInstance === instanceAPI) {
      globalTimedMuteInstance = null;
    }
    
    logger.info('定时禁言任务清理完成');
  };

  // 插件卸载时清理定时任务
  ctx.on('dispose', disposeInstance);

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
        return `群组 ${guildId} 未配置智能定时禁言`;
      }

      try {
        // 获取明天的配置类型
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split('T')[0];
        
        const scheduleType = await determineScheduleType(guildId, tomorrowStr);
        const isManual = hasManualOverride(guildId, tomorrowStr);
        const schedules = scheduleType === 'holiday' 
          ? groupConfig.holidaySchedules 
          : groupConfig.workdaySchedules;

        let status = `📅 群组 ${guildId} 智能定时禁言状态:\n\n`;
        status += `🎯 明天 (${tomorrowStr}) 配置类型: ${scheduleType === 'holiday' ? '节假日' : '工作日'}\n`;
        status += `⚙️ 设置方式: ${isManual ? '手动设置' : '自动判断'}\n\n`;
        
        if (schedules.schedule1.enabled) {
          status += `第一组: 启用\n  禁言时间: ${schedules.schedule1.muteTime}\n  解禁时间: ${schedules.schedule1.unmuteTime}\n`;
        } else {
          status += `第一组: 禁用\n`;
        }

        if (schedules.schedule2.enabled) {
          status += `第二组: 启用\n  禁言时间: ${schedules.schedule2.muteTime}\n  解禁时间: ${schedules.schedule2.unmuteTime}`;
        } else {
          status += `第二组: 禁用`;
        }

        status += `\n\n💡 系统会在禁言前5分钟、3分钟、1分钟发送提醒`;
        status += `\n🎛️ 支持工作日/节假日不同配置，自动识别中国法定节假日`;

        return status;
      } catch (error) {
        logger.error('获取定时禁言状态失败:', error);
        return '获取定时禁言状态失败，请查看日志';
      }
    });

  ctx.command('重载定时禁言', { authority: 4 })
    .action(async () => {
      try {
        await initTimedMute(true);
        return '智能定时禁言任务已重新加载';
      } catch (error) {
        logger.error('重载定时禁言任务失败:', error);
        return '重载定时禁言任务失败，请查看日志';
      }
    });

  // 导出管理函数供其他模块使用
  const instanceAPI = {
    setManualOverride,
    clearManualOverride,
    hasManualOverride,
    getManualOverride,
    determineScheduleType,
    initTimedMute,
    dispose: disposeInstance
  };

  // 设置全局实例引用
  globalTimedMuteInstance = instanceAPI;
  
  return instanceAPI;
}
