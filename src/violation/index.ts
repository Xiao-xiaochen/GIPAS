// violation module
import { Context, Session } from 'koishi';
import { Config } from '../index';
import { GoogleGenAI, Part } from "@google/genai";
import { RULES, ViolationAnalysisResult, UserRecord, Config as AppConfig } from '../index'; // Renamed Config to AppConfig to avoid conflict

import { Buffer } from 'node:buffer';

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

function getDefaultActionForLevel(level: 1 | 2 | 3 | undefined, config: AppConfig): 'warn' | 'mute' | 'kick' | 'none' {
  if (!level) return 'none'; // Or 'warn' as a very safe default
  switch (level) {
    case 1: return config.level1Action;
    case 2: return config.level2Action;
    case 3: return config.level3Action;
    default: return 'none'; // Should not be reached if level is typed 1 | 2 | 3
  }
}

export async function analyzeChatMessage(
  chatSession: any,
  currentMessage: string,
  ctx: Context,
  config: AppConfig,
  rules: string, // Added rules as a parameter
  messageHistory?: { user: string, content: string, timestamp: Date }[]
): Promise<ViolationAnalysisResult> {
  const defaultResult: ViolationAnalysisResult = { is_violation: false };
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
        let imageAnalysisPrompt = ``;
        if (messageHistory && messageHistory.length > 0) {
          const historyText = messageHistory.map(msg => `${msg.user}: ${msg.content}`).join('\n');
          imageAnalysisPrompt += `历史消息:\n${historyText}\n`;
          ctx.logger('gipas').debug(`Image analysis with history. History length: ${messageHistory.length}`);
        }
        imageAnalysisPrompt += `请根据群规判断此图片内容是否违规。`;
        if (textContent) imageAnalysisPrompt += `图片附带文本：“${textContent}”。请综合判断图片和文本。`;
        imageAnalysisPrompt += `\n群规如下：\n${rules}\n如果违规，请评估严重等级（1-轻微, 2-中等, 3-严重），并以 "true,等级,处罚类型,处罚时长(秒)/kick,原因" 格式回应（例如 "true,2,mute,3600,多次发送无关内容" 或 "true,3,kick,发布不当图片"），否则回应 "false"。`;
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
      let fullPrompt = textContent;
      if (messageHistory && messageHistory.length > 0) {
        const historyText = messageHistory.map(msg => `${msg.user}: ${msg.content}`).join('\n');
        fullPrompt = `历史消息:\n${historyText}\n当前消息: ${textContent}`;
        ctx.logger('gipas').debug(`Sending to AI with history. History length: ${messageHistory.length}`);
      }
      // According to documentation (e.g. https://googleapis.github.io/js-genai/release_docs/classes/chats.Chat.html),
      // sendMessage expects an object like { message: 'Why is the sky blue?' }
      // However, the error ContentUnion is required suggests it might expect Part[] or string directly for the message content itself,
      // and the `sendMessage` method itself might be part of a different API or SDK version than I initially assumed for `Chat.sendMessage(string)`.
      // Let's try to conform to the `sendMessage({ message: string | Part[] })` structure if that's what the JS SDK's Chat object expects.
      // The error `ContentUnion is required at t.tContent` implies that the argument to `sendMessage` itself is being validated as `ContentUnion`.
      // `ContentUnion` is typically `string | Part | (string | Part)[]`.
      // The `sendMessage(params: SendMessageParameters)` where `SendMessageParameters` has a `message` field is for `sendMessageStream`.
      // For non-streaming `sendMessage`, it might directly take `string | Part[]`.
      // Given the persistent error, and that `ContentUnion` is `string | Part | (string | Part)[]`,
      // my previous attempt `chatSession.sendMessage([{ text: fullPrompt }])` should have been closer if `Part[]` was expected.
      // Let's re-verify the exact method signature or try a slightly different structure for `Part`.
      // The error occurs in `_transformers.ts` at `t.tContent`, which processes the content part.
      // This strongly suggests the `fullPrompt` (when it's a string) or `[{ text: fullPrompt }]` is not being correctly interpreted as valid `Content`.

      // Based on documentation for sendMessageStream (https://googleapis.github.io/js-genai/release_docs/classes/chats.Chat.html),
      // it expects an object like { message: 'Why is the sky blue?' } or { message: Part[] }.
      // The non-streaming sendMessage might follow a similar pattern for its parameters, despite not being explicitly documented as such for its top-level argument.
      // The error "ContentUnion is required" suggests the SDK is looking for a specific structure for the content itself.
      // Let's try wrapping the Part[] within a 'message' property.
      const result = await chatSession.sendMessage({ message: [{ text: fullPrompt }] });
      ctx.logger('gipas').info('Raw AI Result:', result === undefined ? 'undefined' : JSON.stringify(result, null, 2)); // Pretty print for better readability, explicitly handles undefined

      try {
        // Attempt to extract text based on the observed raw AI result structure
        const text = result?.candidates?.[0]?.content?.parts?.[0]?.text; // Corrected path
        if (text) {
          predictionText = text.toLowerCase().trim();
        } else {
          // Log a more specific warning if text is not found in the expected path
          // The old fallback logic mentioned in the replace_block's comments is not directly applicable here,
          // as the original code already had a specific way of handling missing text.
          // We retain the logging and default assignment.
          ctx.logger('gipas').warn('AI response text not found in expected path (result.candidates[0].content.parts[0].text). Full response logged for debugging.'); // Updated path in log message
          predictionText = ''; // Default to empty string or handle as an error
        }
      } catch (e) {
        ctx.logger('gipas').error('Error parsing AI response:', e);
        ctx.logger('gipas').error('Full AI Response that caused parsing error:', JSON.stringify(result, null, 2));
        predictionText = ''; // Default to empty string or handle as an error
      }

      ctx.logger('gipas').info(`上下文文本分析: "${textContent}", AI原始回复: "${predictionText}"`); // Keep as info for visibility

      // If the AI's response is "false", it means no violation according to current AI output
      if (predictionText.trim().toLowerCase() === 'false') {
        ctx.logger('gipas').info('AI判定消息未违规 (回复为 "false")，不执行任何操作。');
        return defaultResult; // Return default (no violation) and do not send any message to the channel
      }

    } else { return defaultResult; }

    // Attempt to parse the response
    // Expected format: "true, 2, 3600" or "true, 3, kick" or "false" or "true, 1, warn, optional reason"
    const parts = predictionText.split(',').map(part => part.trim());
    const is_violation = parts[0].toLowerCase() === 'true';

    if (!is_violation) {
      return { is_violation: false, reason: parts.length > 1 ? parts.slice(1).join(', ') : 'No violation detected by AI.' };
    }

    if (parts.length < 2) {
      ctx.logger('gipas').warn('Invalid response format from AI (missing level):', predictionText);
      return { is_violation: true, level: 1, action: config.level1Action, muteDuration: config.level1Action === 'mute' ? config.level1MuteMinutes * 60 : undefined, reason: 'AI response format error (missing level), defaulted to L1.' };
    }

    const level = parseInt(parts[1], 10) as (1 | 2 | 3 | undefined);
    if (level === undefined || isNaN(level) || level < 1 || level > 3) {
      ctx.logger('gipas').warn('Invalid violation level from AI:', parts[1], 'Defaulting to L1.');
      return { is_violation: true, level: 1, action: config.level1Action, muteDuration: config.level1Action === 'mute' ? config.level1MuteMinutes * 60 : undefined, reason: `Invalid AI level (${parts[1]}), defaulted to L1.` };
    }

    let action: 'warn' | 'mute' | 'kick' | 'none' | undefined = undefined;
    let muteDuration: number | undefined = undefined;
    let reasonMessage = parts.length > 3 ? parts.slice(3).join(', ').trim() : `AI detected violation (Level ${level}).`;

    if (parts.length > 2) {
      const actionOrDuration = parts[2].toLowerCase();
      if (actionOrDuration === 'kick') {
        action = 'kick';
      } else if (actionOrDuration === 'warn') {
        action = 'warn';
      } else if (actionOrDuration === 'none') {
        action = 'none';
      } else {
        const duration = parseInt(actionOrDuration, 10);
        if (!isNaN(duration) && duration > 0) {
          action = 'mute';
          muteDuration = duration; // AI provides duration in seconds
        } else {
          ctx.logger('gipas').warn('Invalid action/duration from AI:', parts[2], 'Defaulting based on level.');
        }
      }
    }

    // Fallback to config-defined actions if AI doesn't specify or specifies incorrectly
    if (!action) {
      switch (level) {
        case 1:
          action = config.level1Action;
          if (config.level1Action === 'mute') muteDuration = config.level1MuteMinutes * 60; // Convert minutes to seconds
          break;
        case 2:
          action = config.level2Action;
          if (config.level2Action === 'mute') muteDuration = config.level2MuteMinutes * 60;
          break;
        case 3:
          action = config.level3Action;
          if (config.level3Action === 'mute') muteDuration = config.level3MuteMinutes * 60;
          break;
        default:
          ctx.logger('gipas').error('Internal error: Unhandled violation level in fallback.');
          return { is_violation: true, level: 1, action: 'warn', reason: 'Internal error, defaulted to L1 warn.' };
      }
    }
    return { is_violation: true, level, action, muteDuration, reason: reasonMessage };
  } catch (error) {
    ctx.logger('gipas').error('AI消息分析时发生错误:', error);
    return defaultResult;
  }
}

