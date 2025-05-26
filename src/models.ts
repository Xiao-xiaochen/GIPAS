import { Context } from 'koishi';

export function database(ctx: Context) {

  ctx.model.extend('gipas_violations', {
    id: 'unsigned',
    userId: 'string',
    guildId: 'string',
    channelId: 'string',
    messageId: 'string',
    messageContent: 'text',
    timestamp: 'timestamp',
    violationLevel: 'integer',
    actionTaken: 'string',
    muteDurationMinutes: 'integer',
  }, { autoInc: true, primary: 'id' });

  ctx.model.extend('UserRecord', {
    id: 'unsigned',
    userId: 'string',
    guildId: 'string',
    level1Violations: 'integer',
    level2Violations: 'integer',
    level3Violations: 'integer',
  }, { autoInc: true, primary: 'id' });
}
