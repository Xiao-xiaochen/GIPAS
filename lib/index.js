var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var src_exports = {};
__export(src_exports, {
  Config: () => Config,
  GuildMessageHistories: () => GuildMessageHistories,
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(src_exports);

// src/models.ts
function Database(ctx) {
  ctx.model.extend("ViolationRecord", {
    id: { type: "unsigned" },
    userId: { type: "string", length: 255 },
    guildId: { type: "string", length: 255 },
    timestamp: { type: "timestamp" },
    MessageContent: { type: "text" },
    violationLevel: { type: "unsigned" },
    ActionDescription: { type: "text" },
    actionTaken: { type: "string", length: 255 }
  }, {
    autoInc: true,
    primary: "id"
  });
  ctx.model.extend("UserRecord", {
    id: { type: "unsigned" },
    userId: { type: "string", length: 255 },
    guildId: { type: "string", length: 255 },
    level1Violations: { type: "unsigned", initial: 0 },
    level2Violations: { type: "unsigned", initial: 0 },
    level3Violations: { type: "unsigned", initial: 0 }
  }, {
    autoInc: true,
    primary: "id"
  });
}
__name(Database, "Database");

// src/config.ts
var import_koishi = require("koishi");
var Config = import_koishi.Schema.intersect([
  import_koishi.Schema.object({
    geminiModel: import_koishi.Schema.string().description("模型设置"),
    geminiApiKey: import_koishi.Schema.string().description("API Key")
  }).description("AI基础设置"),
  import_koishi.Schema.object({
    MonitoredGuildIds: import_koishi.Schema.array(import_koishi.Schema.string()).description("监听的群聊列表"),
    MaxChatHistoryLength: import_koishi.Schema.number().description("最大聊天历史记录").default(500),
    Rules: import_koishi.Schema.string().description("通用群规设置，默认设置不好，请更改").default(`
一、基本原则
尊重原则
尊重他人隐私、信仰、性别、种族及政治立场
禁止任何形式的人身攻击、歧视性言论或恶意嘲讽
合法合规
严格遵守中国法律法规及平台规定
禁止传播违法违规内容（详见行为规范）
二、行为规范（违规等级制度）
一级违规（警告）
发送广告或者任何带有主观宣传性质的事，并且宣传的是商业性的
二级违规（禁言）
人身攻击：使用严重侮辱性词汇
虚假信息：传播未经证实的谣言造成轻微影响
三级违规（踢出群聊）
违法内容：
涉黄/涉暴/涉恐图文视频
赌博/毒品/诈骗相关信息
破坏国家统一的言论
严重人身攻击：
人肉搜索/曝光隐私
群体歧视/仇恨言论
持续骚扰威胁成员
恶意破坏：
故意传播病毒/钓鱼链接
组织刷屏攻击
冒充管理员诈骗
特别规定：
可以谈论政治，意识形态，但是禁止任何可能存在的、针对现代政治人物或者政治事件的谣言（古代和近现代的可以），比如某某某遇刺是某某某为了某某某而指示的。注：这些谈论不能直接违反法律，如果是灰色地带或者模棱两可遵从疑罪从无
可以开纳粹玩笑，用希特勒笑话表情包，但是注意，一旦相关言论、表情直接透露出对这类主义、其暴行、历史事实的歪曲，美化，和正面宣传，都是至少二级违规
`)
  }).description("自动化管理基础设置"),
  import_koishi.Schema.object({
    level1Action: import_koishi.Schema.union([
      import_koishi.Schema.const("warn").description("警告"),
      import_koishi.Schema.const("mute").description("禁言"),
      import_koishi.Schema.const("kick").description("踢出"),
      import_koishi.Schema.const("guild_mute").description("频道禁言"),
      import_koishi.Schema.const("none").description("无操作")
    ]).description("一级违规处罚").default("warn"),
    level2Action: import_koishi.Schema.union([
      import_koishi.Schema.const("warn").description("警告"),
      import_koishi.Schema.const("mute").description("禁言"),
      import_koishi.Schema.const("kick").description("踢出"),
      import_koishi.Schema.const("guild_mute").description("频道禁言"),
      import_koishi.Schema.const("none").description("无操作")
    ]).description("二级违规处罚").default("mute"),
    level3Action: import_koishi.Schema.union([
      import_koishi.Schema.const("warn").description("警告"),
      import_koishi.Schema.const("mute").description("禁言"),
      import_koishi.Schema.const("kick").description("踢出"),
      import_koishi.Schema.const("guild_mute").description("频道禁言"),
      import_koishi.Schema.const("none").description("无操作")
    ]).description("三级违规处罚").default("kick"),
    level1MuteMinutes: import_koishi.Schema.number().description("一级禁言时长（分钟）").default(10),
    level2MuteMinutes: import_koishi.Schema.number().description("二级禁言时长（分钟）").default(60),
    level3MuteMinutes: import_koishi.Schema.number().description("三级禁言时长（分钟）").default(180)
  }).description("违规处理设置")
]);

// src/AutomatedManagement/MonitorGroup.ts
async function InitializeChatSession(ctx, config, guildId) {
  if (!GuildMessageHistories.has(guildId)) {
    GuildMessageHistories.set(guildId, []);
    ctx.logger("gipas").info(`为群组 ${guildId} 初始化消息历史记录。`);
  } else {
    ctx.logger("gipas").debug(`群组 ${guildId} 的消息历史记录已存在。`);
  }
  return true;
}
__name(InitializeChatSession, "InitializeChatSession");

// src/Utils/ExecutePunishment.ts
async function ExecutePunishment(session, ctx, analysisResult) {
  const UserName = session.author?.name || "未知用户";
  const UserId = session.userId;
  if (!UserId) {
    return "用户ID不存在";
  }
  const GuildId = session.guildId;
  if (!GuildId) {
    return "群聊不存在";
  }
  const MessageId = session.messageId;
  if (!MessageId) {
    return "无效的消息ID";
  }
  const bot = session.bot;
  const { action, muteDuration } = analysisResult;
  let outcomeMessage = "未执行任何操作";
  try {
    await bot.deleteMessage(GuildId, MessageId);
    ctx.logger("gipas").info(`已删除违规消息 ${MessageId}`);
  } catch (error) {
    ctx.logger("gipas").warn(`删除违规消息 ${MessageId} 失败:`, error);
  }
  switch (action) {
    // 警告级违规
    case "warn":
      outcomeMessage = `已被警告`;
      break;
    // 禁言级违规
    case "mute":
      if (muteDuration && muteDuration > 0) {
        const muteMinutes = Math.ceil(muteDuration / 60);
        try {
          await bot.muteGuildMember(GuildId, UserId, muteDuration * 1e3);
          ctx.logger("gipas").info(`用户 ${UserName} (ID: ${session.userId}) 禁言 ${muteMinutes} 分钟成功。`);
          outcomeMessage = ` 已被禁言 ${muteMinutes} 分钟 `;
        } catch (error) {
          ctx.logger("gipas").error(`禁言用户 ${UserName} (ID: ${session.userId}) 失败:`, error);
          outcomeMessage = `尝试禁言失败`;
        }
      } else {
        outcomeMessage = `已被警告 (因禁言时长无效)`;
        ctx.logger("gipas").warn(`请求禁言但时长无效: ${muteDuration}`);
      }
      break;
    // 踢出级违规
    case "kick":
      try {
        await bot.kickGuildMember(GuildId, UserId);
        ctx.logger("gipas").info(`用户 ${UserName} (ID: ${UserId}) 已被踢出。`);
        outcomeMessage = `已被移出本群`;
      } catch (error) {
        ctx.logger("gipas").error(`踢出用户 ${UserName} (ID: ${UserId}) 失败:`, error);
        outcomeMessage = `尝试移出群聊失败`;
      }
      break;
    // 未知的违规等级
    case "none":
      outcomeMessage = "未执行实际处罚";
      break;
    default:
      ctx.logger("gipas").warn(`未知的处罚动作: ${action}`);
      break;
  }
  return outcomeMessage;
}
__name(ExecutePunishment, "ExecutePunishment");

// src/AutomatedManagement/AnalyzeMessage.ts
var import_genai = require("@google/genai");

// src/Utils/DownloadImage.ts
function getSessionImageUrl(session) {
  if (!session?.elements) {
    return null;
  }
  const imageElement = session.elements.find((element) => {
    const isImage = element.type === "img" || element.type === "image";
    return isImage && element.attrs?.src;
  });
  return imageElement?.attrs?.src ?? null;
}
__name(getSessionImageUrl, "getSessionImageUrl");
async function downloadImageAsBase64(url, ctx) {
  try {
    const koishiResponse = await ctx.http.get(url, {
      responseType: "arraybuffer"
    });
    const bufferData = Buffer.from(koishiResponse);
    const base64ImageData = bufferData.toString("base64");
    const extension = url.split(".").pop()?.toLowerCase() || "";
    const mimeTypeMap = {
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
      jpg: "image/jpeg",
      jpeg: "image/jpeg"
    };
    return {
      mimeType: mimeTypeMap[extension] || "image/jpeg",
      data: base64ImageData
    };
  } catch (error) {
    ctx.logger.warn(`图片下载失败: ${url}`, error);
    return null;
  }
}
__name(downloadImageAsBase64, "downloadImageAsBase64");

// src/Utils/ParseAIResponse.ts
function ParseAIResponse(predictionText, config, ctx) {
  const parts = predictionText.split(",").map((part) => part.trim());
  const level1Action = config.level1Action;
  const isViolation = parts[0].toLowerCase() === "true";
  if (!isViolation) {
    return {
      is_violation: false,
      level: 1,
      action: "warn"
    };
  }
  if (parts.length < 2) {
    ctx.logger("gipas").warn("AI响应格式无效 (缺少等级):", predictionText);
    return { is_violation: true, level: 1, action: level1Action, reason: "AI响应格式错误，已默认为1级违规。" };
  }
  const level = parseInt(parts[1], 10);
  if (isNaN(level) || level < 1 || level > 3) {
    ctx.logger("gipas").warn("AI返回了无效的违规等级:", parts[1]);
    return { is_violation: true, level: 1, action: level1Action, reason: `AI返回无效等级 (${parts[1]})，已默认为1级违规。` };
  }
  const actionStr = parts[2]?.toLowerCase();
  const durationStr = parts[3]?.toLowerCase();
  const reason = parts.length > 4 ? parts.slice(4).join(", ").trim() : `AI判定违规 (等级 ${level})`;
  let action = level1Action;
  let muteDuration;
  switch (actionStr) {
    case "kick":
      action = "kick";
      break;
    case "warn":
      action = "warn";
      break;
    case "mute":
      action = "mute";
      const duration = parseInt(durationStr, 10);
      if (!isNaN(duration) && duration > 0) {
        muteDuration = duration;
      }
      break;
    case "none":
      action = "none";
      break;
  }
  if (!action) {
    switch (level) {
      case 1:
        action = level1Action;
        if (action === "mute") muteDuration = config.level1MuteMinutes * 60;
        break;
      case 2:
        action = config.level2Action;
        if (action === "mute") muteDuration = config.level2MuteMinutes * 60;
        break;
      case 3:
        action = config.level3Action;
        if (action === "mute") muteDuration = config.level3MuteMinutes * 60;
        break;
    }
  }
  return { is_violation: true, level, action, muteDuration, reason };
}
__name(ParseAIResponse, "ParseAIResponse");

// src/AutomatedManagement/AnalyzeMessage.ts
async function AnalyzeMessage(session, ctx, config, rules, messageHistory) {
  const imageUrl = getSessionImageUrl(session);
  const textContent = session.content?.replace(/<img.*?\/>/i, "").trim();
  const DefaultResult = {
    is_violation: false,
    level: 1,
    action: "warn"
  };
  if (!imageUrl && !textContent) {
    ctx.logger("gipas").debug(`消息为空，跳过分析: "${session.content}"`);
    return DefaultResult;
  }
  try {
    let predictionText = "false";
    const genAI = new import_genai.GoogleGenAI({ apiKey: config.geminiApiKey });
    const baseSystemPromptText = `你是一个群组的聊天管理员。你的任务是根据以下群规，判断我发给你的消息是否违规。
注意： 上下文判定请酌情判定，轻判，最重要的是遵从疑罪从无原则，你不能在有人发送违规言论下面接着发送了可以的文字就让他连坐
群规:
${rules}
判断指示:
1. 如果消息明确违规，你必须仅回应 "true,违规等级,处罚建议,处罚时长(秒)/kick,原因" 格式 (例如: "true,2,mute,3600,多次发送无关内容")。处罚建议可以是 'warn', 'mute', 'kick', 'none'。
2. 否则，仅回应 "false"。
3. 对常见中性消息（如“哈哈”、“666”、“？”、“好的”、“草”、“我操”）保持宽容，除非上下文构成明确违规。
4. 关注意图和影响。如果含义模糊，倾向于判为 "false"。
5. 考虑我连续发送的多条消息，它们可能共同构成违规。`;
    const historyContents = messageHistory.map((msg) => ({
      role: "user",
      parts: [{ text: `${msg.user}: ${msg.content}` }]
    }));
    if (imageUrl) {
      const imageData = await downloadImageAsBase64(imageUrl, ctx);
      if (!imageData) {
        ctx.logger("gipas").warn(`图片下载失败，跳过分析: ${imageUrl}`);
        return DefaultResult;
      }
      const requestContents = [
        { role: "user", parts: [{ text: baseSystemPromptText }] },
        ...historyContents,
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: imageData.mimeType, data: imageData.data } },
            { text: textContent || "无" }
          ]
        }
      ];
      ctx.logger("gipas").info(`图片消息分析: "${session.content}"`);
      const result = await genAI.models.generateContent({
        model: config.geminiModel,
        contents: requestContents
      });
      predictionText = result.text?.toLowerCase().trim() ?? "";
      ctx.logger("gipas").info(`图片消息分析预测: "${predictionText}"`);
    } else if (textContent) {
      const requestContents = [
        { role: "user", parts: [{ text: baseSystemPromptText }] },
        ...historyContents,
        {
          role: "user",
          parts: [{ text: textContent }]
        }
      ];
      ctx.logger("gipas").debug(`正在发送文本到 Gemini (通过 Model 对象): ${textContent}`);
      const streamResponse = await genAI.models.generateContentStream({
        model: config.geminiModel,
        contents: requestContents
      });
      let fullResponseText = "";
      for await (const chunk of streamResponse) {
        fullResponseText += chunk.text;
      }
      predictionText = fullResponseText.toLowerCase().trim();
      ctx.logger("gipas").info(`上下文文本分析: "${textContent}", AI原始回复: "${predictionText}"`);
    }
    return ParseAIResponse(predictionText, config, ctx);
  } catch (error) {
    ctx.logger("gipas").error("AI消息分析时发生错误:", error);
    if (error.response && error.response.status) {
      ctx.logger("gipas").error(`Gemini API 错误状态码: ${error.response.status}`);
      ctx.logger("gipas").error(`Gemini API 错误详情: ${JSON.stringify(error.response.data)}`);
    }
    return DefaultResult;
  }
}
__name(AnalyzeMessage, "AnalyzeMessage");

