import { Context, Schema, Tables } from 'koishi' // Added Tables
import { } from 'koishi-plugin-cron';
// @ts-ignore
import { DiscussServiceClient } from '@google-cloud/aiplatform'

// Define the structure of your userdata table
export interface UserData {
  id: number // Primary key, typically auto-incrementing
  userId: string // QQ ID
  // Add other fields from your userdata table here
  // For example: username: string, registrationDate: Date, etc.
}

// Extend Koishi's Tables interface with your custom table
declare module 'koishi' {
  interface Tables {
    userdata: UserData
  }
}

export const name = 'gipas'
export const inject = {
  required: [ 'cron' ]
}

export interface Config {
  geminiApiKey: string
  geminiProjectId: string
  geminiModel: string
  muteCron: string
  unmuteCron: string
  weekendMuteCron: string
  weekendUnmuteCron: string
}

export const Config: Schema<Config> = Schema.object({
  geminiApiKey: Schema.string().description('Gemini API Key').required(),
  geminiProjectId: Schema.string().description('Google Cloud Project ID for Gemini').required(),
  geminiModel: Schema.string().default('gemini-pro').description('Gemini Model ID (e.g., gemini-pro)'),
  muteCron: Schema.string().default('0 18 * * 1-5').description('Weekday mute cron expression (e.g., "0 18 * * 1-5" for 6 PM on weekdays)'),
  unmuteCron: Schema.string().default('0 0 * * 1-5').description('Weekday unmute cron expression (e.g., "0 0 * * 1-5" for midnight on weekdays)'),
  weekendMuteCron: Schema.string().default('0 8 * * 0,6').description('Weekend mute cron expression (e.g., "0 8 * * 0,6" for 8 AM on weekends)'),
  weekendUnmuteCron: Schema.string().default('0 0 * * 0,6').description('Weekend unmute cron expression (e.g., "0 0 * * 0,6" for midnight on weekends)'),
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
`

async function analyzeChatMessage(message: string, config: Config, ctx: Context): Promise<boolean> {
  if (!config.geminiApiKey || !config.geminiProjectId) {
    ctx.logger('gipas').warn('Gemini API Key or Project ID is not configured. Skipping message analysis.')
    return false;
  }

  const client = new DiscussServiceClient({
    // Ensure your GOOGLE_APPLICATION_CREDENTIALS environment variable is set
    // or you have otherwise configured authentication for Google Cloud.
    // The API key might be used differently depending on the specific Gemini client library or REST API usage.
    // This is a generic placeholder.
  });

  const endpoint = `projects/${config.geminiProjectId}/locations/us-central1/publishers/google/models/${config.geminiModel}`;

  const prompt = `Analyze the following chat message based on the provided rules.
Determine if the message violates any of the rules.
Respond with "true" if it violates the rules, and "false" otherwise.

Rules:
${RULES}

Message:
${message}

Does the message violate the rules? (true/false):`;

  const request = {
    endpoint,
    instances: [
      { content: prompt },
    ],
  };

  try {
    // @ts-ignore
    const [response] = await client.predict(request);
    // @ts-ignore
    if (response.predictions && response.predictions.length > 0 && response.predictions[0].content) {
      const prediction = response.predictions[0].content.toLowerCase().trim();
      return prediction === 'true';
    }
    ctx.logger('gipas').warn('Gemini AI response format not as expected.');
    return false;
  } catch (error) {
    ctx.logger('gipas').error('Error analyzing chat message with Gemini AI:', error)
    return false;
  }
}

async function analyzeJoinRequest(joinMessage: string, config: Config, ctx: Context): Promise<boolean> {
  if (!config.geminiApiKey || !config.geminiProjectId) {
    ctx.logger('gipas').warn('Gemini API Key or Project ID is not configured. Skipping join request analysis.')
    return false;
  }
   const client = new DiscussServiceClient({
    // Auth setup as above
  });
  const endpoint = `projects/${config.geminiProjectId}/locations/us-central1/publishers/google/models/${config.geminiModel}`;

  const joinQuestions = `
入群问题：
1. 你是否是旧文游的玩家
2. 你是否承诺遵守本群群规
3. 简要回答你怎么看待征战文游（比如正面多一点，反面多一点，持观望态度，详细的进群回答）
4. 简要回答你进群的目的
`;

  const prompt = `Analyze the following group join request answers based on the provided questions and general safety.
The user is applying to join a game-related group with strict rules.
Determine if the answers are suspicious, evasive, disrespectful, or indicate a potential troublemaker.
Respond with "true" if the join request is suspicious, and "false" otherwise.

Join Questions:
${joinQuestions}

User's Answers (extracted from their join message):
${joinMessage}

Is this join request suspicious? (true/false):`;

  const request = {
    endpoint,
    instances: [ { content: prompt } ],
  };

  try {
    // @ts-ignore
    const [response] = await client.predict(request);
    // @ts-ignore
    if (response.predictions && response.predictions.length > 0 && response.predictions[0].content) {
      const prediction = response.predictions[0].content.toLowerCase().trim();
      return prediction === 'true'; // true if suspicious
    }
    ctx.logger('gipas').warn('Gemini AI response format for join request not as expected.');
    return false;
  } catch (error) {
    ctx.logger('gipas').error('Error analyzing join request with Gemini AI:', error)
    return false;
  }
}

export function apply(ctx: Context, config: Config) {
  ctx.logger('gipas').info('Plugin loaded')

  let activeChannelId: string | null = null;

  ctx.command('gipas.activate', 'Activate GIPAS for the current channel')
    .action(async ({ session }) => {
      if (session.channelId) {
        activeChannelId = session.channelId;
        session.send(`GIPAS activated for channel ${activeChannelId}. Mute/unmute messages will be sent here.`)
      } else {
        session.send('This command can only be used in a channel.')
      }
    })

  // @ts-ignore
  ctx.cron(config.muteCron, () => {
    if (activeChannelId) {
      ctx.bots.forEach(async bot => {
        await bot.sendMessage(activeChannelId, 'It\'s time for the timed mute. Please refrain from sending messages.')
      })
      ctx.logger('gipas').info(`Sending mute message to ${activeChannelId}`)
    }
  })

  // @ts-ignore
  ctx.cron(config.unmuteCron, () => {
    if (activeChannelId) {
      ctx.bots.forEach(async bot => {
        await bot.sendMessage(activeChannelId, 'The timed mute is over. You may now send messages.')
      })
      ctx.logger('gipas').info(`Sending unmute message to ${activeChannelId}`)
    }
  })

  // @ts-ignore
  ctx.cron(config.weekendMuteCron, () => {
    if (activeChannelId) {
      ctx.bots.forEach(async bot => {
        await bot.sendMessage(activeChannelId, 'It\'s time for the weekend timed mute. Please refrain from sending messages.')
      })
      ctx.logger('gipas').info(`Sending weekend mute message to ${activeChannelId}`)
    }
  })

  // @ts-ignore
  ctx.cron(config.weekendUnmuteCron, () => {
    if (activeChannelId) {
      ctx.bots.forEach(async bot => {
        await bot.sendMessage(activeChannelId, 'The weekend timed mute is over. You may now send messages.')
      })
      ctx.logger('gipas').info(`Sending weekend unmute message to ${activeChannelId}`)
    }
  })

  ctx.on('message', async (session) => {
    if (session.channelId && session.channelId === activeChannelId && session.content) {
      const message = session.content;
      const violatesRules = await analyzeChatMessage(message, config, ctx);
      if (violatesRules) {
        session.send('Warning: This message violates the群规.');
      }
    }

    // Placeholder for group member request handling
    // if (session.subtype === 'group-member-request') {
    //   // TODO: Implement入群检查模块
    // }
  })

  // Event listener for group member requests
  ctx.on('guild-member-request', async (session) => {
    if (!activeChannelId || session.guildId !== activeChannelId) return;

    ctx.logger('gipas').info(`Received group member request from ${session.userId} for group ${session.guildId}`);

    // 1. Check userdata table (conceptual)
    // 1. Check userdata table
    let isRegistered = false;
    try {
      const userData = await ctx.database.get('userdata', { userId: session.userId });
      if (userData && userData.length > 0) {
        isRegistered = true;
        ctx.logger('gipas').info(`User ${session.userId} found in userdata.`);
      } else {
        ctx.logger('gipas').info(`User ${session.userId} not found in userdata.`);
      }
    } catch (dbError) {
      ctx.logger('gipas').error(`Error querying userdata for ${session.userId}:`, dbError);
    }

    // 2. Analyze join request message
    const joinMessage = session.content || ""; // Assuming join request comment is in session.content
    let isJoinRequestSuspicious = false;
    if (joinMessage) {
      isJoinRequestSuspicious = await analyzeJoinRequest(joinMessage, config, ctx);
    }

    // 3. Decision logic
    if (!isRegistered && isJoinRequestSuspicious) {
      ctx.logger('gipas').info(`Rejecting join request from ${session.userId}: Not registered AND suspicious join message.`);
      await session.bot.handleGuildMemberRequest(session.messageId, false, '用户未注册游戏且申请信息可疑，入群申请未通过。');
      await session.bot.sendMessage(session.guildId, `已拒绝用户 ${session.userId} 的入群申请 (原因：未注册或申请信息可疑)。`);
    } else if (isJoinRequestSuspicious) {
      ctx.logger('gipas').warn(`Join request from ${session.userId} (Registered: ${isRegistered}) has suspicious message: "${joinMessage}". Approving with caution.`);
      await session.bot.handleGuildMemberRequest(session.messageId, true);
      await session.bot.sendMessage(session.guildId, `用户 ${session.userId} 已被批准入群，但其申请信息可疑，建议人工复核。申请信息: "${joinMessage}"`);
    } else if (!isRegistered) {
      ctx.logger('gipas').info(`Join request from ${session.userId} (Not registered). Approving.`);
      await session.bot.handleGuildMemberRequest(session.messageId, true);
      // Optionally, send a different message if a non-registered user is approved without suspicious message
      // await session.bot.sendMessage(session.guildId, `用户 ${session.userId} 已被批准入群 (该用户未在游戏内注册)。`);
    } else { // Registered and not suspicious
      ctx.logger('gipas').info(`Approving join request from registered user ${session.userId}.`);
      await session.bot.handleGuildMemberRequest(session.messageId, true);
    }
  })
}
