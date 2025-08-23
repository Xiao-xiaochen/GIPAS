import { Context } from 'koishi';
import { Config } from '../../config';
import { AIServiceManager } from '../../Utils/AIServiceManager';

export function addSystemStatusCommands(ctx: Context, config: Config) {
  const logger = ctx.logger('gipas:system-status');

  // GIPAS系统状态总览命令
  ctx.command('GIPAS状态', { authority: 2 })
    .action(async ({ session }) => {
      if (!session) {
        return '无效的会话';
      }

      try {
        const status = await getSystemStatus(ctx, config, session.guildId);
        return formatSystemStatus(status);
      } catch (error) {
        logger.error('获取系统状态失败:', error);
        return '❌ 获取系统状态失败，请查看日志';
      }
    });

  // 详细的子系统状态命令
  ctx.command('GIPAS详细状态', { authority: 3 })
    .action(async ({ session }) => {
      if (!session) {
        return '无效的会话';
      }

      try {
        const status = await getDetailedSystemStatus(ctx, config, session.guildId);
        return formatDetailedStatus(status);
      } catch (error) {
        logger.error('获取详细系统状态失败:', error);
        return '❌ 获取详细系统状态失败，请查看日志';
      }
    });

  logger.info('GIPAS系统状态命令已加载');
}

// 获取系统状态
async function getSystemStatus(ctx: Context, config: Config, guildId?: string) {
  const status = {
    // 基础信息
    version: '2.0.0',
    uptime: process.uptime(),
    
    // AI服务状态
    aiService: null as any,
    
    // 数据库状态
    database: {
      connected: false,
      tables: [] as string[]
    },
    
    // 监控状态
    monitoring: {
      enabled: false,
      guilds: config.MonitoredGuildIds.length,
      currentGuild: guildId || 'unknown'
    },
    
    // 功能模块状态
    modules: {
      fileSystem: config.enabledGroups.includes(guildId || ''),
      timedMute: false,
      election: config.electionEnabled,
      autoManagement: config.MonitoredGuildIds.includes(guildId || '')
    },
    
    // 定时任务状态
    scheduledTasks: {
      timedMute: 0,
      election: 0
    }
  };

  // 检查AI服务状态
  try {
    const aiService = new AIServiceManager(ctx, config);
    status.aiService = await aiService.checkAPIStatus();
  } catch (error) {
    status.aiService = { gemini: false, deepseek: false, errors: [error.message] };
  }

  // 检查数据库状态
  try {
    // 使用简单的查询来测试数据库连接
    await ctx.database.get('FileSystem', {}).catch(() => []);
    status.database.connected = true;
    // 获取已知的数据表列表
    status.database.tables = [
      'FileSystem', 'ViolationRecord', 'Election', 'ElectionCandidate', 
      'ElectionVote', 'Administrator', 'ReelectionVote'
    ];
  } catch (error) {
    status.database.connected = false;
  }

  // 检查监控状态
  status.monitoring.enabled = config.MonitoredGuildIds.length > 0;

  // 检查定时禁言配置
  if (guildId) {
    const timedMuteConfig = config.timedMuteGroups.find(g => g.guildId === guildId);
    if (timedMuteConfig) {
      status.modules.timedMute = timedMuteConfig.schedule1.enabled || timedMuteConfig.schedule2.enabled;
      status.scheduledTasks.timedMute = 
        (timedMuteConfig.schedule1.enabled ? 1 : 0) + 
        (timedMuteConfig.schedule2.enabled ? 1 : 0);
    }
  }

  return status;
}

