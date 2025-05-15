import { Context, Schema, Tables } from 'koishi'
import { } from "koishi-plugin-cron"; 
import { GoogleGenAI, HarmCategory, HarmBlockThreshold, Part, Content } from "@google/genai";
import { Buffer } from 'node:buffer'; 
import * as http from 'node:http';   
import * as https from 'node:https'; 

export interface UserData { /* ... */ id: number; userId: string; }
export interface ViolationRecord { /* ... */ id: number; userId: string; guildId: string; channelId: string; messageId: string; messageContent: string; timestamp: Date; violationLevel: number; actionTaken: string; muteDurationMinutes?: number; }
declare module 'koishi' {
  interface Tables { userdata: UserData; gipas_violations: ViolationRecord; }
}

export const name = 'gipas'
export const inject = { required: [ 'cron', 'database' ] }
interface ViolationAnalysisResult { violates: boolean; level: 1 | 2 | 3 | null; }
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
})

const RULES = `
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

async function downloadImageAsBase64(url: string, ctx: Context): Promise<{ mimeType: string, data: string } | null> {
  try {
    const fetchOptions = { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' } };
    const response = await fetch(url, fetchOptions);
    if (!response.ok) { 
      ctx.logger('gipas').warn(`图片下载失败: ${url}, 状态: ${response.status}`);
      return null; 
    }
    const imageArrayBuffer = await response.arrayBuffer();
    const base64ImageData = Buffer.from(imageArrayBuffer).toString('base64');
    const mimeType = response.headers.get('content-type') || 'image/jpeg';
    return { mimeType, data: base64ImageData };
  } catch (error) { 
    ctx.logger('gipas').error(`图片下载异常: ${url}:`, error);
    return null; 
  }
}

async function analyzeChatMessage(
  chatSession: any, 
  currentMessage: string, 
  ctx: Context,
  config: Config 
): Promise<ViolationAnalysisResult> {
  const defaultResult: ViolationAnalysisResult = { violates: false, level: null };
  const imgTagRegex = /<img.*?src="([^"]+)".*?\/?>/i; 
  const imgMatch = currentMessage.match(imgTagRegex);
  const textContent = currentMessage.replace(imgTagRegex, "").trim();

  if (!imgMatch && !textContent) { 
    ctx.logger('gipas').debug(`消息为空或仅含空白，跳过AI分析: "${currentMessage}"`);
    return defaultResult; 
  }

  try {
    const genAI = new GoogleGenAI({ apiKey: config.geminiApiKey });
    let predictionText = "false"; 

    if (imgMatch && imgMatch[1]) { 
      const imageUrl = imgMatch[1];
      ctx.logger('gipas').debug(`检测到图片。URL: ${imageUrl}, 文本: "${textContent}"`);
      const imageData = await downloadImageAsBase64(imageUrl, ctx);
      if (imageData) {
        const partsForImageAnalysis: Part[] = [ { inlineData: { mimeType: imageData.mimeType, data: imageData.data } } ];
        let imageAnalysisPrompt = `请根据群规判断此图片内容是否违规。`;
        if (textContent) imageAnalysisPrompt += `图片附带文本：“${textContent}”。请综合判断图片和文本。`;
        imageAnalysisPrompt += `\n群规如下：\n${RULES}\n如果违规，请评估严重等级（1-轻微, 2-中等, 3-严重）并以 "true,等级" 格式回应，否则回应 "false"。`;
        partsForImageAnalysis.push({text: imageAnalysisPrompt});
        
        const result = await genAI.models.generateContent({
            model: config.geminiModel, 
            contents: [{ role: "user", parts: partsForImageAnalysis }],
            // safetySettings: safetySettingsConfig, 
        });
        predictionText = result.text.toLowerCase().trim();
        ctx.logger('gipas').info(`图片消息分析: "${currentMessage}", 预测: "${predictionText}"`);
      } else { 
        ctx.logger('gipas').warn(`图片处理失败，跳过分析: "${currentMessage}"`);
        return defaultResult; 
      }
    } else if (textContent) { 
      if (!chatSession) {
        ctx.logger('gipas').warn('聊天会话未初始化，纯文本消息分析跳过。');
        return defaultResult;
      }
      // Following user's example for chat.sendMessage: { message: "string" }
      const result = await chatSession.sendMessage({ message: textContent }); 
      predictionText = result.text.toLowerCase().trim();
      ctx.logger('gipas').info(`上下文文本分析: "${textContent}", AI原始回复: "${predictionText}"`);
    } else { return defaultResult; }

    const parts = predictionText.split(',');
    const violates = parts[0] === 'true';
    const levelStr = violates && parts.length > 1 ? parts[1].trim() : null;
    const level = levelStr ? parseInt(levelStr, 10) : null;

    if (violates && level && (level >= 1 && level <= 3)) {
      return { violates: true, level: level as (1 | 2 | 3) };
    } else if (violates) { 
      ctx.logger('gipas').warn(`AI判断违规但未提供有效等级: "${predictionText}". 默认为轻微违规(1)。`);
      return { violates: true, level: 1 }; 
    }
    return { violates: false, level: null };
  } catch (error) { 
    ctx.logger('gipas').error('AI消息分析时发生错误:', error);
    return defaultResult; 
  }
}

async function analyzeJoinRequest(joinMessage: string, config: Config, ctx: Context): Promise<ViolationAnalysisResult> {
  // ... (Implementation as before)
  return { violates: false, level: null }; // Placeholder
}

export function apply(ctx: Context, config: Config) {
  ctx.logger('gipas').info('插件已加载');
  ctx.model.extend('gipas_violations', { /* ... */ }, { autoInc: true });

  let gipasChat: any = null; 
  let activeGuildId: string | null = null; // Variable to store the active guild ID

  async function setGuildMute(guildId: string, mute: boolean, ctx: Context, config: Config) {
    if (!guildId) {
      ctx.logger('gipas').warn('无法执行全体禁言/解禁：未设置激活的服务器ID。');
      return;
    }
    // Define actionText before try block
    const actionText = mute ? '禁言' : '解除禁言'; 
    try {
      // Attempt to get bot ID using ctx.self
      const botId = ctx.self; 
      if (!botId) {
         ctx.logger('gipas').error('无法获取机器人自身ID (ctx.self)');
         return;
      }
      const bot = ctx.bots[`${ctx.platform}:${botId}`]; // Get the bot instance using ctx.self
      if (!bot) {
        ctx.logger('gipas').error(`无法获取机器人实例 (Platform: ${ctx.platform}, ID: ${botId})。`);
        return;
      }

      const members = await bot.getGuildMemberMap(guildId);
      const duration = mute ? 2147483647 : 0; // Max 32-bit signed integer for "permanent" mute, 0 for unmute
      let successCount = 0;
      let failCount = 0;

      ctx.logger('gipas').info(`开始为服务器 ${guildId} 执行全体${actionText}操作...`);

      for (const userId in members) {
        if (userId === bot.userId) continue; // Skip the bot itself

        // Optional: Add logic here to skip admins/owner if needed
        // const member = members[userId];
        // if (member.roles.includes('admin_role_id') || userId === guildOwnerId) continue;

        try {
          await bot.muteGuildMember(guildId, userId, duration);
          successCount++;
          // Avoid spamming logs for each user
          // ctx.logger('gipas').debug(`用户 ${userId} ${actionText}成功。`);
          // Add a small delay to avoid rate limits, if necessary
          // await new Promise(resolve => setTimeout(resolve, 100)); 
        } catch (e) {
          failCount++;
          ctx.logger('gipas').warn(`用户 ${userId} ${actionText}失败:`, e.message || e);
        }
      }
      ctx.logger('gipas').info(`服务器 ${guildId} 全体${actionText}操作完成。成功: ${successCount}, 失败: ${failCount}`);
      // Optionally send a notification to the channel
      // try {
      //   await bot.sendMessage(config.activeChannelId, `已执行全体${actionText}操作。`);
      // } catch (e) {
      //   ctx.logger('gipas').warn(`发送全体${actionText}通知失败:`, e);
      // }

    } catch (error) {
      ctx.logger('gipas').error(`执行全体${actionText}时发生错误:`, error);
    }
  }

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
        history: initialHistory,
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
  
  // Schedule Mute/Unmute Cron Jobs
  ctx.cron(config.muteCron, () => { 
    ctx.logger('gipas').info(`触发工作日禁言任务 (Cron: ${config.muteCron})`);
    setGuildMute(activeGuildId, true, ctx, config); 
  });
  ctx.cron(config.unmuteCron, () => { 
    ctx.logger('gipas').info(`触发工作日解禁任务 (Cron: ${config.unmuteCron})`);
    setGuildMute(activeGuildId, false, ctx, config); 
  });
  ctx.cron(config.weekendMuteCron, () => { 
    ctx.logger('gipas').info(`触发周末禁言任务 (Cron: ${config.weekendMuteCron})`);
    setGuildMute(activeGuildId, true, ctx, config); 
  });
  ctx.cron(config.weekendUnmuteCron, () => { 
    ctx.logger('gipas').info(`触发周末解禁任务 (Cron: ${config.weekendUnmuteCron})`);
    setGuildMute(activeGuildId, false, ctx, config); 
  });

  ctx.on('message', async (session) => {
    ctx.logger('gipas').debug(`[MSG_EVENT] 收到消息. CH: ${session.channelId}, ActiveCH: ${config.activeChannelId}, Content: ${!!session.content}, gipasChat: ${!!gipasChat}`);

    if (!config.activeChannelId) {
      ctx.logger('gipas').debug('[MSG_EVENT] 无激活频道，跳过。');
      return;
    }
    if (session.channelId !== config.activeChannelId) {
      ctx.logger('gipas').debug(`[MSG_EVENT] 消息来自非激活频道 ${session.channelId}，跳过。`);
      return;
    }
     if (!session.content) {
      ctx.logger('gipas').debug('[MSG_EVENT] 消息无内容，跳过。');
      return;
    }
    if (session.userId === session.bot.userId) {
      ctx.logger('gipas').debug('[MSG_EVENT] 消息来自机器人自身，跳过。');
      return;
    }
    
    const imgRegex = /<img.*?src="([^"]+)".*?\/?>/i;
    const isImageMessage = imgRegex.test(session.content);
    if (!isImageMessage && !gipasChat) {
        ctx.logger('gipas').warn('[MSG_EVENT] 收到纯文本消息，但聊天会话 (gipasChat) 未初始化。跳过AI分析。');
        return;
    }
    
    ctx.logger('gipas').info(`处理来自用户 ${session.userId} 于频道 ${session.channelId} 的消息: "${session.content}"`);
    const analysisResult = await analyzeChatMessage(gipasChat, session.content, ctx, config); 
    
    ctx.logger('gipas').debug(`[MSG_ANALYSIS_RESULT] Violates: ${analysisResult.violates}, Level: ${analysisResult.level}`);

    if (analysisResult.violates) {
      ctx.logger('gipas').info(`用户 ${session.userId} 违规 (等级 ${analysisResult.level}) 于频道 ${session.channelId}. 消息: "${session.content}"`);
      
      try {
        await ctx.database.create('gipas_violations', {
          userId: session.userId,
          guildId: session.guildId,
          channelId: session.channelId,
          messageId: session.messageId,
          messageContent: session.content,
          timestamp: new Date(),
          violationLevel: analysisResult.level,
          actionTaken: 'pending',
        });
        ctx.logger('gipas').debug('违规记录已创建。');
      } catch (e) { ctx.logger('gipas').error('记录违规信息失败:', e); }

      let actionToTake: 'none' | 'warn' | 'mute' | 'kick' = 'none';
      let muteMinutesToApply = 0;

      switch (analysisResult.level) {
        case 1: actionToTake = config.level1Action; muteMinutesToApply = config.level1MuteMinutes; break;
        case 2: actionToTake = config.level2Action; muteMinutesToApply = config.level2MuteMinutes; break;
        case 3: actionToTake = config.level3Action; muteMinutesToApply = config.level3MuteMinutes; break;
        default: 
          actionToTake = 'warn'; // Default to warn if level is null but violates is true
          ctx.logger('gipas').warn(`违规等级未识别 (${analysisResult.level})，默认执行警告操作。`);
          break;
      }
      ctx.logger('gipas').info(`处罚动作确定: ${actionToTake}, 禁言时长 (如适用): ${muteMinutesToApply} 分钟。`);
      
      try { 
        await session.bot.deleteMessage(session.channelId, session.messageId);
        ctx.logger('gipas').info(`已删除消息 ${session.messageId}。`);
      } catch (e) { ctx.logger('gipas').warn(`删除消息 ${session.messageId} 失败:`, e); }

      switch (actionToTake) {
        case 'warn': 
          session.send(`用户 ${session.userId} 警告：您的消息违反了群规 (等级 ${analysisResult.level})。`); 
          break;
        case 'mute':
          const durationInSeconds = muteMinutesToApply * 60;
          ctx.logger('gipas').info(`准备禁言用户 ${session.userId} (Guild: ${session.guildId})，时长: ${muteMinutesToApply} 分钟 (${durationInSeconds} 秒)。`);
          try {
            await session.bot.muteGuildMember(session.guildId, session.userId, durationInSeconds);
            ctx.logger('gipas').info(`用户 ${session.userId} 禁言API调用成功。`);
            session.send(`用户 ${session.userId} 因违反群规 (等级 ${analysisResult.level}) 已被禁言 ${muteMinutesToApply} 分钟。`);
          } catch (e) { 
            ctx.logger('gipas').error(`禁言用户 ${session.userId} (时长 ${durationInSeconds} 秒) 失败:`, e); 
            session.send(`尝试禁言用户 ${session.userId} 失败。`); 
          }
          break;
        case 'kick':
          try {
            await session.bot.kickGuildMember(session.guildId, session.userId);
            session.send(`用户 ${session.userId} 因严重违反群规 (等级 ${analysisResult.level}) 已被移出本群。`);
          } catch (e) { ctx.logger('gipas').error(`踢出用户 ${session.userId} 失败:`, e); session.send(`尝试将用户 ${session.userId} 移出群聊失败。`); }
          break;
        case 'none':
          ctx.logger('gipas').info(`违规等级 ${analysisResult.level} 配置的动作为 'none'，不执行处罚。`);
          break;
      }
    }
  });

  ctx.on('guild-member-request', async (session) => { /* ... */ });
}
