import { Context, h } from 'koishi'
import { Config } from '../../config'
import { ParseProfileWithAI, ParsedProfile } from './ParseProfileWithAI' // 导入AI解析函数和类型


// 存储用户申请状态
interface ApplicationState {
  guildId: string;
  timer: NodeJS.Timeout;
}

const applicationStates = new Map<string, ApplicationState>();

export function FileSystem( ctx: Context , config: Config ) {
  const logger = ctx.logger('group-profile')

  // 申请填写/更新档案
  ctx.command('申请档案', '申请填写或更新你的个人档案')
    .alias('档案申请')
    .action(async ({ session }) => {
      const { userId, guildId } = session

      if (!guildId || !config.enabledGroups.includes(guildId)) {
        return '本群未启用同学档案功能。'
      }

      if (applicationStates.has(userId)) {
        return h.at(userId) + ' 你当前已在申请流程中，请直接提交档案内容。'
      }

      // 发送须知并等待用户同意
      await session.send(
        '【档案填写须知】\n' +
        '1. 档案仅供方便社交和管理使用，请勿冒充他人。\n' +
        '2. 请勿填入除要求外其他过度的隐私信息。\n' +
        '3. 任何人在群内都可以互相查看公开的档案，就像个人资料一样。\n' +
        '4. 不想填的比如姓名可以填匿名，但是鼓励实名\n' +
        '5. 你可以随时将你的档案设置为不公开，保护个人隐私。\n\n' +
        '请回复"同意"以继续，或回复其他内容取消。'
      )

      const reply = await session.prompt(30 * 1000) // 等待30秒

      if (reply?.trim() !== '同意') {
        return '操作已取消。'
      }

      // 设置30分钟倒计时
      const timeout = config.applicationTimeout * 60 * 1000
      const timer = setTimeout(() => {
        applicationStates.delete(userId)
        session.send(h.at(userId) + ' 你的档案填写申请已超时，请重新申请。')
        logger.info(`User ${userId} application timed out.`)
      }, timeout)

      applicationStates.set(userId, { guildId, timer })
      logger.info(`User ${userId} started an application in group ${guildId}.`)

      return (
        h.at(userId) + ` 请在 ${config.applicationTimeout} 分钟内，通过与我私聊或直接在本群发送你的档案。\n` +
        '请严格按照以下格式提交，无需修改字段名，将"内容"替换为你的信息：\n\n' +
        '真实姓名：内容\n' +
        '第几届学生：内容\n' +
        '班级：内容\n' +
        '自我描述：内容'
      )
    })

  // 中间件，用于捕获用户的档案提交
  ctx.middleware(async (session, next) => {
    const { userId, content } = session
    if (!applicationStates.has(userId)) {
      return next()
    }

    const state = applicationStates.get(userId)

    try {
      // 智能解析与验证
      const parsedData = await parseProfile(ctx, config, content)

      // 检查是否为首次创建档案
      const existingProfile = await ctx.database.get('FileSystem', { 
        userId,
        groupId: state.guildId 
      })
      const isFirstTime = !existingProfile || existingProfile.length === 0

      // 验证通过，存入数据库
      await ctx.database.upsert( 'FileSystem', [{
        userId,
        groupId: state.guildId,
        realname: parsedData.realname,
        Term: parsedData.Term,
        Class: parsedData.Class,
        SelfDescription: parsedData.SelfDescription,
        isPublic: parsedData.isPublic,
        supervisionRating: isFirstTime ? 100 : existingProfile[0]?.supervisionRating || 100, // 首次创建时初始化为100分，更新时保持原有评级
        positivityRating: isFirstTime ? 100 : existingProfile[0]?.positivityRating || 100, // 积极性评分，初始值100分
      }])

      // 清理状态
      clearTimeout(state.timer)
      applicationStates.delete(userId)

      logger.info(`User ${userId} successfully submitted their profile.`)
      return h.at(userId) + ' 你的档案已成功保存！'
    } catch (error) {
      // 格式错误，提示用户
      return h.at(userId) + ` 档案格式似乎有误：${error.message}\n请检查后重新提交，无需重新申请。`
    }
  })

  // 查看档案
  ctx.command('查看档案 [targetUser:user]', '查看指定用户的档案')
    .alias('档案查看')
    .action(async ({ session }, targetUser) => {
      const { guildId } = session
      if (!guildId || !config.enabledGroups.includes(guildId)) {
        return '本群未启用同学档案功能。'
      }

      let targetUserId: string | null = null;
      
      if (targetUser) {
        // 参考SetTitle.ts的解析方式
        logger.info(`原始targetUser: ${targetUser}`);
        if (typeof targetUser === 'string') {
          const parts = targetUser.split(':');
          targetUserId = parts[parts.length - 1];
        }
        logger.info(`解析后targetUserId: ${targetUserId}`);
      } else {
        // 如果没有指定目标，查看自己的档案
        targetUserId = session.userId;
      }

      if (!targetUserId) {
        return '请指定要查看的用户，例如：查看档案 @用户名'
      }

      // 使用数据库查询
      const profiles = await ctx.database.select('FileSystem')
        .where({ userId: targetUserId, groupId: guildId })
        .execute()

      if (!profiles || profiles.length === 0) {
        logger.info(`未找到档案 - userId: ${targetUserId}, groupId: ${guildId}`);
        return '未找到该用户的档案。'
      }

      const data = profiles[0]

      // 隐私检查
      if (!data.isPublic && data.userId !== session.userId) {
        return '该用户的档案设置为不公开，你无法查看。'
      }
      
      // 获取目标用户的昵称或名称
      let authorName = '该用户'
      if (targetUserId === session.userId) {
        authorName = '你'
      } else {
        try {
          // 尝试从会话中获取目标用户的名称，如果无法获取则显示默认值
          const targetUserInfo = await session.bot.getUser(targetUserId)
          authorName = targetUserInfo?.name || targetUserInfo?.nick || '该用户'
        } catch (error) {
          authorName = '该用户'
        }
      }

      // 格式化输出，包含监督性评级和积极性评分
      return (
        ` ${authorName} 的资料：\n` +
        `ID：${data.userId}\n` +
        `■真实姓名：${data.realname}\n` +
        `□届数：${data.Term}\n` +
        `□班级：${data.Class}\n` +
        `■自我描述：\n${data.SelfDescription}\n` +
        `■监督性评分：${data.supervisionRating || 100} 分\n` +
        `■积极性评分：${data.positivityRating || 100} 分\n`
      )
    })

  // 设置档案公开
  ctx.command('档案公开', '将你的档案设置为公开')
    .action(async ({ session }) => {
      const existing = await ctx.database.get('FileSystem', { 
        userId: session.userId,
        groupId: session.guildId 
      })
      if (!existing || existing.length === 0) return '你还没有创建档案，请先使用"申请档案"创建。'

      await ctx.database.set('FileSystem', { 
        userId: session.userId,
        groupId: session.guildId 
      }, { isPublic: true })
      return '你的档案已设置为公开。'
    })

  // 设置档案私密
  ctx.command('档案私密', '将你的档案设置为不公开')
    .action(async ({ session }) => {
      const existing = await ctx.database.get('FileSystem', { 
        userId: session.userId,
        groupId: session.guildId 
      })
      if (!existing || existing.length === 0) return '你还没有创建档案，请先使用"申请档案"创建。'
      
      await ctx.database.set('FileSystem', { 
        userId: session.userId,
        groupId: session.guildId 
      }, { isPublic: false })
      return '你的档案已设置为不公开。'
    })
}

/**
 * 智能解析与验证函数 (使用AI进行解析)
 * @param ctx Koishi上下文
 * @param config 配置对象
 * @param text 用户提交的原始文本
 * @returns 解析后的档案对象
 * @throws Error 如果AI解析失败或返回的数据不符合预期
 */
async function parseProfile(
  ctx: Context,
  config: Config,
  text: string
): Promise<ParsedProfile> {
  const parsedData = await ParseProfileWithAI(ctx, config, text);

  if (!parsedData) {
    throw new Error('AI解析档案失败，请检查提交内容。');
  }

  // 检查AI返回的数据是否包含所有必需字段
  const requiredKeys: (keyof ParsedProfile)[] = ['realname', 'Term', 'Class', 'SelfDescription', 'isPublic'];
  for (const key of requiredKeys) {
    if (parsedData[key] === undefined || parsedData[key] === null || (typeof parsedData[key] === 'string' && parsedData[key].trim().length === 0)) {
      throw new Error(`AI解析结果缺少或无法识别字段："${key}"。请确保所有字段都已填写。`);
    }
  }

  return parsedData;
}