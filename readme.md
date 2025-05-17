# koishi-plugin-gipas

[![NPM version](https://img.shields.io/npm/v/koishi-plugin-gipas?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-gipas)
[![koishi](https://img.shields.io/badge/koishi-%5E4.17.2-blue?style=flat-square)](https://koishi.chat/)

**GIPAS (Group Information Processing Automation System)** 是一款为 Koishi 机器人设计的强大插件，旨在实现群组信息的自动化处理和管理。它利用 Google Gemini AI 模型分析聊天内容，并根据预设规则执行相应的操作，如警告、禁言或踢出用户。

## ✨ 功能特性

- **智能内容分析**：集成 Google Gemini AI，能够理解文本和图片内容，判断是否违反群规。
- **多级违规处理**：支持配置不同违规等级（轻微、中等、严重）以及对应的处罚措施（无操作、警告、禁言、踢出）。
- **灵活的禁言时长**：可以为不同违规等级设置不同的禁言时长。
- **定时全体禁言/解禁**：支持通过 Cron 表达式配置工作日和周末的定时全体禁言和解禁。
- **特定频道激活**：可以通过指令在特定频道激活插件功能，实现更精细化的管理。
- **违规记录存储**：自动记录用户的违规行为到数据库，便于追溯和管理（未来功能：历史记录追溯）。
- **自定义群规**：内置一套群规，并支持通过修改代码中的 `RULES` 常量进行自定义。
- **API 调用**：通过 `invoke` 方法调用平台特定的 `set_group_whole_ban`（全体禁言）和 `set_group_ban`（单人禁言）API。

## 依赖服务

- `database`：用于存储违规记录等数据。
- `cron`：用于执行定时任务，如定时禁言/解禁。

## ⚙️ 配置项

插件提供了丰富的配置选项，以便用户根据实际需求进行调整：

| 配置项                  | 类型                         | 描述                                       | 默认值                       |
| ----------------------- | ---------------------------- | ------------------------------------------ | ---------------------------- |
| `activeChannelId`       | `string`                     | 激活插件功能的频道ID                       | `''`                         |
| `geminiApiKey`          | `string`                     | Google Gemini API Key (必需)                | -                            |
| `geminiModel`           | `string`                     | 使用的 Gemini 模型 ID                      | `gemini-1.5-flash-latest`    |
| `muteCron`              | `string`                     | 工作日全体禁言的 Cron 表达式               | `0 18 * * 1-5`               |
| `unmuteCron`            | `string`                     | 工作日全体解禁的 Cron 表达式               | `0 0 * * 1-5`                |
| `weekendMuteCron`       | `string`                     | 周末全体禁言的 Cron 表达式                 | `0 8 * * 0,6`                |
| `weekendUnmuteCron`     | `string`                     | 周末全体解禁的 Cron 表达式                 | `0 0 * * 0,6`                |
| `level1Action`          | `'none' \| 'warn' \| 'mute'` | 1级违规处罚动作                            | `warn`                       |
| `level1MuteMinutes`     | `number`                     | 1级违规禁言时长 (分钟)                     | `10`                         |
| `level2Action`          | `'warn' \| 'mute' \| 'kick'` | 2级违规处罚动作                            | `mute`                       |
| `level2MuteMinutes`     | `number`                     | 2级违规禁言时长 (分钟)                     | `60`                         |
| `level3Action`          | `'mute' \| 'kick'`         | 3级违规处罚动作                            | `kick`                       |
| `level3MuteMinutes`     | `number`                     | 3级违规禁言时长 (分钟)                     | `1440`                       |
| `maxViolationHistoryDays` | `number`                     | 历史记录追溯天数 (未来功能)                | `30`                         |
| `kickThreshold`         | `number`                     | 自动踢出阈值 (基于历史违规次数，未来功能) | `3`                          |

## 🚀 使用方法

1.  **安装插件**：
    ```bash
    npm install koishi-plugin-gipas
    # yarn add koishi-plugin-gipas
    # pnpm add koishi-plugin-gipas
    ```
2.  **在 Koishi 配置文件中启用插件**，并填写必要的配置项，特别是 `geminiApiKey`。
3.  **激活插件**：在希望启用 GIPAS 功能的群组频道中，发送指令 `gipas.activate`。

## 📝 主要逻辑

-   **初始化 (`apply` 函数)**：
    -   加载插件，扩展数据库表 (`gipas_violations`)。
    -   如果配置了 `activeChannelId` 和 `geminiApiKey`，则初始化 Gemini 聊天会话 (`gipasChat`)。
    -   注册 `gipas.activate` 指令，用于在特定频道激活插件并初始化/重新初始化聊天会话。
    -   根据配置的 Cron 表达式，设置定时全体禁言/解禁任务。
-   **消息处理 (`ctx.on('message', ...)` 事件)**：
    -   仅处理来自已激活频道且非机器人自身发送的消息。
    -   如果消息包含图片，会尝试下载图片并将其与文本内容（如果有）一起交由 `analyzeChatMessage` 函数处理。
    -   如果消息仅为文本，且 `gipasChat` 已初始化，则将文本交由 `analyzeChatMessage` 函数处理。
    -   `analyzeChatMessage` 函数会调用 Gemini AI 判断消息是否违规以及违规等级。
    -   如果判断为违规：
        -   记录违规信息到数据库。
        -   根据配置的违规等级和处罚措施，执行相应操作（删除消息、发送警告、禁言用户、踢出用户）。
        -   禁言操作会调用 `set_group_ban` API。
-   **全体禁言/解禁 (`setGuildMute` 函数)**：
    -   由 Cron 任务触发。
    -   调用 `set_group_whole_ban` API 执行服务器范围的全体禁言或解禁。

## 🤝 贡献

欢迎提交 Pull Request 或 Issue 来改进此插件。

开发者：[Xiao-xiaochen](https://github.com/Xiao-xiaochen)

## 📄 开源许可

本项目基于 [MIT License](LICENSE) 开源。