// src/AutomatedManagement/HandleMessage.ts
async function HandleMessage(ctx, session, config, rules, messageHistory) {
  if (session.userId === session.bot.userId) {
    return;
  }
  const analysisResult = await AnalyzeMessage(session, ctx, config, rules, messageHistory);
  if (!analysisResult.is_violation) {
    return;
  }
  ctx.logger("gipas").info(`检测到用户 ${session.userId} 违规 (等级 ${analysisResult.level})，详情:`, analysisResult);
  ExecutePunishment(session, ctx, analysisResult).then((outcomeMessage) => {
    if (analysisResult.action !== "none") {
      const userName = session.author?.name || session.author?.nick || session.userId;
      const announcement = [
        `====[违规通告]====`,
        `G.I.P.A.S.`,
        `违规用户: ${userName} (${session.userId})`,
        `违规原因: ${analysisResult.reason}`,
        `违规等级: ${analysisResult.level}`,
        `执行结果: ${outcomeMessage}`
      ].join("\n");
      session.send(announcement);
    }
  });
  try {
    await ctx.database.create("ViolationRecord", {
      userId: session.userId,
      guildId: session.guildId,
      MessageContent: session.content,
      timestamp: /* @__PURE__ */ new Date(),
      violationLevel: analysisResult.level,
      actionTaken: `${analysisResult.action || "none"}`
    });
  } catch (error) {
    ctx.logger("gipas").error("记录违规信息到数据库失败:", error);
  }
  ;
}
__name(HandleMessage, "HandleMessage");

