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
