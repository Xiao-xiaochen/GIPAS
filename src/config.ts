import { Schema } from 'koishi';

export interface Config {
    cronTargetChannelId: string; // New: Channel ID for cron jobs
    monitoredChannelIds: string[]; // New: Array of channel IDs to monitor
    cronBotPlatform?: string; // New: Platform for the bot used in cron jobs
    cronBotSelfId?: string; // New: Self ID for the bot used in cron jobs
    geminiApiKey: string;
    geminiModel: string;
    muteCron: string;
    unmuteCron: string;
    weekendMuteCron: string;
    
    weekendUnmuteCron: string;
    level1Action: 'none' | 'warn' | 'mute';
    level1MuteMinutes: number;
    level2Action: 'warn' | 'mute' | 'kick';
    level2MuteMinutes: number;
    level3Action: 'mute' | 'kick';
    level3MuteMinutes: number; 
    maxViolationHistoryDays: number; 
    kickThreshold: number; 
    maxChatHistoryLength: number; // New config for chat history length
  }
  
  export const Config: Schema<Config> = Schema.object({
    cronTargetChannelId: Schema.string().description('定时任务目标频道ID').default(''),
    monitoredChannelIds: Schema.array(String).description('需要监控的频道ID列表').default([]),
    cronBotPlatform: Schema.string().description('定时任务使用的机器人平台 (可选)').default(''),
    cronBotSelfId: Schema.string().description('定时任务使用的机器人ID (可选)').default(''),
    geminiApiKey: Schema.string().description('Gemini API Key').required(),
    geminiModel: Schema.string().default('gemini-1.5-flash-latest').description('Gemini 模型 ID'),
    muteCron: Schema.string().default('0 18 * * 1-5').description('工作日禁言 Cron').default('0 18 * * 1-5'),
    unmuteCron: Schema.string().default('0 0 * * 1-5').description('工作日解除禁言 Cron').default('0 0 * * 1-5'),
    weekendMuteCron: Schema.string().default('0 8 * * 0,6').description('周末禁言 Cron').default('0 0 * * 0,6'),
    weekendUnmuteCron: Schema.string().default('0 0 * * 0,6').description('周末解除禁言 Cron').default('0 8 * * 0,6'),
    level1Action: Schema.union(['none', 'warn', 'mute'] as const).description('1级违规处罚').default('warn'),
    level1MuteMinutes: Schema.number().description('1级禁言时长(分钟)').default(10),
    level2Action: Schema.union(['warn', 'mute', 'kick'] as const).description('2级违规处罚').default('mute'),
    level2MuteMinutes: Schema.number().description('2级禁言时长(分钟)').default(60),
    level3Action: Schema.union(['mute', 'kick'] as const).description('3级违规处罚').default('kick'),
    level3MuteMinutes: Schema.number().description('3级禁言时长(分钟)').default(1440),
    maxViolationHistoryDays: Schema.number().description('历史记录追溯天数(未来功能)').default(30),
    kickThreshold: Schema.number().description('踢出阈值(未来功能)').default(3),
    maxChatHistoryLength: Schema.number().description('AI聊天上下文历史记录的最大长度').default(10),
    // Note: monitoredChannelIds is defined above
  })
