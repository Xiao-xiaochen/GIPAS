import { Context } from 'koishi';
import { Config } from '../../config';

export function setupManualOverrideCommands(ctx: Context, config: Config, timedMuteCore: any) {
  const logger = ctx.logger('gipas:manual-override');

  // 设置明天禁言配置类型
  ctx.command('设置明天禁言 <type:string>', { authority: 3 })
    .usage('设置明天使用的禁言配置类型\n类型: 工作日 | 节假日')
    .example('设置明天禁言 节假日')
    .action(async ({ session }, type) => {
      if (!session?.guildId) {
        return '此命令只能在群聊中使用';
      }

      const guildId = session.guildId;
      
      // 检查群组是否已配置
      const groupConfig = config.timedMuteGroups.find(g => g.guildId === guildId);
      if (!groupConfig) {
        return `群组 ${guildId} 未配置智能定时禁言，请先在插件配置中添加此群组`;
      }

      // 验证类型参数
      if (!type || !['工作日', '节假日'].includes(type)) {
        return '请指定正确的配置类型: 工作日 或 节假日';
      }

      try {
        // 获取明天的日期
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split('T')[0];
        
        const useHolidayConfig = (type === '节假日');
        const userName = session.author?.nick || session.author?.username || session.userId;
        
        // 设置手动覆盖
        timedMuteCore.setManualOverride(guildId, tomorrowStr, useHolidayConfig, userName);
        
        // 重新初始化定时任务以应用新设置
        await timedMuteCore.initTimedMute(true);
        
        return `✅ 已设置群组 ${guildId} 明天 (${tomorrowStr}) 使用${type}配置\n设置者: ${userName}\n\n💡 系统将在今晚重新加载定时任务以应用此设置`;
        
      } catch (error) {
        logger.error('设置明天禁言配置失败:', error);
        return '设置失败，请查看日志或联系管理员';
      }
    });

  // 取消明天的手动设置
  ctx.command('取消明天禁言设置', { authority: 3 })
    .usage('取消明天的手动禁言配置设置，恢复自动判断')
    .action(async ({ session }) => {
      if (!session?.guildId) {
        return '此命令只能在群聊中使用';
      }

      const guildId = session.guildId;
      
      // 检查群组是否已配置
      const groupConfig = config.timedMuteGroups.find(g => g.guildId === guildId);
      if (!groupConfig) {
        return `群组 ${guildId} 未配置智能定时禁言`;
      }

      try {
        // 获取明天的日期
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split('T')[0];
        
        const existed = timedMuteCore.clearManualOverride(guildId, tomorrowStr);
        
        if (existed) {
          // 重新初始化定时任务以应用新设置
          await timedMuteCore.initTimedMute(true);
          
          // 获取自动判断的结果
          const autoType = await timedMuteCore.determineScheduleType(guildId, tomorrowStr);
          
          return `✅ 已取消群组 ${guildId} 明天 (${tomorrowStr}) 的手动设置\n\n🤖 系统将自动判断使用${autoType === 'holiday' ? '节假日' : '工作日'}配置`;
        } else {
          return `群组 ${guildId} 明天 (${tomorrowStr}) 没有手动设置需要取消`;
        }
        
      } catch (error) {
        logger.error('取消明天禁言设置失败:', error);
        return '取消设置失败，请查看日志或联系管理员';
      }
    });

  // 查看手动设置状态
  ctx.command('查看禁言设置', { authority: 2 })
    .usage('查看当前群组的智能定时禁言设置状态')
    .action(async ({ session }) => {
      if (!session?.guildId) {
        return '此命令只能在群聊中使用';
      }

      const guildId = session.guildId;
      
      // 检查群组是否已配置
      const groupConfig = config.timedMuteGroups.find(g => g.guildId === guildId);
      if (!groupConfig) {
        return `群组 ${guildId} 未配置智能定时禁言`;
      }

      try {
        // 获取今天和明天的信息
        const today = new Date();
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const todayStr = today.toISOString().split('T')[0];
        const tomorrowStr = tomorrow.toISOString().split('T')[0];
        
        // 获取今天和明天的配置类型
        const todayType = await timedMuteCore.determineScheduleType(guildId, todayStr);
        const tomorrowType = await timedMuteCore.determineScheduleType(guildId, tomorrowStr);
        
        // 检查手动设置
        const todayManual = timedMuteCore.hasManualOverride(guildId, todayStr);
        const tomorrowManual = timedMuteCore.hasManualOverride(guildId, tomorrowStr);
        const tomorrowOverride = timedMuteCore.getManualOverride(guildId, tomorrowStr);
        
        let status = `📊 群组 ${guildId} 智能定时禁言设置状态\n\n`;
        
        // 今天的状态
        status += `📅 今天 (${todayStr}):\n`;
        status += `  配置类型: ${todayType === 'holiday' ? '节假日' : '工作日'}\n`;
        status += `  设置方式: ${todayManual ? '手动设置' : '自动判断'}\n\n`;
        
        // 明天的状态
        status += `📅 明天 (${tomorrowStr}):\n`;
        status += `  配置类型: ${tomorrowType === 'holiday' ? '节假日' : '工作日'}\n`;
        status += `  设置方式: ${tomorrowManual ? '手动设置' : '自动判断'}\n`;
        
        if (tomorrowOverride) {
          status += `  设置者: ${tomorrowOverride.setBy}\n`;
          status += `  设置时间: ${tomorrowOverride.setAt.toLocaleString('zh-CN')}\n`;
        }
        
        // 配置详情
        const todaySchedules = todayType === 'holiday' 
          ? groupConfig.holidaySchedules 
          : groupConfig.workdaySchedules;
        const tomorrowSchedules = tomorrowType === 'holiday' 
          ? groupConfig.holidaySchedules 
          : groupConfig.workdaySchedules;
        
        status += `\n⚙️ 明天将执行的定时任务:\n`;
        if (tomorrowSchedules.schedule1.enabled) {
          status += `  第一组: ${tomorrowSchedules.schedule1.muteTime} 禁言, ${tomorrowSchedules.schedule1.unmuteTime} 解禁\n`;
        }
        if (tomorrowSchedules.schedule2.enabled) {
          status += `  第二组: ${tomorrowSchedules.schedule2.muteTime} 禁言, ${tomorrowSchedules.schedule2.unmuteTime} 解禁\n`;
        }
        
        status += `\n💡 提示:\n`;
        status += `• 使用 "设置明天禁言 工作日/节假日" 可手动设置明天的配置\n`;
        status += `• 使用 "取消明天禁言设置" 可取消手动设置\n`;
        status += `• 系统会在禁言前5分钟、3分钟、1分钟发送提醒`;
        
        return status;
        
      } catch (error) {
        logger.error('查看禁言设置失败:', error);
        return '查看设置失败，请查看日志或联系管理员';
      }
    });

  // 测试节假日API
  ctx.command('测试节假日API <date:string>', { authority: 4 })
    .usage('测试指定日期的节假日API判断结果\n日期格式: YYYY-MM-DD')
    .example('测试节假日API 2024-10-01')
    .action(async ({ session }, date) => {
      if (!date) {
        return '请指定要测试的日期，格式: YYYY-MM-DD';
      }

      // 验证日期格式
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(date)) {
        return '日期格式错误，请使用 YYYY-MM-DD 格式';
      }

      try {
        const guildId = session?.guildId || 'test';
        const scheduleType = await timedMuteCore.determineScheduleType(guildId, date);
        
        return `📅 日期 ${date} 的判断结果:\n配置类型: ${scheduleType === 'holiday' ? '节假日' : '工作日'}`;
        
      } catch (error) {
        logger.error('测试节假日API失败:', error);
        return `测试失败: ${error.message}`;
      }
    });

  logger.info('智能定时禁言手动控制命令已注册');
}