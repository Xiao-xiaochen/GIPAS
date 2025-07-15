import { Schema } from 'koishi';

export interface Config {
  geminiModel: string;
  geminiApiKey: string;

  MonitoredGuildIds: string[],
  MaxChatHistoryLength: number;
  Rules: string

  level1Action: 'warn' | 'mute' | 'kick' | 'guild_mute' | 'none' ;
  level2Action: 'warn' | 'mute' | 'kick' | 'guild_mute' | 'none' ;
  level3Action: 'warn' | 'mute' | 'kick' | 'guild_mute' | 'none' ;
  level1MuteMinutes: number;
  level2MuteMinutes: number;
  level3MuteMinutes: number;
}
  
export const Config:Schema<Config>=Schema.intersect([

  Schema.object({
    geminiModel: Schema.string().description('模型设置'),
    geminiApiKey: Schema.string().description('API Key')
  }).description('AI基础设置'),

  Schema.object({
    MonitoredGuildIds: Schema.array( Schema.string() ).description('监听的群聊列表'),
    MaxChatHistoryLength: Schema.number().description( '最大聊天历史记录' ).default( 500 ),
    Rules: Schema.string().description('通用群规设置').default(`
一、基本原则
尊重原则
尊重他人隐私、信仰、性别、种族及政治立场
禁止任何形式的人身攻击、歧视性言论或恶意嘲讽
合法合规
严格遵守中国法律法规及平台规定
禁止传播违法违规内容（详见行为规范）
价值导向
鼓励知识分享、理性讨论和互助交流
禁止破坏社群氛围的低质量内容
二、行为规范（违规等级制度）
一级违规（警告）
刷屏/灌水：连续发送5条以上无意义内容
轻微广告：非商业的个人资源分享（每周≤1次）
低质量内容：纯表情包/无意义符号占消息量50%以上
轻微引战：使用挑衅性语言但未针对个人
二级违规（禁言1-24小时）
商业广告：未经许可的推广/二维码/引流
人身攻击：使用侮辱性词汇但未构成严重伤害
敏感话题：涉及政治/民族/宗教的争议性讨论
虚假信息：传播未经证实的谣言造成轻微影响
三级违规（踢出群聊+拉黑）
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
` ),
  }).description('自动化管理基础设置'),

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

    level1MuteMinutes:Schema.number().description('一级禁言时长（分钟）').default( 10 ),
    level2MuteMinutes:Schema.number().description('二级禁言时长（分钟）').default( 60 ),
    level3MuteMinutes:Schema.number().description('三级禁言时长（分钟）').default( 180 )
  }).description('违规处理设置'),

])