export async function analyzeJoinRequest(joinMessage: string, config: AppConfig, ctx: Context, rules: string): Promise<ViolationAnalysisResult> {
  // This function can be enhanced similarly to analyzeChatMessage if AI-based join request analysis is needed.
  // For now, returning a non-violating result.
  return { is_violation: false, reason: 'Join request analysis not fully implemented for AI check.' };
}

export function handleMessage(session: Session, ctx: Context, config: AppConfig, gipasChat: any, rules: string, messageHistory?: { user: string, content: string, timestamp: Date }[]) {
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
    analyzeChatMessage(gipasChat, session.content, ctx, config, rules, messageHistory).then(async analysisResult => { // Pass messageHistory
      ctx.logger('gipas').debug(`[MSG_ANALYSIS_RESULT] is_violation: ${analysisResult.is_violation}, Level: ${analysisResult.level}, Action: ${analysisResult.action}, Duration: ${analysisResult.muteDuration}, Reason: ${analysisResult.reason}`);

      if (analysisResult.is_violation && analysisResult.level) { // Ensure level is present for action
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

        const actionToTake = analysisResult.action !== undefined ? analysisResult.action : getDefaultActionForLevel(analysisResult.level, config);
        const muteDurationToApply = analysisResult.muteDuration; // Already in seconds from AI or config fallback
        const reasonForAction = analysisResult.reason || `AI判定违规 (等级 ${analysisResult.level})`;
        const userName = session.author?.name || session.author?.nick || session.userId;

        // Log detailed violation info to console
        ctx.logger('gipas').info({
          message: '违规处理流程启动',
          userId: session.userId,
          userName: userName,
          guildId: session.guildId,
          channelId: session.channelId,
          originalMessage: session.content,
          violationLevel: analysisResult.level,
          aiReason: reasonForAction,
          determinedAction: actionToTake,
          muteDurationSeconds: muteDurationToApply
        });
        
        // Construct the announcement message base
        let announcementBase = `====[违规通告]====
 G.I.P.A.S.
违规用户: ${userName} (ID: ${session.userId})
违规原因: ${reasonForAction}
违规等级: ${analysisResult.level || '未定级'}
`;
        let punishmentSuggestion = `违规处罚: `;
        let finalActionMessage = '';

        try { 
          await session.bot.deleteMessage(session.channelId, session.messageId);
          ctx.logger('gipas').info(`已删除违规消息 ${session.messageId}。`);
        } catch (e) { ctx.logger('gipas').warn(`删除违规消息 ${session.messageId} 失败:`, e); }

        // Temporary variables to hold parts of the message determined by the switch
        let detailedPunishmentText = ""; // e.g., "警告", "禁言 X 分钟"
        let outcomeMessageText = "";     // e.g., "已被警告", "已被禁言 X 分钟"
        let sendAnnouncement = true;   // Controls if the announcement is sent

        switch (actionToTake) {
          case 'warn':
            detailedPunishmentText = `警告`;
            outcomeMessageText = `已被警告`;
            break;
          case 'mute':
            if (muteDurationToApply && muteDurationToApply > 0) {
              const muteMinutes = Math.ceil(muteDurationToApply / 60);
              detailedPunishmentText = `禁言 ${muteMinutes} 分钟`;
              ctx.logger('gipas').info(`准备禁言用户 ${userName} (ID: ${session.userId})，时长: ${muteDurationToApply} 秒。`);
              try {
                await (session.bot as any).invoke('set_group_ban', { group_id: parseInt(session.guildId), user_id: parseInt(session.userId), duration: muteDurationToApply });
                ctx.logger('gipas').info(`用户 ${userName} (ID: ${session.userId}) 禁言成功。`);
                outcomeMessageText = `已被禁言 ${muteMinutes} 分钟`;
              } catch (e) {
                ctx.logger('gipas').error(`禁言用户 ${userName} (ID: ${session.userId}) 失败:`, e);
                outcomeMessageText = `尝试禁言失败`; // detailedPunishmentText (e.g., 禁言 X 分钟) remains the suggestion
              }
            } else {
              detailedPunishmentText = `警告 (因禁言时长无效)`;
              outcomeMessageText = `已被警告 (禁言时长无效)`;
              ctx.logger('gipas').warn(`禁言操作请求，但禁言时长为0或未定义。用户: ${userName} (ID: ${session.userId})`);
            }
            break;
          case 'kick':
            detailedPunishmentText = `移出本群`;
            try {
              await session.bot.kickGuildMember(session.guildId, session.userId);
              ctx.logger('gipas').info(`用户 ${userName} (ID: ${session.userId}) 已被踢出。`);
              outcomeMessageText = `已被移出本群`;
            } catch (e) {
              ctx.logger('gipas').error(`踢出用户 ${userName} (ID: ${session.userId}) 失败:`, e);
              outcomeMessageText = `尝试移出群聊失败`; // detailedPunishmentText (移出本群) remains the suggestion
            }
            break;
          case 'none':
            detailedPunishmentText = `无 (AI建议或配置为不处罚)`;
            outcomeMessageText = `未执行实际处罚`; 
            ctx.logger('gipas').info(`违规等级 ${analysisResult.level} 配置或AI建议的动作为 'none'，不执行处罚。`);
            sendAnnouncement = false; // Do not send announcement for 'none' actions by default
            break;
          default:
            ctx.logger('gipas').warn(`未知的处罚动作: ${actionToTake}，不执行任何操作。`);
            detailedPunishmentText = `未知动作 (${actionToTake})`; // For completeness if logic changes
            outcomeMessageText = `未执行任何操作`; // For completeness
            sendAnnouncement = false; // Do not send announcement for unknown actions
            break;
        }

        // Update the main message variables and send the announcement if needed
        // punishmentSuggestion is initialized as "违规处罚: " before this block
        // finalActionMessage is initialized as "" before this block

        if (sendAnnouncement) {
          punishmentSuggestion += detailedPunishmentText; // Appends to "违规处罚: "
          finalActionMessage = outcomeMessageText;
          session.send(announcementBase + punishmentSuggestion + `\n` + finalActionMessage);
        } else {
          // Even if not sending a public announcement, update the message variables
          // for potential internal logging or consistent state, especially for 'none'.
          if (detailedPunishmentText) {
            punishmentSuggestion += detailedPunishmentText;
          }
          if (outcomeMessageText) {
            finalActionMessage = outcomeMessageText;
          }
          // Note: The original code had a commented-out session.send for 'none'. 
          // If explicit announcement for 'none' is desired, set sendAnnouncement = true in its case.
        }
      }
    });
}