import { Context } from 'koishi';
import { Config } from '../config';
import { ViolationAnalysisResult } from '../type';
export declare function ParseAIResponse(predictionText: string, config: Config, ctx: Context): ViolationAnalysisResult;