// src/Utils/OnebotOperate.ts
async function SetGroupMute(ctx, session, guildId, enable) {
  if (session.platform !== "onebot") {
    ctx.logger.warn("此操作仅支持 OneBot 协议");
    return;
  }
  const NumericGuildId = Number(guildId);
  if (isNaN(NumericGuildId)) {
    ctx.logger.warn("群号错误");
    return;
  }
  try {
    const bot = session.bot;
    await bot.internal.setGroupWholeBan(NumericGuildId, enable);
  } catch (error) {
    ctx.logger.error("设置群禁言失败", error);
  }
}
__name(SetGroupMute, "SetGroupMute");

// src/ManualManagement/GeneralMute.ts
function GeneralMute(ctx, config) {
  ctx.command("戒严", { authority: 3 }).action(async ({ session }) => {
    if (!session) {
      return "无效的会话";
    }
    const guildId = session.guildId;
    if (!guildId) {
      return "无效的频道";
    }
    try {
      await SetGroupMute(ctx, session, guildId, true);
      return `已在频道 ${guildId} 执行全体禁言。`;
    } catch (error) {
      ctx.logger("gipas").error(`执行 gipas.muteall 指令失败:`, error);
      return `在频道 ${guildId} 执行全体禁言失败，请查看日志。`;
    }
  });
  ctx.command("解除戒严", { authority: 3 }).action(async ({ session }) => {
    if (!session) {
      return "无效的会话";
    }
    const guildId = session.guildId;
    if (!guildId) {
      return "无效的频道";
    }
    try {
      await SetGroupMute(ctx, session, guildId, false);
      return `已在频道 ${guildId} 解除全体禁言。`;
    } catch (error) {
      ctx.logger("gipas").error(`执行 gipas.unmuteall 指令失败:`, error);
      return `在频道 ${guildId} 解除全体禁言失败，请查看日志。`;
    }
  });
}
__name(GeneralMute, "GeneralMute");

