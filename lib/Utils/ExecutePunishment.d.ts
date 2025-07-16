import { Context, Session } from 'koishi';
import { ViolationAnalysisResult } from '../type';
export declare function ExecutePunishment(session: Session, ctx: Context, analysisResult: ViolationAnalysisResult): Promise<string>;
