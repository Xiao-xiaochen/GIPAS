import { Context, Session } from 'koishi';
import { Config } from '../config';
import { ViolationAnalysisResult } from '../type';
export declare function AnalyzeMessage(session: Session, ctx: Context, config: Config, rules: string, messageHistory: {
    user: string;
    content: string;
    timestamp: Date;
}[]): Promise<ViolationAnalysisResult>;
