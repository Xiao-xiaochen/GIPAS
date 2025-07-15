import { Context } from 'koishi';
import { UserRecord, ViolationRecord } from './type';



declare module 'koishi' {
  interface Tables {
    ViolationRecord: ViolationRecord;
    UserRecord: UserRecord;
  }
}

export function Database(ctx: Context) {
  ctx.model.extend('ViolationRecord', {
    userId: { type: 'string', length: 255 },
    guildId: { type: 'string', length: 255 },
    timestamp: { type: 'timestamp' },
    MessageContent: { type: 'text'},
    violationLevel: { type: 'unsigned'},
    ActionDescription: { type: 'text'},
    actionTaken: { type: 'string', length: 255 },
  }, { 
    primary: 'userId' 
  });

  ctx.model.extend('UserRecord', {
    userId: { type: 'string', length: 255 },
    guildId: { type: 'string', length: 255 },
    level1Violations: { type: 'unsigned', initial: 0 },
    level2Violations: { type: 'unsigned', initial: 0 },
    level3Violations: { type: 'unsigned', initial: 0 },
  }, { 
    primary: 'userId' 
  });
}
