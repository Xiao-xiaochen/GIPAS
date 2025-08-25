import { Schema } from 'koishi';

export interface Config {
  geminiModel: string;
  geminiApiKey: string;
  
  // Deepseek API 配置
  deepseekApiKey: string;
  deepseekModel: string;
  deepseekBaseUrl: string;
  
  // API 使用策略
  apiStrategy: 'gemini-only' | 'deepseek-only' | 'gemini-first' | 'deepseek-first';

  // 节假日API配置
  holidayApiClientId: string;
  holidayApiSecret: string;

  enabledGroups: string[]
  applicationTimeout: number

  MonitoredGuildIds: string[],
  MaxChatHistoryLength: number;
  Rules: string

  level1Action: 'warn' | 'mute' | 'kick' | 'guild_mute' | 'none' ;
  level2Action: 'warn' | 'mute' | 'kick' | 'guild_mute' | 'none' ;
  level3Action: 'warn' | 'mute' | 'kick' | 'guild_mute' | 'none' ;
  level1MuteMinutes: number;
  level2MuteMinutes: number;
  level3MuteMinutes: number;

  // 智能定时禁言配置
  timedMuteGroups: Array<{
    guildId: string;
    workdaySchedules: {
      schedule1: {
        enabled: boolean;
        muteTime: string;
        unmuteTime: string;
      };
      schedule2: {
        enabled: boolean;
        muteTime: string;
        unmuteTime: string;
      };
    };
    holidaySchedules: {
      schedule1: {
        enabled: boolean;
        muteTime: string;
        unmuteTime: string;
      };
      schedule2: {
        enabled: boolean;
        muteTime: string;
        unmuteTime: string;
      };
    };
  }>;

  // 威权民主选举配置
  electionEnabled: boolean;
  electionCycle: 'weekly' | 'biweekly' | 'monthly';
  candidateRegistrationHours: number;
  votingHours: number;
  reelectionThreshold: number; // 连任支持率阈值
  maxAdministrators: number; // 最大管理员数量
  supportVotesPerPerson: number; // 每人支持票数
  opposeVotesPerPerson: number; // 每人反对票数
}


