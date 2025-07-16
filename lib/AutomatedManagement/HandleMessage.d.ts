import { Context, Session } from 'koishi';
import { Config } from '../config';
export declare function HandleMessage(ctx: Context, session: Session, config: Config, rules: string, messageHistory: {
    user: string;
    content: string;
    timestamp: Date;
}[]): Promise<void>;
