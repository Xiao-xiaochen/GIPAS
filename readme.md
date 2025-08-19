# koishi-plugin-gipas

[![NPM version](https://img.shields.io/npm/v/koishi-plugin-gipas?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-gipas)
[![koishi](https://img.shields.io/badge/koishi-%5E4.17.2-blue?style=flat-square)](https://koishi.chat/)

**GIPAS (Group Information Processing Automation System)** 是一款为 Koishi 机器人设计的强大插件，旨在实现群组信息的自动化处理和管理。它利用 Google Gemini AI 模型分析聊天内容，并根据预设规则执行相应的操作，同时提供完整的档案管理系统。

## ✨ 功能特性

### 🤖 智能内容分析
- **AI驱动分析**：集成 Google Gemini AI，能够理解文本和图片内容，判断是否违反群规
- **多级违规处理**：支持配置不同违规等级（1-3级）以及对应的处罚措施
- **智能扣分**：AI自动决定违规行为的扣分数量，影响用户档案评分

### 📋 档案管理系统
- **个人档案**：用户可申请创建包含真实姓名、届数、班级、自我描述的个人档案
- **双重评分**：
  - **监督性评分**：反映用户遵守规则的情况，违规时会被扣除
  - **积极性评分**：反映用户的积极参与度，可通过点赞获得
- **隐私控制**：用户可设置档案公开或私密
- **AI智能解析**：使用AI自动解析用户提交的档案信息

### 👍 社交互动功能
- **点赞系统**：用户可以给其他用户点赞，增加积极性评分
- **每日限制**：每天对同一用户只能点赞一次，防止刷分
- **评分查看**：可查看他人的群内评分，促进良性竞争

### ⏰ 定时管理
- **定时禁言**：支持配置两组定时禁言/解禁任务
- **灵活配置**：使用 Cron 表达式，可针对特定群组设置
- **禁言提醒**：可配置禁言前的提醒功能

### 🛠️ 手动管理工具
- **手动禁言**：管理员可手动禁言指定用户
- **设置头衔**：为用户设置群内头衔
- **记录清理**：清理违规记录和用户数据

## 📋 指令列表

### 档案系统指令
- `申请档案` / `档案申请` - 申请填写或更新个人档案
- `我的档案` - 查看自己的完整档案信息
- `查看档案 @用户` / `档案查看 @用户` - 查看指定用户的档案（需公开）
- `他的群评分 @用户` - 查看指定用户的群内评分
- `档案公开` - 将自己的档案设置为公开
- `档案私密` - 将自己的档案设置为不公开
- `赞 @用户` - 给指定用户点赞，增加其积极性评分

### 管理员指令
- `禁言 @用户 [时长]` - 禁言指定用户
- `解禁 @用户` - 解除指定用户的禁言
- `设置头衔 @用户 [头衔]` - 为用户设置群内头衔
- `清理记录 @用户` - 清理指定用户的违规记录

## ⚙️ 配置项

### 基础配置
| 配置项 | 类型 | 描述 | 默认值 |
|--------|------|------|--------|
| `geminiApiKey` | `string` | Google Gemini API Key (必需) | - |
| `geminiModel` | `string` | 使用的 Gemini 模型 ID | `gemini-1.5-flash-latest` |
| `MonitoredGuildIds` | `string[]` | 监控的群组ID列表 | `[]` |
| `enabledGroups` | `string[]` | 启用档案系统的群组ID列表 | `[]` |
| `Rules` | `string` | 群规内容 | 内置默认群规 |

### 违规处理配置
| 配置项 | 类型 | 描述 | 默认值 |
|--------|------|------|--------|
| `level1Action` | `string` | 1级违规处罚动作 | `warn` |
| `level1MuteMinutes` | `number` | 1级违规禁言时长(分钟) | `10` |
| `level2Action` | `string` | 2级违规处罚动作 | `mute` |
| `level2MuteMinutes` | `number` | 2级违规禁言时长(分钟) | `60` |
| `level3Action` | `string` | 3级违规处罚动作 | `kick` |
| `level3MuteMinutes` | `number` | 3级违规禁言时长(分钟) | `1440` |

### 定时禁言配置
| 配置项 | 类型 | 描述 | 默认值 |
|--------|------|------|--------|
| `timedMuteGroups` | `string[]` | 定时禁言的群组ID列表 | `[]` |
| `muteSchedule1` | `string` | 第一组禁言时间(Cron) | `0 22 * * *` |
| `unmuteSchedule1` | `string` | 第一组解禁时间(Cron) | `0 7 * * *` |
| `muteSchedule2` | `string` | 第二组禁言时间(Cron) | `0 12 * * *` |
| `unmuteSchedule2` | `string` | 第二组解禁时间(Cron) | `0 14 * * *` |
| `muteReminderMinutes` | `number` | 禁言前提醒时间(分钟) | `10` |

### 档案系统配置
| 配置项 | 类型 | 描述 | 默认值 |
|--------|------|------|--------|
| `applicationTimeout` | `number` | 档案申请超时时间(分钟) | `30` |

## 🗄️ 数据库表结构

### FileSystem (档案系统)
- `id` - 主键ID
- `userId` - 用户ID
- `groupId` - 群组ID
- `realname` - 真实姓名
- `Term` - 届数
- `Class` - 班级
- `SelfDescription` - 自我描述
- `supervisionRating` - 监督性评分 (默认100分)
- `positivityRating` - 积极性评分 (默认100分)
- `isPublic` - 是否公开

### ViolationRecord (违规记录)
- `id` - 主键ID
- `userId` - 用户ID
- `guildId` - 群组ID
- `timestamp` - 违规时间
- `MessageContent` - 违规消息内容
- `violationLevel` - 违规等级
- `ActionDescription` - 处罚描述
- `actionTaken` - 执行的处罚动作

### UserRecord (用户记录)
- `id` - 主键ID
- `userId` - 用户ID
- `guildId` - 群组ID
- `level1Violations` - 1级违规次数
- `level2Violations` - 2级违规次数
- `level3Violations` - 3级违规次数

## 🚀 使用方法

1. **安装插件**：
   ```bash
   npm install koishi-plugin-gipas
   ```

2. **配置插件**：
   - 填写 `geminiApiKey`
   - 设置 `MonitoredGuildIds` 和 `enabledGroups`
   - 根据需要调整其他配置项

3. **启用功能**：
   - 自动化管理：消息发送到监控群组后自动生效
   - 档案系统：用户使用 `申请档案` 指令开始使用
   - 定时禁言：配置后自动按时执行

## 🔧 依赖服务

- `database` - 用于存储用户档案、违规记录等数据
- `cron` - 用于执行定时任务

## 📈 评分系统

### 监督性评分
- 初始值：100分
- 扣分规则：由AI根据违规严重程度决定
  - 轻微违规：1-10分
  - 中等违规：10-25分
  - 严重违规：25-50分

### 积极性评分
- 初始值：100分
- 扣分规则：违规时少量扣除（1-15分）
- 加分规则：每次被点赞+1分（最高100分）

## 🤝 贡献

欢迎提交 Pull Request 或 Issue 来改进此插件。

开发者：[Xiao-xiaochen](https://github.com/Xiao-xiaochen)

## 📄 开源许可

本项目基于 [MIT License](LICENSE) 开源。

---

## 更新日志

### v2.0.0 (当前版本)
- 🎉 全新架构重构
- 📋 新增完整的档案管理系统
- 👍 新增点赞社交功能
- 🤖 AI智能扣分系统
- ⏰ 优化定时禁言功能
- 🛠️ 完善的手动管理工具

### v1.x.x (已弃用)
- 基础的AI违规检测功能
- 简单的定时禁言功能