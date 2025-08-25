import { Context , Session } from 'koishi';
import { OneBotBot } from 'koishi-plugin-adapter-onebot';



export async function SetGroupMute( ctx: Context, session: Session , guildId: string, enable: boolean ): Promise<void> {

  if( session.platform !== 'onebot' ) {
    ctx.logger.warn( '此操作仅支持 OneBot 协议' )
    return
  }
  const NumericGuildId = Number( guildId );
  if ( isNaN( NumericGuildId ) ) {
    ctx.logger.warn( '群号错误' )
    return
  }
  try {
    const bot = session.bot as unknown as OneBotBot<Context>
    await bot.internal.setGroupWholeBan( NumericGuildId, enable )
  } catch ( error ) {
    ctx.logger.error('设置群禁言失败', error)
  }
}