// 获取详细系统状态
async function getDetailedSystemStatus(ctx: Context, config: Config, guildId?: string) {
  const basicStatus = await getSystemStatus(ctx, config, guildId);
  
  const detailedStatus = {
    ...basicStatus,
    
    // 数据库详细信息
    databaseDetails: {
      stats: null as any,
      recentActivity: [] as any[]
    },
    
    // 配置详情
    configuration: {
      rules: config.Rules.length,
      punishmentLevels: {
        level1: config.level1Action,
        level2: config.level2Action,
        level3: config.level3Action
      },
      apiStrategy: config.apiStrategy,
      electionConfig: {
        cycle: config.electionCycle,
        candidateHours: config.candidateRegistrationHours,
        votingHours: config.votingHours,
        threshold: config.reelectionThreshold
      }
    },
    
    // 当前群组详细信息
    currentGuildDetails: null as any
  };

  // 获取数据库详细统计
  try {
    // 手动统计各个表的记录数
    const tableStats = {};
    
    // 使用具体的表名进行查询，避免TypeScript类型错误
    try {
      const fileSystemCount = await ctx.database.get('FileSystem', {}).then(r => r.length);
      tableStats['FileSystem'] = fileSystemCount;
    } catch { tableStats['FileSystem'] = 0; }
    
    try {
      const violationCount = await ctx.database.get('ViolationRecord', {}).then(r => r.length);
      tableStats['ViolationRecord'] = violationCount;
    } catch { tableStats['ViolationRecord'] = 0; }
    
    try {
      const electionCount = await ctx.database.get('Election', {}).then(r => r.length);
      tableStats['Election'] = electionCount;
    } catch { tableStats['Election'] = 0; }
    
    try {
      const candidateCount = await ctx.database.get('ElectionCandidate', {}).then(r => r.length);
      tableStats['ElectionCandidate'] = candidateCount;
    } catch { tableStats['ElectionCandidate'] = 0; }
    
    try {
      const voteCount = await ctx.database.get('ElectionVote', {}).then(r => r.length);
      tableStats['ElectionVote'] = voteCount;
    } catch { tableStats['ElectionVote'] = 0; }
    
    try {
      const adminCount = await ctx.database.get('Administrator', {}).then(r => r.length);
      tableStats['Administrator'] = adminCount;
    } catch { tableStats['Administrator'] = 0; }
    
    try {
      const reelectionCount = await ctx.database.get('ReelectionVote', {}).then(r => r.length);
      tableStats['ReelectionVote'] = reelectionCount;
    } catch { tableStats['ReelectionVote'] = 0; }
    
    detailedStatus.databaseDetails.stats = tableStats;
  } catch (error) {
    detailedStatus.databaseDetails.stats = { error: error.message };
  }

  // 获取当前群组的详细信息
  if (guildId) {
    try {
      const [violations, profiles, elections] = await Promise.all([
        ctx.database.get('ViolationRecord', { guildId }).then(r => r.length),
        ctx.database.get('FileSystem', { groupId: guildId }).then(r => r.length),
        ctx.database.get('Election', { guildId }).then(r => r.length)
      ]);

      detailedStatus.currentGuildDetails = {
        guildId,
        violationRecords: violations,
        userProfiles: profiles,
        elections: elections,
        isMonitored: config.MonitoredGuildIds.includes(guildId),
        hasFileSystem: config.enabledGroups.includes(guildId),
        timedMuteConfig: config.timedMuteGroups.find(g => g.guildId === guildId) || null
      };
    } catch (error) {
      detailedStatus.currentGuildDetails = { error: error.message };
    }
  }

  return detailedStatus;
}

