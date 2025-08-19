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

  // 主命令 `profile`，为了结构清晰
  const cmd = ctx.command('档案', '同学档案系统')
    .alias('profile')
    .action(async ({ session }) => {
      return session.execute('档案 -h')
    })

  // 申请填写/更新档案
  cmd.subcommand('.申请', '申请填写或更新你的个人档案')
    .alias('apply')
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
        '4. 不想填的比如姓名可以填匿名，其它同理。\n' +
        '5. 你可以随时将你的档案设置为不公开，保护个人隐私。\n\n' +
        '请回复“同意”以继续，或回复其他内容取消。'
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
        '请严格按照以下格式提交，无需修改字段名，将“内容”替换为你的信息：\n\n' +
        '真实姓名：内容\n' +
        '网名：内容\n' +
        '第几届学生：内容\n' +
        '班级：内容\n' +
        '自我描述：内容\n' +
        '是否公开：是/否'
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

      // 验证通过，存入数据库
      await ctx.database.upsert( 'FileSystem', [{
        userId,
        groupId: state.guildId,
        realname: parsedData.realname,
        Netname: parsedData.Netname,
        Term: parsedData.Term,
        Class: parsedData.Class,
        SelfDescription: parsedData.SelfDescription,
        isPublic: parsedData.isPublic,
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
  cmd.subcommand('.查看 [user:user]', '查看指定用户的档案')
    .alias('view')
    .action(async ({ session }, target) => {
      const { guildId } = session
      if (!guildId || !config.enabledGroups.includes(guildId)) {
        return '本群未启用同学档案功能。'
      }

      // 如果提供了 target (即 @了某人)，则直接使用 target 作为用户ID，否则使用 session.userId
      const targetId = target || session.userId

      if (!targetId) {
        return '请指定要查看的用户。'
      }

      const profile = await ctx.database.get('FileSystem', { userId: targetId })

      if (!profile || profile.length === 0) {
        return '未找到该用户的档案。'
      }

      const data = profile[0]

      // 隐私检查
      if (!data.isPublic && data.userId !== session.userId) {
        return '该用户的档案设置为不公开，你无法查看。'
      }
      
      // 获取目标用户的昵称或名称
      let authorName = '该用户'
      if (targetId === session.userId) {
        authorName = '你'
      } else {
        // 尝试从会话中获取目标用户的名称，如果无法获取则显示默认值
        const targetUser = await session.bot.getUser(targetId)
        authorName = targetUser?.name || targetUser?.nick || '该用户'
      }

      // 格式化输出
      return (
        `${authorName}的档案：\n` +
        `真实姓名：${data.realname}\n` +
        `网名：${data.Netname}\n` +
        `第几届学生：${data.Term}\n` +
        `班级：${data.Class}\n` +
        `自我描述：${data.SelfDescription}\n` +
        `状态：${data.isPublic ? '公开' : '不公开'}`
      )
    })

  // 设置档案公开
  cmd.subcommand('.公开', '将你的档案设置为公开')
    .action(async ({ session }) => {
      const existing = await ctx.database.get('FileSystem', { userId: session.userId })
      if (!existing || existing.length === 0) return '你还没有创建档案，请先使用“档案申请”创建。'

      await ctx.database.set('FileSystem', { userId: session.userId }, { isPublic: true })
      return '你的档案已设置为公开。'
    })

  // 设置档案私密
  cmd.subcommand('.私密', '将你的档案设置为不公开')
    .action(async ({ session }) => {
      const existing = await ctx.database.get('FileSystem', { userId: session.userId })
      if (!existing || existing.length === 0) return '你还没有创建档案，请先使用“档案申请”创建。'
      
      await ctx.database.set('FileSystem', { userId: session.userId }, { isPublic: false })
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
  const requiredKeys: (keyof ParsedProfile)[] = ['realname', 'Netname', 'Term', 'Class', 'SelfDescription', 'isPublic'];
  for (const key of requiredKeys) {
    if (parsedData[key] === undefined || parsedData[key] === null || (typeof parsedData[key] === 'string' && parsedData[key].trim().length === 0)) {
      throw new Error(`AI解析结果缺少或无法识别字段：“${key}”。请确保所有字段都已填写。`);
    }
  }

  return parsedData;
}