export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    geminiModel: Schema.union([
      Schema.const('gemini-1.5-flash').description('Gemini 1.5 Flash'),
      Schema.const('gemini-1.5-flash-002').description('Gemini 1.5 Flash 002'),
      Schema.const('gemini-1.5-flash-8b').description('Gemini 1.5 Flash 8B'),
      Schema.const('gemini-1.5-flash-8b-001').description('Gemini 1.5 Flash 8B 001'),
      Schema.const('gemini-1.5-flash-8b-latest').description('Gemini 1.5 Flash 8B Latest'),
      Schema.const('gemini-1.5-flash-latest').description('Gemini 1.5 Flash Latest'),
      Schema.const('gemini-1.5-pro').description('Gemini 1.5 Pro'),
      Schema.const('gemini-1.5-pro-002').description('Gemini 1.5 Pro 002'),
      Schema.const('gemini-1.5-pro-latest').description('Gemini 1.5 Pro Latest'),
      Schema.const('gemini-2.0-flash').description('Gemini 2.0 Flash'),
      Schema.const('gemini-2.0-flash-001').description('Gemini 2.0 Flash 001'),
      Schema.const('gemini-2.0-flash-exp').description('Gemini 2.0 Flash Experimental'),
      Schema.const('gemini-2.0-flash-exp-image-generation').description('Gemini 2.0 Flash Exp (Image Gen)'),
      Schema.const('gemini-2.0-flash-lite').description('Gemini 2.0 Flash Lite'),
      Schema.const('gemini-2.0-flash-lite-001').description('Gemini 2.0 Flash Lite 001'),
      Schema.const('gemini-2.0-flash-lite-preview').description('Gemini 2.0 Flash Lite Preview'),
      Schema.const('gemini-2.0-flash-lite-preview-02-05').description('Gemini 2.0 Flash Lite Preview 02-05'),
      Schema.const('gemini-2.0-flash-preview-image-generation').description('Gemini 2.0 Flash Preview (Image Gen)'),
      Schema.const('gemini-2.0-flash-thinking-exp').description('Gemini 2.0 Flash Thinking Experimental'),
      Schema.const('gemini-2.0-flash-thinking-exp-01-21').description('Gemini 2.0 Flash Thinking Exp 01-21'),
      Schema.const('gemini-2.0-flash-thinking-exp-1219').description('Gemini 2.0 Flash Thinking Exp 1219'),
      Schema.const('gemini-2.0-pro-exp').description('Gemini 2.0 Pro Experimental'),
      Schema.const('gemini-2.0-pro-exp-02-05').description('Gemini 2.0 Pro Exp 02-05'),
      Schema.const('gemini-2.5-flash').description('Gemini 2.5 Flash'),
      Schema.const('gemini-2.5-flash-lite').description('Gemini 2.5 Flash Lite'),
      Schema.const('gemini-2.5-flash-lite-preview-06-17').description('Gemini 2.5 Flash Lite Preview 06-17'),
      Schema.const('gemini-2.5-flash-preview-05-20').description('Gemini 2.5 Flash Preview 05-20'),
      Schema.const('gemini-2.5-pro').description('Gemini 2.5 Pro'),
      Schema.const('gemini-2.5-pro-preview-03-25').description('Gemini 2.5 Pro Preview 03-25'),
      Schema.const('gemini-2.5-pro-preview-05-06').description('Gemini 2.5 Pro Preview 05-06'),
      Schema.const('gemini-2.5-pro-preview-06-05').description('Gemini 2.5 Pro Preview 06-05'),
      Schema.const('gemini-exp-1206').description('Gemini Experimental 1206')
    ]).description('Gemini 模型设置').default('gemini-2.0-flash-exp'),
      geminiApiKey: Schema.string().description('Gemini API Key').role('secret'),
      
      deepseekApiKey: Schema.string().description('Deepseek API Key (备用)').role('secret').default(''),
      deepseekModel: Schema.string().description('Deepseek 模型').default('deepseek-chat'),
      deepseekBaseUrl: Schema.string().description('Deepseek API 基础URL').default('https://api.deepseek.com/v1'),
      
      apiStrategy: Schema.union([
        Schema.const('gemini-only').description('仅使用 Gemini'),
        Schema.const('deepseek-only').description('仅使用 Deepseek'),
        Schema.const('gemini-first').description('优先 Gemini，失败时切换到 Deepseek'),
        Schema.const('deepseek-first').description('优先 Deepseek，失败时切换到 Gemini'),
      ]).description('API 使用策略').default('gemini-first')
    }).description('🤖 AI基础设置'),

    Schema.object({
      holidayApiClientId: Schema.string().description('节假日API客户端ID').role('secret').default(''),
      holidayApiSecret: Schema.string().description('节假日API密钥').role('secret').default(''),
    }).description('📅 节假日API配置'),

    Schema.object({
      enabledGroups: Schema.array(String).description('启用此功能的群组 ID 列表。'),
      applicationTimeout: Schema.number().default(30).description('档案填写申请的有效时间（分钟）'),
    }).description('📝 档案填写申请设置'),

    Schema.object({
      MonitoredGuildIds: Schema.array( Schema.string() ).description('监听的群聊列表'),
      MaxChatHistoryLength: Schema.number().description( '最大聊天历史记录' ).default( 500 ),
      Rules: Schema.string().description('通用群规设置，默认设置不好，请更改').default(`
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
` ),
    }).description('👁️ 自动化管理基础设置'),

    Schema.object({
      level1Action: Schema.union([
        Schema.const('warn').description('警告'),
        Schema.const('mute').description('禁言'),
        Schema.const('kick').description('踢出'),
        Schema.const('guild_mute').description('频道禁言'),
        Schema.const('none').description('无操作'),
      ]).description('一级违规处罚').default('warn'),

      level2Action: Schema.union([
        Schema.const('warn').description('警告'),
        Schema.const('mute').description('禁言'),
        Schema.const('kick').description('踢出'),
        Schema.const('guild_mute').description('频道禁言'),
        Schema.const('none').description('无操作'),
      ]).description('二级违规处罚').default('mute'),

      level3Action: Schema.union([
        Schema.const('warn').description('警告'),
        Schema.const('mute').description('禁言'),
        Schema.const('kick').description('踢出'),
        Schema.const('guild_mute').description('频道禁言'),
        Schema.const('none').description('无操作'),
      ]).description('三级违规处罚').default('kick'),

      level1MuteMinutes: Schema.number().description('一级禁言时长（分钟）').default(10),
      level2MuteMinutes: Schema.number().description('二级禁言时长（分钟）').default(60),
      level3MuteMinutes: Schema.number().description('三级禁言时长（分钟）').default(180)
    }).description('⚖️ 违规处理设置'),

    Schema.object({
      timedMuteGroups: Schema.array(Schema.object({
        guildId: Schema.string().description('群组ID'),
        workdaySchedules: Schema.object({
          schedule1: Schema.object({
            enabled: Schema.boolean().description('启用第一组定时').default(true),
            muteTime: Schema.string()
              .description('禁言时间 (cron格式: 秒 分 时 日 月 周)')
              .pattern(/^(\*|[0-5]?\d)\s+(\*|[0-5]?\d)\s+(\*|[01]?\d|2[0-3])\s+(\*|[0-2]?\d|3[01])\s+(\*|[0]?\d|1[0-2])\s+(\*|[0-6])$/)
              .default('0 0 22 * * *'),
            unmuteTime: Schema.string()
              .description('解禁时间 (cron格式: 秒 分 时 日 月 周)')
              .pattern(/^(\*|[0-5]?\d)\s+(\*|[0-5]?\d)\s+(\*|[01]?\d|2[0-3])\s+(\*|[0-2]?\d|3[01])\s+(\*|[0]?\d|1[0-2])\s+(\*|[0-6])$/)
              .default('0 0 7 * * *')
          }).description('🌅 第一组时间段'),
          schedule2: Schema.object({
            enabled: Schema.boolean().description('启用第二组定时').default(true),
            muteTime: Schema.string()
              .description('禁言时间 (cron格式: 秒 分 时 日 月 周)')
              .pattern(/^(\*|[0-5]?\d)\s+(\*|[0-5]?\d)\s+(\*|[01]?\d|2[0-3])\s+(\*|[0-2]?\d|3[01])\s+(\*|[0]?\d|1[0-2])\s+(\*|[0-6])$/)
              .default('0 0 12 * * *'),
            unmuteTime: Schema.string()
              .description('解禁时间 (cron格式: 秒 分 时 日 月 周)')
              .pattern(/^(\*|[0-5]?\d)\s+(\*|[0-5]?\d)\s+(\*|[01]?\d|2[0-3])\s+(\*|[0-2]?\d|3[01])\s+(\*|[0]?\d|1[0-2])\s+(\*|[0-6])$/)
              .default('0 0 14 * * *')
          }).description('🌞 第二组时间段')
        }).description('💼 工作日配置'),
        holidaySchedules: Schema.object({
          schedule1: Schema.object({
            enabled: Schema.boolean().description('启用第一组定时').default(true),
            muteTime: Schema.string()
              .description('禁言时间 (cron格式: 秒 分 时 日 月 周)')
              .pattern(/^(\*|[0-5]?\d)\s+(\*|[0-5]?\d)\s+(\*|[01]?\d|2[0-3])\s+(\*|[0-2]?\d|3[01])\s+(\*|[0]?\d|1[0-2])\s+(\*|[0-6])$/)
              .default('0 0 23 * * *'),
            unmuteTime: Schema.string()
              .description('解禁时间 (cron格式: 秒 分 时 日 月 周)')
              .pattern(/^(\*|[0-5]?\d)\s+(\*|[0-5]?\d)\s+(\*|[01]?\d|2[0-3])\s+(\*|[0-2]?\d|3[01])\s+(\*|[0]?\d|1[0-2])\s+(\*|[0-6])$/)
              .default('0 0 9 * * *')
          }).description('🌙 第一组时间段'),
          schedule2: Schema.object({
            enabled: Schema.boolean().description('启用第二组定时').default(false),
            muteTime: Schema.string()
              .description('禁言时间 (cron格式: 秒 分 时 日 月 周)')
              .pattern(/^(\*|[0-5]?\d)\s+(\*|[0-5]?\d)\s+(\*|[01]?\d|2[0-3])\s+(\*|[0-2]?\d|3[01])\s+(\*|[0]?\d|1[0-2])\s+(\*|[0-6])$/)
              .default('0 0 13 * * *'),
            unmuteTime: Schema.string()
              .description('解禁时间 (cron格式: 秒 分 时 日 月 周)')
              .pattern(/^(\*|[0-5]?\d)\s+(\*|[0-5]?\d)\s+(\*|[01]?\d|2[0-3])\s+(\*|[0-2]?\d|3[01])\s+(\*|[0]?\d|1[0-2])\s+(\*|[0-6])$/)
              .default('0 0 15 * * *')
          }).description('☀️ 第二组时间段')
        }).description('🎉 节假日配置')
      })).description('智能定时禁言群组配置').default([])
    }).description('⏰ 智能定时禁言设置'),

    Schema.object({
      electionEnabled: Schema.boolean().description('启用威权民主选举系统').default(true),
      electionCycle: Schema.union([
        Schema.const('weekly').description('每周'),
        Schema.const('biweekly').description('每两周'),
        Schema.const('monthly').description('每月')
      ]).description('选举周期').default('weekly'),
      candidateRegistrationHours: Schema.number().description('候选人报名时长（小时）').default(24),
      votingHours: Schema.number().description('投票时长（小时）').default(48),
      reelectionThreshold: Schema.number().description('连任支持率阈值（百分比）').default(50),
      maxAdministrators: Schema.number().description('最大管理员数量').default(8),
      supportVotesPerPerson: Schema.number().description('每人支持票数').default(2),
      opposeVotesPerPerson: Schema.number().description('每人反对票数').default(2)
    }).description('🗳️ 威权民主选举设置')

  ]);