// 格式化系统状态显示
function formatSystemStatus(status: any): string {
  const uptimeHours = Math.floor(status.uptime / 3600);
  const uptimeMinutes = Math.floor((status.uptime % 3600) / 60);

  let message = `🤖 GIPAS 系统状态总览\n\n`;
  
  // 基础信息
  message += `📊 基础信息:\n`;
  message += `• 版本: ${status.version}\n`;
  message += `• 运行时间: ${uptimeHours}小时 ${uptimeMinutes}分钟\n`;
  message += `• 当前群组: ${status.monitoring.currentGuild}\n\n`;

  // AI服务状态
  message += `🧠 AI服务状态:\n`;
  message += `• Gemini: ${status.aiService.gemini ? '✅' : '❌'}\n`;
  message += `• Deepseek: ${status.aiService.deepseek ? '✅' : '❌'}\n`;
  if (status.aiService.errors.length > 0) {
    message += `• ⚠️ 错误: ${status.aiService.errors.length}个\n`;
  }
  message += `\n`;

  // 数据库状态
  message += `💾 数据库状态:\n`;
  message += `• 连接: ${status.database.connected ? '✅' : '❌'}\n`;
  message += `• 数据表: ${status.database.tables.length}个\n\n`;

  // 功能模块状态
  message += `⚙️ 功能模块:\n`;
  message += `• 自动管理: ${status.modules.autoManagement ? '✅' : '❌'}\n`;
  message += `• 档案系统: ${status.modules.fileSystem ? '✅' : '❌'}\n`;
  message += `• 定时禁言: ${status.modules.timedMute ? '✅' : '❌'}\n`;
  message += `• 选举系统: ${status.modules.election ? '✅' : '❌'}\n\n`;

  // 监控状态
  message += `👁️ 监控状态:\n`;
  message += `• 监控群组: ${status.monitoring.guilds}个\n`;
  message += `• 定时任务: ${status.scheduledTasks.timedMute}个\n\n`;

  message += `💡 使用 "GIPAS详细状态" 查看更多信息`;

  return message;
}

// 格式化详细状态显示
function formatDetailedStatus(status: any): string {
  let message = formatSystemStatus(status);
  
  message += `\n\n📋 详细配置信息:\n`;
  
  // API配置
  message += `🔧 API配置:\n`;
  message += `• 使用策略: ${getStrategyName(status.configuration.apiStrategy)}\n`;
  message += `• 群规长度: ${status.configuration.rules}字符\n\n`;

  // 处罚配置
  message += `⚖️ 处罚配置:\n`;
  message += `• 一级违规: ${status.configuration.punishmentLevels.level1}\n`;
  message += `• 二级违规: ${status.configuration.punishmentLevels.level2}\n`;
  message += `• 三级违规: ${status.configuration.punishmentLevels.level3}\n\n`;

  // 选举配置
  if (status.modules.election) {
    message += `🗳️ 选举配置:\n`;
    message += `• 选举周期: ${getElectionCycleName(status.configuration.electionConfig.cycle)}\n`;
    message += `• 报名时长: ${status.configuration.electionConfig.candidateHours}小时\n`;
    message += `• 投票时长: ${status.configuration.electionConfig.votingHours}小时\n`;
    message += `• 连任阈值: ${status.configuration.electionConfig.threshold}%\n\n`;
  }

  // 当前群组详情
  if (status.currentGuildDetails && !status.currentGuildDetails.error) {
    message += `🏠 当前群组详情:\n`;
    message += `• 违规记录: ${status.currentGuildDetails.violationRecords}条\n`;
    message += `• 用户档案: ${status.currentGuildDetails.userProfiles}个\n`;
    message += `• 历史选举: ${status.currentGuildDetails.elections}次\n`;
    
    if (status.currentGuildDetails.timedMuteConfig) {
      message += `• 定时禁言: 已配置\n`;
    }
  }

  // 数据库统计
  if (status.databaseDetails.stats && !status.databaseDetails.stats.error) {
    message += `\n💾 数据库统计:\n`;
    const stats = status.databaseDetails.stats;
    for (const [table, count] of Object.entries(stats)) {
      message += `• ${table}: ${count}条记录\n`;
    }
  }

  return message;
}

// 辅助函数
function getStrategyName(strategy: string): string {
  const names = {
    'gemini-only': '仅Gemini',
    'deepseek-only': '仅Deepseek',
    'gemini-first': 'Gemini优先',
    'deepseek-first': 'Deepseek优先'
  };
  return names[strategy] || strategy;
}

function getElectionCycleName(cycle: string): string {
  const names = {
    'weekly': '每周',
    'biweekly': '每两周',
    'monthly': '每月'
  };
  return names[cycle] || cycle;
}