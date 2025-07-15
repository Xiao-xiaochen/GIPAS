// src/AutomatedManagement/AnalyzeMessage.ts

import { Context , Session } from 'koishi';
import { GoogleGenAI , Content , Part } from "@google/genai"; 
import { Config } from '../config';
import { ViolationAnalysisResult } from '../type';
import { getSessionImageUrl, downloadImageAsBase64 } from '../Utils/DownloadImage';
import { ParseAIResponse } from '../Utils/ParseAIResponse';

export async function AnalyzeMessage (
    session: Session,
    ctx: Context,
    config: Config,
    rules: string,
    messageHistory: { user: string; content: string; timestamp: Date }[]
): Promise<ViolationAnalysisResult> {

    const imageUrl = getSessionImageUrl(session);
    const textContent = session.content?.replace(/<img.*?\/>/i, "").trim();

    const DefaultResult: ViolationAnalysisResult = {
        is_violation: false,
        level: 1,
        action: 'warn'
    };
    if (!imageUrl && !textContent) {
        ctx.logger('gipas').debug(`消息为空，跳过分析: "${session.content}"`);
        return DefaultResult;
    }

    try {
        let predictionText: string = "false";
        
        const genAI = new GoogleGenAI({ apiKey: config.geminiApiKey });

        const baseSystemPromptText = 
`你是一个群组的聊天管理员。你的任务是根据以下群规，判断我发给你的消息是否违规。
群规:
${rules}
判断指示:
1. 如果消息明确违规，你必须仅回应 "true,违规等级,处罚建议,处罚时长(秒)/kick,原因" 格式 (例如: "true,2,mute,3600,多次发送无关内容")。处罚建议可以是 'warn', 'mute', 'kick', 'none'。
2. 否则，仅回应 "false"。
3. 对常见中性消息（如“哈哈”、“666”、“？”、“好的”、“草”、“我操”）保持宽容，除非上下文构成明确违规。
4. 关注意图和影响。如果含义模糊，倾向于判为 "false"。
5. 考虑我连续发送的多条消息，它们可能共同构成违规。`;

        const historyContents: Content[] = messageHistory.map(msg => ({
            role: "user", 
            parts: [{ text: `${msg.user}: ${msg.content}` }]
        }));

        if (imageUrl) {
            const imageData = await downloadImageAsBase64(imageUrl, ctx);
            if (!imageData) {
                ctx.logger('gipas').warn(`图片下载失败，跳过分析: ${imageUrl}`);
                return DefaultResult;
            }

            const requestContents: Content[] = [
                { role: "user", parts: [{ text: baseSystemPromptText }] },
                ...historyContents,
                {
                    role: "user",
                    parts: [
                        { inlineData: { mimeType: imageData.mimeType, data: imageData.data } },
                        { text: textContent || '无' }
                    ]
                }
            ];
            
            ctx.logger('gipas').info(`图片消息分析: "${session.content}"`);
            const result = await genAI.models.generateContent({ 
                model: config.geminiModel, 
                contents: requestContents 
            }); 
            // **核心修改：直接从 result 对象获取文本**
            predictionText = result.text?.toLowerCase().trim() ?? ''; // <-- 将 result.response.text() 改为 result.text()
            ctx.logger('gipas').info(`图片消息分析预测: "${predictionText}"`);

        } else if (textContent) {
            const requestContents: Content[] = [
                { role: "user", parts: [{ text: baseSystemPromptText }] },
                ...historyContents,
                {
                    role: "user",
                    parts: [{ text: textContent }]
                }
            ];

            ctx.logger('gipas').debug(`正在发送文本到 Gemini (通过 Model 对象): ${textContent}`);
            const streamResponse = await genAI.models.generateContentStream({ 
                model: config.geminiModel, 
                contents: requestContents 
            }); 
            
            let fullResponseText = '';
            for await (const chunk of streamResponse) {
                fullResponseText += chunk.text;
            }
            predictionText = fullResponseText.toLowerCase().trim();
            ctx.logger('gipas').info(`上下文文本分析: "${textContent}", AI原始回复: "${predictionText}"`);
        }

        return ParseAIResponse( predictionText, config, ctx );

    } catch (error) {
        ctx.logger('gipas').error('AI消息分析时发生错误:', error);
        if (error.response && error.response.status) {
            ctx.logger('gipas').error(`Gemini API 错误状态码: ${error.response.status}`);
            ctx.logger('gipas').error(`Gemini API 错误详情: ${JSON.stringify(error.response.data)}`);
        }
        return DefaultResult;
    }
}