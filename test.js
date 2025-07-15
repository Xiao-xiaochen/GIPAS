// 确保已安装 npm install @google/genai
// 替换为你的实际 API Key 和模型
const { GoogleGenAI } = require("@google/genai");

const API_KEY = "AIzaSyDvRKJ50XWEpk9uqbulCTY8N5DD2FK1gJw"; // 替换为你的 Gemini API Key
const MODEL_NAME = "gemini-2.5-flash";      // 替换为你的模型名称

async function testGeminiChat() {
  try {
    const genAI = new GoogleGenAI({ apiKey: API_KEY });
    const chat = await genAI.chats.create({
      model: MODEL_NAME,
      history: [{ role: "user", parts: [{ text: "Hello, AI!" }] }],
    });

    console.log("Chat session created successfully!");

    // 尝试发送纯文本字符串
    console.log("Attempting to send plain text string...");
    const textResponse = await chat.sendMessageStream("测试"); // 你的原始尝试
    let fullText = '';
    for await (const chunk of textResponse) {
      fullText += chunk.text;
    }
    console.log("Response for plain text string:", fullText);

    // 尝试发送 Part 数组
    console.log("Attempting to send Part array...");
    const partResponse = await chat.sendMessageStream([{ text: "另一个测试" }]); // 你最近的尝试
    let fullParts = '';
    for await (const chunk of partResponse) {
      fullParts += chunk.text;
    }
    console.log("Response for Part array:", fullParts);

  } catch (error) {
    console.error("Gemini API test failed:", error);
  }
}

testGeminiChat();