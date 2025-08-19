// src/AutomatedManagement/GroupFileSystem/ParseProfileWithAI.ts

import { Context } from 'koishi';
import { GoogleGenAI, Content, Part } from "@google/genai";
import { Config } from '../../config';

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
        const genAI = new GoogleGenAI({ apiKey: config.geminiApiKey });

        // System prompt to guide the AI in parsing profile data.
        // It instructs the AI to extract specific fields and return them in JSON format.
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
自我描述：我是一名软件工程师，喜欢编程和旅行。"

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
自我描述：喜欢阅读和电影。
是否公开：否"

你应该返回:
{
  "realname": "李四",
  "SelfDescription": "喜欢阅读和电影。",
  "isPublic": false
}
`;

        const requestContents: Content[] = [
            { role: "user", parts: [{ text: systemPromptText }] },
            { role: "user", parts: [{ text: profileData }] }
        ];

        ctx.logger('gipas').info(`正在使用 Gemini 解析个人资料: "${profileData.substring(0, 50)}..."`);
        
        const result = await genAI.models.generateContent({ 
            model: config.geminiModel, 
            contents: requestContents 
        }); 

        const predictionText = result.text?.trim() ?? '';
        ctx.logger('gipas').info(`Gemini 解析结果: "${predictionText}"`);

        // Attempt to parse the AI's response as JSON
        try {
            // Remove markdown code block wrappers if present
            let jsonString = predictionText;
            const jsonMatch = predictionText.match(/```json\s*([\s\S]*?)\s*```/);
            if (jsonMatch && jsonMatch[1]) {
                jsonString = jsonMatch[1];
            }

            const parsedResult: ParsedProfile = JSON.parse(jsonString);
            return parsedResult;
        } catch (jsonError) {
            ctx.logger('gipas').error('AI返回的不是有效的JSON格式:', jsonError);
            ctx.logger('gipas').error(`AI原始返回文本: "${predictionText}"`);
            // If JSON parsing fails, return an empty profile or null, depending on desired behavior
            return DefaultResult; 
        }

    } catch (error) {
        ctx.logger('gipas').error('AI个人资料解析时发生错误:', error);
        if (error.response && error.response.status) {
            ctx.logger('gipas').error(`Gemini API 错误状态码: ${error.response.status}`);
            ctx.logger('gipas').error(`Gemini API 错误详情: ${JSON.stringify(error.response.data)}`);
        }
        return DefaultResult;
    }
}
