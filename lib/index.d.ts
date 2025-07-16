import { Context } from 'koishi';
import { Config } from './config';
export * from './config';
export declare const name = "gipas";
export declare const inject: {
    required: string[];
};
export declare const GuildMessageHistories: Map<string, {
    user: string;
    content: string;
    timestamp: Date;
}[]>;
export declare function apply(ctx: Context, config: Config): void;
