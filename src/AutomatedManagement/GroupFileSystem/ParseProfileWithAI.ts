// src/AutomatedManagement/GroupFileSystem/ParseProfileWithAI.ts

import { Context } from 'koishi';
import { Config } from '../../config';
import { AIServiceManager } from '../../Utils/AI/AIServiceManager';

// Define a type for the parsed profile data. This is an example;
// the actual structure would depend on what kind of profiles are being parsed.
export interface ParsedProfile {
    realname?: string;
    Term?: string;
    Class?: string;
    SelfDescription?: string;
    isPublic?: boolean;
}

export async function ParseProfileWithAI(
    ctx: Context,
    config: Config,
    profileData: string // The raw profile data to be parsed
): Promise<ParsedProfile | null> {

    const DefaultResult: ParsedProfile = {};

    if (!profileData) {
        ctx.logger('gipas').debug('Profile data is empty, skipping parsing.');
        return DefaultResult;
    }

    try {
        // 使用AIServiceManager进行AI调用
        const aiManager = new AIServiceManager(ctx, config);

        // System prompt to guide the AI in parsing profile data.
        const systemPromptText = 
`你是一个专业的个人资料解析器。你的任务是从提供的文本中提取个人资料信息，并将其格式化为JSON对象。
请提取以下字段：
- realname: 用户的真实姓名 (字符串)
- Term: 用户是第几届学生 (字符串)
- Class: 用户的班级 (字符串)
- SelfDescription: 用户的自我描述 (字符串)
- isPublic: 档案是否公开 (布尔值，'是'/'公开'/'true'/'yes'/'public' 对应 true，'否'/'不公开'/'false'/'no'/'private' 对应 false，默认为true)

如果某个字段在提供的文本中找不到，请将其省略。
请确保输出严格遵循JSON格式，并且只包含JSON对象本身，不包含任何额外的解释性文本。

例如，如果输入是:
"真实姓名：张三
第几届学生：2023
班级：计算机科学1班
自我描述：我是一名软件工程师，喜欢编程和旅行。
是否公开：是"

你应该返回:
{
  "realname": "张三",
  "Term": "2023",
  "Class": "计算机科学1班",
  "SelfDescription": "我是一名软件工程师，喜欢编程和旅行。",
  "isPublic": true
}

如果输入是:
"真实姓名：李四
第几届学生：2022
班级：软件工程2班
自我描述：喜欢阅读和电影。
是否公开：否"

你应该返回:
{
  "realname": "李四",
  "Term": "2022",
  "Class": "软件工程2班",
  "SelfDescription": "喜欢阅读和电影。",
  "isPublic": false
}
`;

        ctx.logger('gipas').info(`正在解析个人资料: "${profileData.substring(0, 50)}..."`);
        
        // 构建AI请求内容
        const contents = [
            { role: 'user' as const, parts: [{ text: systemPromptText }] },
            { role: 'user' as const, parts: [{ text: `请解析以下个人资料：\n${profileData}` }] }
        ];
        
        // 使用AIServiceManager调用AI服务
        const aiResponse = await aiManager.generateContent(contents);
        
        if (!aiResponse.success) {
            ctx.logger('gipas').error(`AI调用失败: ${aiResponse.error}`);
            return DefaultResult;
        }

        const predictionText = aiResponse.text;
        ctx.logger('gipas').info(`AI解析结果 (${aiResponse.provider}): "${predictionText}"`);

        // Attempt to parse the AI's response as JSON
        try {
            // Remove markdown code block wrappers if present
            let jsonString = predictionText;
            const jsonMatch = predictionText.match(/```json\s*([\s\S]*?)\s*```/);
            if (jsonMatch && jsonMatch[1]) {
                jsonString = jsonMatch[1];
            }

            const rawResult = JSON.parse(jsonString);
            
            // 标准化字段名，处理大小写不一致的问题
            const parsedResult: ParsedProfile = {
                realname: rawResult.realname || rawResult.Realname,
                Term: rawResult.Term || rawResult.term,
                Class: rawResult.Class || rawResult.class,
                SelfDescription: rawResult.SelfDescription || rawResult.selfdescription || rawResult.selfDescription,
                isPublic: rawResult.isPublic !== undefined ? rawResult.isPublic : 
                         rawResult.ispublic !== undefined ? rawResult.ispublic :
                         rawResult.IsPublic !== undefined ? rawResult.IsPublic : true
            };
            
            return parsedResult;
        } catch (jsonError) {
            ctx.logger('gipas').error('AI返回的不是有效的JSON格式:', jsonError);
            ctx.logger('gipas').error(`AI原始返回文本: "${predictionText}"`);
            // If JSON parsing fails, return an empty profile or null, depending on desired behavior
            return DefaultResult; 
        }

    } catch (error) {
        ctx.logger('gipas').error('AI个人资料解析时发生错误:', error);
        return DefaultResult;
    }
}
