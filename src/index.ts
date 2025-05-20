import { Context, Schema, Tables } from 'koishi'
import { } from "koishi-plugin-cron"; 
import { GoogleGenAI, HarmCategory, HarmBlockThreshold, Part, Content } from "@google/genai";
import { Buffer } from 'node:buffer'; 
import * as http from 'node:http';   
import * as https from 'node:https'; 

export interface UserData { /* ... */ id: number; userId: string; }
export interface ViolationRecord { /* ... */ id: number; userId: string; guildId: string; channelId: string; messageId: string; messageContent: string; timestamp: Date; violationLevel: number; actionTaken: string; muteDurationMinutes?: number; }
export interface UserRecord {
  id: number;
  userId: string;
  guildId: string;
  level1Violations: number;
  level2Violations: number;
  level3Violations: number;
}
declare module 'koishi' {
  interface Tables { userdata: UserData; gipas_violations: ViolationRecord; UserRecord: UserRecord; }
}

export const name = 'gipas'
export const inject = { required: [ 'cron', 'database' ] }
export interface ViolationAnalysisResult {
  is_violation: boolean;
  level?: 1 | 2 | 3;
  action?: 'warn' | 'mute' | 'kick' | 'none'; // Added 'none' to align with config
  muteDuration?: number; // in seconds
  reason?: string;
}
let messageHistory: { user: string, content: string, timestamp: Date }[] = [];
const MAX_HISTORY_MESSAGES = 20; // Define a max number of messages to keep in history
const MAX_HISTORY_AGE_MS = 5 * 60 * 1000; // 5 minutes in milliseconds

export interface Config {
  activeChannelId: string;
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
  activeChannelId: Schema.string().description('激活的频道ID').default(''),
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
})

export const RULES = `
《小明法》
本群为征战文游总部，发更新和测试。无关内容少发，稳定为主。
违规者，直接移出本群。（能否再进管理定）
群规细则：
* 贬低本游/恶意抨击？直接踢出。
* 扰乱秩序？直接踢出。
* 低俗恶劣/骂人？直接踢出。
* 广告/推广/外部链接？直接踢出。
* 挑拨离间/引战？直接踢出。
* 阴阳怪气/不好好说话？直接踢出。
* 贬低群友？直接踢出。
* 恶意建议？管理判断后直接踢出。
* 无理质疑群规？直接踢出。
* 不服管理？直接踢出。
* 泄露隐私？直接踢出。
* 引入外部威胁/危险信息？直接踢出。
最终裁定：
管理团队有最终解释权
管理团队裁量特殊情况
`;

const safetySettingsConfig = [ /* ... */ ];

import { registerMuteCronJobs } from './mute';
import { handleMessage, analyzeChatMessage, analyzeJoinRequest } from './violation';