// src/ManualManagement/ClearRecord.ts
var WaitingTime = {};
var ClearTimeout = 30 * 1e3;
function ClearReset(ctx) {
  ctx.command("重置数据", { authority: 4 }).action(async ({ session }) => {
    if (!session || !session.userId || !session.author) {
      return "无法获取用户信息。";
    }
    const userId = session.userId;
    const username = session.author.name || "未知用户";
    const now = Date.now();
    if (WaitingTime[userId] && now - WaitingTime[userId] < ClearTimeout) {
      try {
        console.log(`用户 ${username} (${userId}) 确认重置国家数据。`);
        const removedCount = await ctx.database.remove("UserRecord", {});
        console.log(`已从数据库删除 ${removedCount} 条国家数据。`);
        delete WaitingTime[userId];
        return `
=====[数据管理]=====
G.I.P.A.S.
所有违规数据已被重置！
`.trim();
      } catch (error) {
        console.error("重置违规数据时出错:", error);
        delete WaitingTime[userId];
      }
    } else {
      WaitingTime[userId] = now;
      setTimeout(() => {
        if (WaitingTime[userId] === now) {
          delete WaitingTime[userId];
          session.send(`=====[确认操作]=====
违规数据重置操作已超时, 重置取消！`).catch((err) => {
            console.warn(`发送违规数据重置超时消息失败: ${err.message}`);
          });
          console.log(`用户 ${username} (${userId}) 的违规数据重置确认已超时。`);
        }
      }, ClearTimeout);
      return `
=====[确认操作]=====
G.I.P.A.S. 警告：
此操作将清除所有违规数据！
请在 ${ClearTimeout / 1e3} 秒内再次输入 :
'重置数据' 命令以确认。
`.trim();
    }
  });
}
__name(ClearReset, "ClearReset");

