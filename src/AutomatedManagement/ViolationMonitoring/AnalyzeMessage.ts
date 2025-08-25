// src/AutomatedManagement/AnalyzeMessage.ts

import { Context , Session } from 'koishi';
import { Content } from "@google/genai"; 
import { Config } from '../../config';
import { ViolationAnalysisResult } from '../../type';
import { getSessionImageUrl, downloadImageAsBase64 } from '../../Utils/DownloadImage';
import { ParseAIResponse } from '../../Utils/ParseAIResponse';
import { AIServiceManager } from '../../Utils/AIServiceManager';

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
        
        const aiService = new AIServiceManager(ctx, config);

        const baseSystemPromptText = 
`你是一个群组的聊天管理员。你的任务是根据以下群规，判断**当前用户**发送的消息是否违规。

**重要原则：**
1. **独立判断原则**：每个用户的消息必须独立判断，不能因为其他用户的违规消息而连坐处罚
2. **疑罪从无原则**：如果消息含义模糊或存在争议，倾向于判为不违规
3. **用户区分原则**：严格区分不同用户ID，只判断当前发送消息的用户是否违规
4. **上下文参考原则**：历史消息仅作为理解当前消息语境的参考，不能作为处罚依据

群规:
${rules}

**判断流程：**
1. 首先识别当前需要判断的用户ID和消息内容
2. 分析该用户的消息是否直接违反群规
3. 如果该用户的消息本身没有违规内容，即使回复了违规消息也不应被处罚
4. 只有当该用户主动发送违规内容时才进行处罚

**回复格式：**
- 如果当前用户消息违规：回应 "true,违规等级,处罚建议,处罚时长(秒)/kick,原因,监督性扣分,积极性扣分"
- 如果当前用户消息不违规：仅回应 "false"

**处罚参数说明：**
- 处罚建议：'warn', 'mute', 'kick', 'none'
- 监督性扣分：轻微违规1-10分，中等违规10-25分，严重违规25-50分
- 积极性扣分：轻微违规1-3分，中等违规3-8分，严重违规8-15分

**常见误判避免：**
- "哈哈"、"666"、"？"、"好的"、"草"、"我操"等中性表达不应被判违规
- 正常的回复、询问、日常交流不应被判违规
- 即使回复违规消息，如果回复内容本身正常则不违规`;

        // 构建清晰的消息历史，明确标识每个用户和时间戳
        const historyContents: Content[] = messageHistory.map(msg => ({
            role: "user", 
            parts: [{ text: `[${msg.timestamp.toLocaleTimeString('zh-CN')}] [用户ID: ${msg.user}] ${msg.content}` }]
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
                        { text: `**当前需要判断的用户ID: ${session.userId}**\n消息内容: ${textContent || '无'}` }
                    ]
                }
            ];
            
            ctx.logger('gipas').info(`图片消息分析: "${session.content}"`);
            const result = await aiService.generateContent(requestContents);
            
            if (!result.success) {
                ctx.logger('gipas').error(`AI分析失败 (${result.provider}): ${result.error}`);
                return DefaultResult;
            }
            
            predictionText = result.text;
            ctx.logger('gipas').info(`图片消息分析预测 (${result.provider}): "${predictionText}"`);

        } else if (textContent) {
            const requestContents: Content[] = [
                { role: "user", parts: [{ text: baseSystemPromptText }] },
                ...historyContents,
                {
                    role: "user",
                    parts: [{ text: `**当前需要判断的用户ID: ${session.userId}**\n消息内容: ${textContent}` }]
                }
            ];

            ctx.logger('gipas').debug(`正在发送文本到 AI 服务: ${textContent}`);
            const result = await aiService.generateContent(requestContents, true);
            
            if (!result.success) {
                ctx.logger('gipas').error(`AI分析失败 (${result.provider}): ${result.error}`);
                return DefaultResult;
            }
            
            predictionText = result.text;
            ctx.logger('gipas').info(`上下文文本分析 (${result.provider}): "${textContent}", AI原始回复: "${predictionText}"`);
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