export function apply(ctx: Context, config: Config) {
  ctx.logger('gipas').info('插件已加载');
  ctx.model.extend('gipas_violations', {
    id: 'unsigned',
    userId: 'string',
    guildId: 'string',
    channelId: 'string',
    messageId: 'string',
    messageContent: 'text',
    timestamp: 'timestamp',
    violationLevel: 'integer',
    actionTaken: 'string',
    muteDurationMinutes: 'integer',
  }, { autoInc: true, primary: 'id' });

  ctx.model.extend('UserRecord', {
    id: 'unsigned',
    userId: 'string',
    guildId: 'string',
    level1Violations: 'integer',
    level2Violations: 'integer',
    level3Violations: 'integer',
  }, { autoInc: true, primary: 'id' });

  let gipasChat: any = null; 
  let activeGuildId: string | null = null; // Variable to store the active guild ID
  // messageHistory is now at the top level

  async function initializeChatSession(channelId: string) {
    if (!config.geminiApiKey) { 
      ctx.logger('gipas').error('无法初始化聊天会话：Gemini API Key 未配置。');
      gipasChat = null; return; 
    }
    try {
      const genAI = new GoogleGenAI({ apiKey: config.geminiApiKey }); 
      const initialHistory: Content[] = [
        { role: "user", parts: [{ text: `你是一个游戏群组的聊天管理员。你的主要任务是根据下面提供的群组规则来识别我发送给你的消息是否违反规则。\n群组规则:\n${RULES}\n判断指示:\n1. 当我发送一条用户消息给你时，如果该消息明确违反了一条或多条规则，你必须仅回应 "true,违规等级" (例如 "true,1", "true,2", "true,3" 分别对应轻微,中等,严重违规)，否则仅回应 "false"。\n2. 对于明确的违规行为要严格，但也要公平。不要过度敏感。\n3. 常见的简短中性消息、问题、感叹（例如：“哈哈”、“666”、“？”、“好的”、“草”——当“草”用作网络流行语表示惊讶/沮丧而非直接侮辱时）通常应被视为 "false"，除非其在特定上下文中的用法明确构成违规（例如，成为针对性侮辱、垃圾信息或明显扰乱秩序的一部分）。\n4. 关注用户的意图以及消息可能造成的影响。简单的表示沮丧与针对性的攻击或侮辱是不同的。\n5. 如果一条消息的含义模糊不清，除非它强烈暗示了违规行为，否则应倾向于判断为 "false"。\n6. 你的目标是根据这些特定的规则维护一个安全和互相尊重的群聊环境。\n请特别注意，我可能会连续发送多条短消息，这些消息组合起来可能才构成一个完整的、可能是违规的意图。在判断时，请考虑最近的几条消息是否共同构成了违规内容。` }] },
        { role: "model", parts: [{ text: "明白。我会接收你发送的用户消息，并根据你提供的规则和指示进行分析。对于明确的违规行为，我会以 'true,违规等级' 的格式回应；其他情况则回应 'false'。我会密切关注上下文、用户意图以及常见网络用语的使用，并考虑连续消息的组合含义。" }] }
      ];
      gipasChat = genAI.chats.create({ 
        model: config.geminiModel, 
        history: initialHistory, // Restore passing initialHistory here
        // safetySettings: safetySettingsConfig, 
      });
      ctx.logger('gipas').info(`聊天会话已为频道 ${channelId} 初始化。 gipasChat is ${gipasChat ? '有效' : 'null'}`);
    } catch (error) { 
      ctx.logger('gipas').error('初始化聊天会话失败:', error); 
      gipasChat = null; 
    }
  }

  if (config.activeChannelId && config.geminiApiKey) { 
    initializeChatSession(config.activeChannelId);
  }
  ctx.on('dispose', () => { gipasChat = null; });

  ctx.command('gipas.activate').action(async ({ session }) => { 
    if (session.channelId && session.guildId) { // Ensure guildId is available
      config.activeChannelId = session.channelId; 
      activeGuildId = session.guildId; // Store the guildId
      await initializeChatSession(session.channelId); 
      if (gipasChat) { session.send(`GIPAS 已为频道 ${config.activeChannelId} (服务器 ${activeGuildId}) 激活。上下文AI监控和定时禁言已启用。`); }
      else { session.send(`GIPAS 为频道 ${config.activeChannelId} (服务器 ${activeGuildId}) 激活失败，聊天会话初始化错误。`); }
      ctx.logger('gipas').info(`GIPAS activated for channel ${config.activeChannelId} in guild ${activeGuildId}.`);
    } else { session.send('此指令只能在频道内使用，且需要获取服务器ID。'); }
  });

  registerMuteCronJobs(ctx, config, () => activeGuildId);

  ctx.on('message', async (session) => {
    if (session.content && session.userId !== session.bot.userId && session.channelId === config.activeChannelId) {
      // Add message to history
      messageHistory.push({ user: session.userId, content: session.content, timestamp: new Date() });
      // Trim history to MAX_HISTORY_MESSAGES
      if (messageHistory.length > (config.maxChatHistoryLength || MAX_HISTORY_MESSAGES)) {
        messageHistory.shift(); // Remove the oldest message
      }
      // Remove messages older than MAX_HISTORY_AGE_MS
      const now = new Date().getTime();
      messageHistory = messageHistory.filter(msg => (now - msg.timestamp.getTime()) < MAX_HISTORY_AGE_MS);
    }
    // Pass the relevant part of messageHistory to handleMessage, which will then pass to analyzeChatMessage
    handleMessage(session, ctx, config, gipasChat, RULES, messageHistory.filter(m => m.user !== session.userId)); // Pass history excluding current user's own recent messages if that's desired, or pass all.
  });

  ctx.on('guild-member-request', async (session) => { 
    // Assuming analyzeJoinRequest is intended to be used here
    // const analysisResult = await analyzeJoinRequest(session.content, config, ctx, RULES);
    // Handle join request based on analysisResult
    /* ... */ 
  });
}