// src/index.ts
var name = "gipas";
var inject = {
  required: ["cron", "database"]
};
var GuildMessageHistories = /* @__PURE__ */ new Map();
function apply(ctx, config) {
  ctx.logger("gipas").info("插件已加载");
  Database(ctx);
  ClearReset(ctx);
  GeneralMute(ctx, config);
  const initializationPromises = [];
  const GuildToInit = new Set(config.MonitoredGuildIds);
  if (config.geminiApiKey) {
    GuildToInit.forEach((guildId) => {
      ctx.logger("gipas").info(`插件启动时，尝试为预设群组 ${guildId} 初始化消息历史...`);
      initializationPromises.push(InitializeChatSession(ctx, config, guildId));
    });
  } else {
    ctx.logger("gipas").warn("未配置 Gemini API Key，跳过预设群组的初始化。");
  }
  Promise.allSettled(initializationPromises).then((results) => {
    results.forEach((result, index) => {
      const guildId = Array.from(GuildToInit)[index];
      if (result.status === "fulfilled" && result.value) {
        ctx.logger("gipas").info(`预设群组 ${guildId} 初始化完成。`);
      } else {
        ctx.logger("gipas").error(`预设群组 ${guildId} 初始化失败: ${result.status === "rejected" ? result.reason : "初始化函数返回false"}`);
      }
    });
    ctx.logger("gipas").info("所有预设群组初始化尝试完成。");
  }).catch((error) => {
    ctx.logger("gipas").error("初始化预设群组时发生未预料的错误:", error);
  });
  ctx.middleware(async (session, next) => {
    const Content2 = session.content;
    if (!Content2) {
      return;
    }
    ;
    const UserId = session.userId;
    if (!UserId) {
      return;
    }
    ;
    const GuildId = session.guildId;
    if (!GuildId) {
      return;
    }
    ;
    if (!config.MonitoredGuildIds.includes(GuildId) || session.selfId === session.userId) {
      return next();
    }
    ;
    if (!GuildMessageHistories.has(GuildId)) {
      ctx.logger("gipas").info(`消息触发群组 ${GuildId} 消息历史初始化...`);
      if (!await InitializeChatSession(ctx, config, GuildId)) {
        ctx.logger("gipas").warn(`无法为频道 ${session.channelId} 初始化消息历史，消息处理跳过。`);
        return next();
      }
      ctx.logger("gipas").info(`群组 ${GuildId} 消息历史通过消息触发初始化完成。`);
    }
    ;
    const history = GuildMessageHistories.get(GuildId) || [];
    if (!GuildMessageHistories.has(GuildId)) {
      GuildMessageHistories.set(GuildId, history);
    }
    ;
    const now = Date.now();
    history.push({ user: UserId, content: Content2, timestamp: new Date(now) });
    while (history.length > config.MaxChatHistoryLength || history.length > 0 && history[0].timestamp.getTime() < now - 5 * 60 * 1e3) {
      history.shift();
    }
    await HandleMessage(ctx, session, config, config.Rules, history);
    return next();
  });
}
__name(apply, "apply");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Config,
  GuildMessageHistories,
  apply,
  inject,
  name
});
