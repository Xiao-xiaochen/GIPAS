import { Context } from 'koishi';
import { UserRecord, ViolationRecord } from './type';
declare module 'koishi' {
    interface Tables {
        ViolationRecord: ViolationRecord;
        UserRecord: UserRecord;
    }
}
export declare function Database(ctx: Context): void;
