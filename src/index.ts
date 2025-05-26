import { Context, Schema, Tables } from 'koishi'
import { } from "koishi-plugin-cron"; 
import { GoogleGenAI, Part, Content } from "@google/genai";
import { GeneralMute } from './administrator/GeneralMute';
import { database } from './models';
import { Config } from './config';
export * from './config'; // <--- 导入配置文件

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

用户发送测试禁言时请禁言他们，他们在测试bug
`;

const safetySettingsConfig = [ /* ... */ ];

import { setGuildMute, registerMuteCronJobs } from './mute';
import { handleMessage, analyzeChatMessage, analyzeJoinRequest } from './violation';
import * as fs from 'fs';
import * as path from 'path';

let linkWhitelist: string[] = [];
const whitelistPath = path.resolve(__dirname, 'whitelist.json');

function loadWhitelist(ctx: Context) {
  try {
    if (fs.existsSync(whitelistPath)) {
      const rawData = fs.readFileSync(whitelistPath, 'utf-8');
      linkWhitelist = JSON.parse(rawData);
      ctx.logger('gipas').info('链接白名单已加载。');
    } else {
      ctx.logger('gipas').warn('链接白名单文件不存在，将使用空列表。');
      linkWhitelist = [];
      fs.writeFileSync(whitelistPath, JSON.stringify([]), 'utf-8'); // Create if not exists
    }
  } catch (error) {
    ctx.logger('gipas').error('加载链接白名单失败:', error);
    linkWhitelist = [];
  }
}

function saveWhitelist(ctx: Context) {
  try {
    fs.writeFileSync(whitelistPath, JSON.stringify(linkWhitelist, null, 2), 'utf-8');
    ctx.logger('gipas').info('链接白名单已保存。');
  } catch (error) {
    ctx.logger('gipas').error('保存链接白名单失败:', error);
  }
}

export function apply(ctx: Context, config: Config) {
  loadWhitelist(ctx);
  GeneralMute(ctx, config);
  ctx.logger('gipas').info('插件已加载');
  database(ctx);

  ctx.on('ready', () => {
    if (!config.cronBotPlatform || !config.cronBotSelfId) {
      // Attempt to find a suitable bot if not explicitly configured
      const availableBots = Array.from(ctx.bots.values());
      if (availableBots.length > 0) {
        const firstBot = availableBots[0];
        config.cronBotPlatform = firstBot.platform;
        config.cronBotSelfId = firstBot.selfId;
        ctx.logger('gipas').info(`已自动设置定时任务机器人：Platform: ${firstBot.platform}, ID: ${firstBot.selfId}`);
      } else {
        ctx.logger('gipas').warn('没有可用的机器人实例，定时任务可能无法执行禁言操作。请检查配置。');
      }
    }
  });
  // let gipasChat: any = null; // Replaced by channelChatSessions
  const channelChatSessions: Map<string, any> = new Map();
  let cronTargetGuildId: string | null = null; // Guild ID for the cron target channel
  // messageHistory is now at the top level
  const channelMessageHistories: Map<string, { user: string, content: string, timestamp: Date }[]> = new Map();



  async function initializeChatSession(channelId: string): Promise<boolean> {
    if (channelChatSessions.has(channelId)) {
      ctx.logger('gipas').info(`频道 ${channelId} 的聊天会话已存在，无需重复初始化。`);
      return true;
    }
    if (!config.geminiApiKey) { 
      ctx.logger('gipas').error(`无法为频道 ${channelId} 初始化聊天会话：Gemini API Key 未配置。`);
      return false; 
    }
    try {
      const genAI = new GoogleGenAI({ apiKey: config.geminiApiKey }); 
      const initialHistory: Content[] = [
        { role: "user", parts: [{ text: `你是一个游戏群组的聊天管理员。你的主要任务是根据下面提供的群组规则来识别我发送给你的消息是否违反规则。\n群组规则:\n${RULES}\n判断指示:\n1. 当我发送一条用户消息给你时，如果该消息明确违反了一条或多条规则，你必须仅回应 "true,违规等级" (例如 "true,1", "true,2", "true,3" 分别对应轻微,中等,严重违规)，否则仅回应 "false"。\n2. 对于明确的违规行为要严格，但也要公平。不要过度敏感。\n3. 常见的简短中性消息、问题、感叹（例如：“哈哈”、“666”、“？”、“好的”、“草”——当“草”用作网络流行语表示惊讶/沮丧而非直接侮辱时）通常应被视为 "false"，除非其在特定上下文中的用法明确构成违规（例如，成为针对性侮辱、垃圾信息或明显扰乱秩序的一部分）。\n4. 关注用户的意图以及消息可能造成的影响。简单的表示沮丧与针对性的攻击或侮辱是不同的。\n5. 如果一条消息的含义模糊不清，除非它强烈暗示了违规行为，否则应倾向于判断为 "false"。\n6. 你的目标是根据这些特定的规则维护一个安全和互相尊重的群聊环境。\n请特别注意，我可能会连续发送多条短消息，这些消息组合起来可能才构成一个完整的、可能是违规的意图。在判断时，请考虑最近的几条消息是否共同构成了违规内容。` }] },
        { role: "model", parts: [{ text: "明白。我会接收你发送的用户消息，并根据你提供的规则和指示进行分析。对于明确的违规行为，我会以 'true,违规等级' 的格式回应；其他情况则回应 'false'。我会密切关注上下文、用户意图以及常见网络用语的使用，并考虑连续消息的组合含义。" }] }
      ];
      const newChat = genAI.chats.create({ 
        model: config.geminiModel, 
        history: initialHistory, // Restore passing initialHistory here
        // safetySettings: safetySettingsConfig, 
      });
      channelChatSessions.set(channelId, newChat);
      ctx.logger('gipas').info(`聊天会话已为频道 ${channelId} 初始化。`);
      return true;
    } catch (error) { 
      ctx.logger('gipas').error(`为频道 ${channelId} 初始化聊天会话失败:`, error); 
      channelChatSessions.delete(channelId);
      return false;
    }
  }

  // Initialize chat sessions for all monitored channels on startup
  if (config.monitoredChannelIds && config.monitoredChannelIds.length > 0 && config.geminiApiKey) {
    for (const channelId of config.monitoredChannelIds) {
      initializeChatSession(channelId);
    }
  }
  // Initialize chat session for cron target if it's not already in monitored and API key exists
  if (config.cronTargetChannelId && !config.monitoredChannelIds.includes(config.cronTargetChannelId) && config.geminiApiKey) {
    initializeChatSession(config.cronTargetChannelId);
  }

  ctx.on('dispose', () => { 
    channelChatSessions.clear(); 
    channelMessageHistories.clear();
    ctx.logger('gipas').info('所有聊天会话已清理。');
  });

  ctx.command('gipas.monitor <channelId:string>').action(async ({ session }, channelId) => {
    if (!channelId) return '请输入要监控的频道ID。';
    if (config.monitoredChannelIds.includes(channelId)) {
      return `频道 ${channelId} 已在监控列表中。`;
    }
    const success = await initializeChatSession(channelId);
    if (success) {
      config.monitoredChannelIds.push(channelId);
      // Ensure a message history array exists for this channel
      if (!channelMessageHistories.has(channelId)) {
        channelMessageHistories.set(channelId, []);
      }
      session.send(`GIPAS 已开始监控频道 ${channelId}。`);
      ctx.logger('gipas').info(`GIPAS started monitoring channel ${channelId}.`);
    } else {
      session.send(`为频道 ${channelId} 初始化聊天会话失败，无法开始监控。`);
    }
  });

  ctx.command('gipas.unmonitor <channelId:string>').action(async ({ session }, channelId) => {
    if (!channelId) return '请输入要停止监控的频道ID。';
    const index = config.monitoredChannelIds.indexOf(channelId);
    if (index === -1) {
      return `频道 ${channelId} 不在监控列表中。`;
    }
    config.monitoredChannelIds.splice(index, 1);
    channelChatSessions.delete(channelId); // Remove chat session
    channelMessageHistories.delete(channelId); // Remove message history
    session.send(`GIPAS 已停止监控频道 ${channelId}。`);
    ctx.logger('gipas').info(`GIPAS stopped monitoring channel ${channelId}.`);
  });

  ctx.command('gipas.whitelist.add <url:string>')
    .action(async ({ session }, url) => {
      if (!url) return '请输入要添加到白名单的 URL。';
      if (linkWhitelist.includes(url)) {
        return `URL "${url}" 已在白名单中。`;
      }
      linkWhitelist.push(url);
      saveWhitelist(ctx);
      return `URL "${url}" 已添加到白名单。`;
    });

  ctx.command('gipas.whitelist.remove <url:string>')
    .action(async ({ session }, url) => {
      if (!url) return '请输入要从白名单移除的 URL。';
      const index = linkWhitelist.indexOf(url);
      if (index === -1) {
        return `URL "${url}" 不在白名单中。`;
      }
      linkWhitelist.splice(index, 1);
      saveWhitelist(ctx);
      return `URL "${url}" 已从白名单移除。`;
    });

  ctx.command('gipas.whitelist.list')
    .action(async ({ session }) => {
      if (linkWhitelist.length === 0) {
        return '链接白名单为空。';
      }
      return '链接白名单：\n' + linkWhitelist.join('\n');
    });

  ctx.command('gipas.setCronTarget <channelId:string>').action(async ({ session }, channelId) => {
    if (!channelId) return '请输入要设置为定时任务目标的频道ID。';
    // Attempt to get guildId for the target channel. This might require the bot to be in that guild.
    // For simplicity, we'll assume the command is run in a context where session.guildId is relevant or the channelId implies a known guild.
    // A more robust solution might involve looking up guild info based on channelId if Koishi's API allows.
    let targetGuildId = session.guildId; // Fallback or assume current guild if channel is in it.
    // If you have a way to get guildId from channelId directly, use it here.
    // For now, we'll rely on the context of where setCronTarget is called or a pre-existing knowledge.

    // Initialize chat session for cron target if not already monitored, as it might be needed for context or API access through the session object.
    if (!channelChatSessions.has(channelId)) {
        const initSuccess = await initializeChatSession(channelId);
        if (!initSuccess) {
            return `无法为频道 ${channelId} 初始化聊天会话，不能设置为定时任务目标。`;
        }
    }

    config.cronTargetChannelId = channelId;
    cronTargetGuildId = targetGuildId; // This needs a reliable way to be set.
                                      // If your cron jobs need guildId, ensure this is correctly populated.
                                      // For now, we'll use the guildId from the command's session, assuming it's relevant.
    session.send(`定时任务目标已设置为频道 ${channelId} (服务器 ${cronTargetGuildId || '未知'})。`);
    ctx.logger('gipas').info(`Cron target set to channel ${channelId} in guild ${cronTargetGuildId || 'unknown'}.`);
  });

  ctx.command('gipas.status').action(async ({ session }) => {
    let status = 'GIPAS 状态:\n';
    status += `定时任务目标频道: ${config.cronTargetChannelId || '未设置'} (服务器: ${cronTargetGuildId || '未知'})\n`;
    status += '监控中的频道:\n';
    if (config.monitoredChannelIds.length > 0) {
      config.monitoredChannelIds.forEach(cid => {
        status += `  - ${cid} (会话状态: ${channelChatSessions.has(cid) ? '已初始化' : '未初始化/失败' })\n`;
      });
    } else {
      status += '  (无)\n';
    }
    return status;
  });



  registerMuteCronJobs(ctx, config, () => cronTargetGuildId); // Pass the cronTargetGuildId

  ctx.command('gipas.muteall', '全体禁言当前频道 (需要权限3)', { authority: 3 })
    .action(async ({ session }) => {
      if (!session.guildId) {
        return '该指令只能在群组中使用。';
      }
      if (!config.monitoredChannelIds.includes(session.guildId)) {
        return `频道 ${session.guildId} 未被监控，无法执行全体禁言。请先使用 gipas.monitor 添加监控。`;
      }
      try {
        await setGuildMute(session.guildId, true, ctx, config, session);
        return `已在频道 ${session.guildId} 执行全体禁言。`;
      } catch (error) {
        ctx.logger('gipas').error(`执行 gipas.muteall 指令失败:`, error);
        return `在频道 ${session.guildId} 执行全体禁言失败，请查看日志。`;
      }
    });

  ctx.command('gipas.unmuteall', '解除当前频道全体禁言 (需要权限3)', { authority: 3 })
    .action(async ({ session }) => {
      if (!session.guildId) {
        return '该指令只能在群组中使用。';
      }
      try {
        await setGuildMute(session.guildId, false, ctx, config, session);
        return `已在频道 ${session.guildId} 解除全体禁言。`;
      } catch (error) {
        ctx.logger('gipas').error(`执行 gipas.unmuteall 指令失败:`, error);
        return `在频道 ${session.guildId} 解除全体禁言失败，请查看日志。`;
      }
    });

  ctx.middleware(async (session, next) => {
    // Skip if not in a monitored channel or if the message is from the bot itself
    if (!config.monitoredChannelIds.includes(session.channelId) || session.selfId === session.userId) {
      return next();
    }

    // Initialize chat session if not already done (e.g., if channel was added after initial load)
    if (!channelChatSessions.has(session.channelId)) {
      const success = await initializeChatSession(session.channelId);
      if (!success) {
        ctx.logger('gipas').warn(`无法为频道 ${session.channelId} 初始化聊天会话，消息处理跳过。`);
        return next(); // Or handle error appropriately
      }
    }
    // Initialize message history for the channel if it doesn't exist
    if (!channelMessageHistories.has(session.channelId)) {
      channelMessageHistories.set(session.channelId, []);
    }

    const currentMessageHistory = channelMessageHistories.get(session.channelId)!;
    const now = new Date();

    // Add current message to history
    currentMessageHistory.push({ user: session.userId, content: session.content, timestamp: now });

    // Trim history: remove messages older than MAX_HISTORY_AGE_MS or if history exceeds MAX_HISTORY_MESSAGES
    while (currentMessageHistory.length > 0 && 
           (currentMessageHistory[0].timestamp.getTime() < now.getTime() - MAX_HISTORY_AGE_MS || 
            currentMessageHistory.length > config.maxChatHistoryLength)) {
      currentMessageHistory.shift();
    }
    
    // Pass the current channel's chat session and message history to handleMessage
    const chatSession = channelChatSessions.get(session.channelId);
    if (!chatSession) {
      ctx.logger('gipas').warn(`频道 ${session.channelId} 的聊天会话未找到，无法处理消息。`);
      return next();
    }

    // Pass linkWhitelist to handleMessage
    await handleMessage(session, ctx, config, chatSession, RULES, currentMessageHistory);
    return next();
  });

  ctx.on('guild-member-request', async (session) => { 
    // Assuming analyzeJoinRequest is intended to be used here
    // const analysisResult = await analyzeJoinRequest(session.content, config, ctx, RULES);
    // Handle join request based on analysisResult
    /* ... */ 
  });
}
