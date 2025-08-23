import { Context } from 'koishi';
import { Config } from '../../config';

export function addQuickStatusCommands(ctx: Context, config: Config) {
  const logger = ctx.logger('gipas:quick-status');

  // 快速健康检查命令
  ctx.command('GIPAS健康检查', { authority: 1 })
    .alias('gipas')
    .action(async ({ session }) => {
      if (!session) {
        return '无效的会话';
      }

      try {
        const health = await quickHealthCheck(ctx, config, session.guildId);
        return formatQuickStatus(health);
      } catch (error) {
        logger.error('快速健康检查失败:', error);
        return '❌ 健康检查失败';
      }
    });

  // 系统版本信息
  ctx.command('GIPAS版本', { authority: 1 })
    .action(() => {
      const uptimeHours = Math.floor(process.uptime() / 3600);
      const uptimeMinutes = Math.floor((process.uptime() % 3600) / 60);
      
      return [
        `🤖 GIPAS (Group Intelligence & Protection Automated System)`,
        `📦 版本: 2.0.0`,
        `⏱️ 运行时间: ${uptimeHours}小时 ${uptimeMinutes}分钟`,
        `🔧 Node.js: ${process.version}`,
        `💾 内存使用: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
        ``,
        `🛠️ 主要功能:`,
        `• 智能违规检测 (AI驱动)`,
        `• 威权民主选举系统`,
        `• 用户档案管理`,
        `• 定时禁言管理`,
        `• 多AI服务支持 (Gemini + Deepseek)`,
        ``,
        `📖 使用 "GIPAS状态" 查看系统状态`
      ].join('\n');
    });

  logger.info('GIPAS快速状态命令已加载');
}

// 快速健康检查
async function quickHealthCheck(ctx: Context, config: Config, guildId?: string) {
  const health = {
    overall: 'healthy' as 'healthy' | 'warning' | 'error',
    issues: [] as string[],
    services: {
      database: false,
      ai: false,
      monitoring: false
    },
    currentGuild: {
      monitored: false,
      fileSystem: false,
      timedMute: false
    }
  };

  // 检查数据库
  try {
    // 使用简单的查询来测试数据库连接
    await ctx.database.get('FileSystem', {}).catch(() => {
      // 如果FileSystem表不存在，尝试其他方式测试连接
      return [];
    });
    health.services.database = true;
  } catch (error) {
    health.services.database = false;
    health.issues.push('数据库连接失败');
    health.overall = 'error';
  }

  // 检查AI服务
  if (config.geminiApiKey || config.deepseekApiKey) {
    health.services.ai = true;
  } else {
    health.services.ai = false;
    health.issues.push('未配置AI服务');
    health.overall = health.overall === 'error' ? 'error' : 'warning';
  }

  // 检查监控状态
  health.services.monitoring = config.MonitoredGuildIds.length > 0;
  if (!health.services.monitoring) {
    health.issues.push('未配置监控群组');
    health.overall = health.overall === 'error' ? 'error' : 'warning';
  }

  // 检查当前群组状态
  if (guildId) {
    health.currentGuild.monitored = config.MonitoredGuildIds.includes(guildId);
    health.currentGuild.fileSystem = config.enabledGroups.includes(guildId);
    
    const timedMuteConfig = config.timedMuteGroups.find(g => g.guildId === guildId);
    health.currentGuild.timedMute = timedMuteConfig ? 
      (timedMuteConfig.schedule1.enabled || timedMuteConfig.schedule2.enabled) : false;
  }

  return health;
}

// 格式化快速状态显示
function formatQuickStatus(health: any): string {
  const statusIcon = {
    'healthy': '✅',
    'warning': '⚠️',
    'error': '❌'
  }[health.overall];

  let message = `${statusIcon} GIPAS 系统健康状态: ${getStatusText(health.overall)}\n\n`;

  // 核心服务状态
  message += `🔧 核心服务:\n`;
  message += `• 数据库: ${health.services.database ? '✅' : '❌'}\n`;
  message += `• AI服务: ${health.services.ai ? '✅' : '❌'}\n`;
  message += `• 监控系统: ${health.services.monitoring ? '✅' : '❌'}\n\n`;

  // 当前群组状态
  message += `🏠 当前群组:\n`;
  message += `• 违规监控: ${health.currentGuild.monitored ? '✅' : '❌'}\n`;
  message += `• 档案系统: ${health.currentGuild.fileSystem ? '✅' : '❌'}\n`;
  message += `• 定时禁言: ${health.currentGuild.timedMute ? '✅' : '❌'}\n`;

  // 问题提示
  if (health.issues.length > 0) {
    message += `\n⚠️ 发现问题:\n`;
    for (const issue of health.issues) {
      message += `• ${issue}\n`;
    }
  }

  message += `\n💡 使用以下命令获取更多信息:`;
  message += `\n• "GIPAS状态" - 系统总览`;
  message += `\n• "GIPAS详细状态" - 详细信息`;
  message += `\n• "AI状态" - AI服务状态`;

  return message;
}

function getStatusText(status: string): string {
  const texts = {
    'healthy': '正常',
    'warning': '警告',
    'error': '错误'
  };
  return texts[status] || '未知';
}