import { Context } from 'koishi';
import { segment } from 'koishi';
import { Config } from '../../../config';
import { ChartGenerator } from './ChartGenerator';

/**
 * 图表命令管理器
 */
export function addChartCommands(ctx: Context, config: Config) {
  const logger = ctx.logger('gipas:chart-commands');
  const chartGenerator = new ChartGenerator(ctx, config);

  // 档案填写情况统计命令
  ctx.command('档案统计', { authority: 2 })
    .action(async ({ session }) => {
      if (!session) {
        return '无效的会话';
      }

      try {
        const guildId = session.guildId;
        if (!guildId) {
          return '此命令只能在群聊中使用';
        }

        if (!config.enabledGroups.includes(guildId)) {
          return '此群未启用档案系统';
        }

        await session.send('🎨 正在生成现代化档案填写情况统计图...');
        
        const chartPath = await chartGenerator.generateProfileCompletionChart(guildId);
        
        return segment.image(`file://${chartPath}`);
      } catch (error) {
        logger.error('生成档案统计图失败:', error);
        return '❌ 生成统计图失败，请查看日志';
      }
    });

  // 届数分布统计命令
  ctx.command('届数统计', { authority: 2 })
    .action(async ({ session }) => {
      if (!session) {
        return '无效的会话';
      }

      try {
        const guildId = session.guildId;
        if (!guildId) {
          return '此命令只能在群聊中使用';
        }

        if (!config.enabledGroups.includes(guildId)) {
          return '此群未启用档案系统';
        }

        await session.send('📊 正在生成群内届数分布统计图...');
        
        const chartPath = await chartGenerator.generateTermDistributionChart(guildId);
        
        return segment.image(`file://${chartPath}`);
      } catch (error) {
        logger.error('生成届数分布统计图失败:', error);
        return '❌ 生成统计图失败: ' + error.message;
      }
    });

  // 班级分布统计命令
  ctx.command('班级统计', { authority: 2 })
    .action(async ({ session }) => {
      if (!session) {
        return '无效的会话';
      }

      try {
        const guildId = session.guildId;
        if (!guildId) {
          return '此命令只能在群聊中使用';
        }

        if (!config.enabledGroups.includes(guildId)) {
          return '此群未启用档案系统';
        }

        await session.send('📈 正在生成群内班级分布统计图...');
        
        const chartPath = await chartGenerator.generateClassDistributionChart(guildId);
        
        return segment.image(`file://${chartPath}`);
      } catch (error) {
        logger.error('生成班级分布统计图失败:', error);
        return '❌ 生成统计图失败: ' + error.message;
      }
    });

  // 数据标准化命令
  ctx.command('标准化档案数据', { authority: 3 })
    .action(async ({ session }) => {
      if (!session) {
        return '无效的会话';
      }

      try {
        const guildId = session.guildId;
        if (!guildId) {
          return '此命令只能在群聊中使用';
        }

        if (!config.enabledGroups.includes(guildId)) {
          return '此群未启用档案系统';
        }

        await session.send('🔄 正在标准化数据库中的档案数据格式...');
        
        const result = await chartGenerator.normalizeProfileData(guildId);
        
        return `✅ 数据标准化完成！\n📊 届数更新: ${result.termUpdated} 条\n🏫 班级更新: ${result.classUpdated} 条`;
      } catch (error) {
        logger.error('数据标准化失败:', error);
        return '❌ 数据标准化失败: ' + error.message;
      }
    });

  // 简化中文届数格式命令（将"二十八届"转为"二八届"）
  ctx.command('简化届数格式', { authority: 3 })
    .action(async ({ session }) => {
      if (!session) {
        return '无效的会话';
      }

      try {
        const guildId = session.guildId;
        if (!guildId) {
          return '此命令只能在群聊中使用';
        }

        if (!config.enabledGroups.includes(guildId)) {
          return '此群未启用档案系统';
        }

        await session.send('🔄 正在将完整中文届数格式（如"二十八届"）转换为简化格式（如"二八届"）...');
        
        // 获取所有档案数据
        const profiles = await chartGenerator.getProfilesForGroup(guildId);
        
        // 执行转换
        const updated = await chartGenerator.dataNormalizer.convertFullToSimplifiedChinese(profiles, ctx.database);
        
        return `✅ 届数格式简化完成！\n📊 已将 ${updated} 条完整中文格式届数转换为简化格式`;
      } catch (error) {
        logger.error('届数格式简化失败:', error);
        return '❌ 届数格式简化失败: ' + error.message;
      }
    });

  // 自动建档案命令
  ctx.command('自动建档案', { authority: 3 })
    .action(async ({ session }) => {
      if (!session) {
        return '无效的会话';
      }

      try {
        const guildId = session.guildId;
        if (!guildId) {
          return '此命令只能在群聊中使用';
        }

        if (!config.enabledGroups.includes(guildId)) {
          return '此群未启用档案系统';
        }

        await session.send('🔄 正在为群成员自动建立档案...');
        
        await chartGenerator.autoCreateProfilesFromTitles(guildId);
        
        return '✅ 自动建档案完成！已根据群头衔为成员创建或更新档案信息。';
      } catch (error) {
        logger.error('自动建档案失败:', error);
        return '❌ 自动建档案失败: ' + error.message;
      }
    });

  // 手动切换主题命令
  ctx.command('切换图表主题 [theme:string]', { authority: 2 })
    .action(async ({ session }, theme) => {
      if (!session) {
        return '无效的会话';
      }

      try {
        if (theme && !['light', 'dark'].includes(theme)) {
          return '❌ 主题参数错误，请使用 light 或 dark';
        }

        chartGenerator.switchTheme(theme as 'light' | 'dark');
        const currentTheme = chartGenerator.getCurrentThemeName();
        return `✅ 图表主题已切换到: ${currentTheme === 'dark' ? '🌙 深色模式' : '☀️ 浅色模式'}`;
      } catch (error) {
        logger.error('切换主题失败:', error);
        return '❌ 切换主题失败，请查看日志';
      }
    });

  // 清理资源
  ctx.on('dispose', () => {
    chartGenerator.dispose();
  });

  logger.info('🎨 GIPAS现代化图表命令已加载 (模块化版本)');
}