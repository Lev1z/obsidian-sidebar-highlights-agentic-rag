# Sidebar Highlights · Agentic RAG

在 Obsidian 侧边栏中统一管理高亮、批注、集合与任务，并通过可选的 Agentic RAG 助手，结合本地 Markdown 笔记解释高亮内容。

Manage highlights, comments, collections, and tasks from one Obsidian sidebar. The optional Agentic RAG assistant can explain highlighted text with context retrieved from your local Markdown notes.

<p align="center">
  <img src="https://github.com/user-attachments/assets/eebaa062-adee-4bda-b3ce-bdc0a536ecaf" alt="Sidebar Highlights preview">
</p>

> 本仓库在 Sidebar Highlights 的高亮管理能力上加入了 Agentic RAG 工作流，适合学习和实验本地知识库检索、工具调用与 Obsidian 插件开发。
>
> This repository extends Sidebar Highlights with an Agentic RAG workflow for experimenting with local knowledge retrieval, tool calling, and Obsidian plugin development.

## 功能概览 / Highlights

### 高亮与批注 / Highlights and comments

- 使用 Obsidian 原生 `==highlight==` 语法创建和管理高亮
- 支持标准脚注、行内脚注和 `%% native comments %%`
- 同一条高亮可关联多种批注，并可从侧边栏跳回原文
- 支持自定义高亮颜色、标签、排序和筛选

### 集合与视图 / Collections and views

- 跨文件组织高亮集合
- Current Note、All Notes、Collections 和可选 Tasks 标签页
- 按颜色、标签、集合、文件名、文件夹或日期分组
- 保存 Display Mode，并从命令面板快速恢复视图配置

### 任务面板 / Tasks dashboard

- 扫描整个仓库中的 `- [ ]` 与 `- [x]` 任务
- 支持任务完成状态、优先标记、到期日和上下文预览
- 提供 Today、Tomorrow、星期、月份和年份等日期分组
- 支持自然语言日期建议，例如 `tomorrow`、`next Monday` 和相对天数

### 高级搜索 / Advanced search

- 文本搜索，以及 `#tag` 和 `@collection` 过滤
- `AND`、`OR` 和括号组合
- 使用 `-#tag`、`-@collection` 排除结果
- 实时查询解析预览和 Unicode 内容支持

示例 / Examples:

```text
home
#important
@work
#urgent AND @project
(#critical OR #high) AND security
home #important -@completed
```

## Agentic RAG 助手 / Agentic RAG assistant

在高亮的批注窗口切换到 **Ask AI**，即可针对当前高亮提问。助手会在最多 6 个步骤内决定是否调用本地工具，然后生成 Short 或 Medium 长度的回答。

Switch to **Ask AI** in a highlight's comment dialog to ask about the selected text. The assistant can perform up to six tool-calling steps before producing a Short or Medium response.

工作流 / Workflow:

```text
高亮文本 + 用户问题
        ↓
分析并生成检索词
        ↓
search_notes → 本地关键词评分与片段检索
        ↓
get_note_content → 按需读取相关笔记
        ↓
回答 + 3 个前置知识点
```

核心能力 / Core capabilities:

- 本地优先：检索和相关性评分在 Obsidian 仓库内完成
- 两个工具：`search_notes` 检索片段，`get_note_content` 读取指定笔记
- 可观察执行过程：界面展示 Thought、Action、Observation 状态与历史记录
- Short / Medium 两种回答长度，并生成可继续追问的前置知识点
- 未配置 API 或调用失败时，返回确定性的本地检索兜底结果

技术实现 / Implementation:

- TypeScript + Obsidian API
- LangChain.js `PromptTemplate`
- OpenAI-compatible `/chat/completions` endpoint
- Lightweight JSON tool-calling loop, up to 6 iterations
- Local keyword scoring and context extraction; no vector database required

## 安装 / Installation

该分支尚未发布到 Obsidian Community Plugins，可使用以下方式安装。

### 从源码构建 / Build from source

要求 / Requirements: Node.js 18+、npm、Obsidian 1.8.10+。

```bash
git clone https://github.com/Lev1z/obsidian-sidebar-highlights-agentic-rag.git
cd obsidian-sidebar-highlights-agentic-rag
npm install
npm run build
```

然后将以下文件复制到你的仓库目录：

```text
<vault>/.obsidian/plugins/sidebar-highlights/
├── main.js
├── manifest.json
└── styles.css
```

重启 Obsidian，进入 **Settings → Community plugins**，启用 **Sidebar Highlights**。

For development, clone this repository directly into your vault's `.obsidian/plugins/` directory and run `npm run dev` for watch mode.

## 快速开始 / Quick start

### 1. 创建高亮 / Create a highlight

- 在 Markdown 笔记中选择文本，右键选择 **Create highlight**；或
- 打开命令面板，运行 **Create highlight from selection**；或
- 直接输入 `==your highlighted text==`。

### 2. 添加批注 / Add a comment

标准脚注 / Standard footnote:

```markdown
==Important concept==[^1]

[^1]: A detailed explanation
```

行内脚注 / Inline footnote:

```markdown
==Key insight==^[A quick note]
```

原生注释 / Native comment:

```markdown
%% Remember to revisit this section %%
```

### 3. 使用侧边栏 / Use the sidebar

点击左侧 Ribbon 中的高亮图标，或从命令面板运行 **Toggle**。侧边栏中的高亮、批注和任务均可点击跳转到对应 Markdown 位置。

Tasks 标签默认隐藏。如需启用，请前往 **Settings → Sidebar Highlights → Views → Show Tasks tab**。

## AI 配置 / AI setup

打开 **Settings → Sidebar Highlights**，填写：

- **API Key**：OpenAI 兼容服务的密钥
- **Model**：模型名称，默认 `gpt-4o-mini`
- **Base URL**：接口根地址，默认 `https://api.openai.com/v1`

点击 **Test AI Connection → Run Test** 验证配置。Base URL 后会自动拼接 `/chat/completions`，因此请填写 API 根地址，不要填写完整的请求路径。

配置完成后，在任意高亮的批注对话框中打开 **Ask AI**，输入问题并选择 Short 或 Medium。

## 命令 / Commands

- **Create highlight from selection**：将选中文本转换为高亮
- **Toggle**：打开或关闭侧边栏
- **Go to &lt;collection&gt;**：跳转到指定集合
- **Apply display mode: &lt;name&gt;**：应用已保存的显示模式

可以在 **Settings → Hotkeys** 中为命令绑定快捷键。

## 隐私说明 / Privacy

- 普通的高亮、批注、集合、任务和搜索功能均在本地运行。
- 使用 Ask AI 时，当前高亮、用户问题、工具执行记录，以及检索到的笔记片段或按需读取的笔记内容会发送到你配置的模型服务。
- AI 检索和全文读取遵守 **Settings → Filters** 中已有的 Include/Exclude 规则；被排除的路径不会进入模型上下文。
- 插件默认不会上传整个仓库；本地检索当前最多扫描 200 个 Markdown 文件，再选择相关内容参与回答。
- API Key 保存在 Obsidian 插件设置数据中，请自行确保设备和仓库配置目录安全。

Before enabling AI features, review the privacy policy and data-retention terms of your chosen API provider.

## 开发 / Development

```bash
npm install
npm run dev      # watch mode
npm run build    # type-check + production bundle
npm test         # Jest test suite
npm run test:coverage   # coverage report + critical-file gates
npm run eval:retrieval  # deterministic local retrieval benchmark
```

### 质量基线 / Quality baseline

- CI 在每次推送到 `main` 和每个 Pull Request 上执行生产构建、全部测试及关键文件覆盖率门禁。
- `npm run eval:retrieval` 使用固定 Markdown 知识库和标注查询计算 Hit Rate@3、Recall@3 与 MRR。
- 评测完全离线运行，不需要 API Key，也不会产生模型调用费用。
- 修改检索算法时应同步扩充评测集，并保持或提高已提交的基线指标。

主要文件 / Key files:

```text
main.ts                         Plugin entry, settings, and commands
src/services/AIService.ts       Retrieval and agentic tool-calling workflow
src/views/sidebar-view.ts       Sidebar and Ask AI interface
src/managers/task-manager.ts    Vault-wide task management
src/utils/search-parser.ts      Advanced search parser
styles.css                      Plugin styles
```

## 已知限制 / Known limitations

- 仅支持 Markdown 笔记，不支持 PDF 高亮。
- Tasks 标签默认关闭，需要在设置中手动启用。
- 本地检索使用关键词相关性评分，不包含向量数据库或 embedding 索引。
- AI 服务必须兼容 OpenAI Chat Completions 请求格式。

## 致谢 / Credits

本项目基于 [trevware/obsidian-sidebar-highlights](https://github.com/trevware/obsidian-sidebar-highlights) 扩展，感谢原作者和贡献者提供完整的高亮、批注、集合及任务管理基础。

This project extends [trevware/obsidian-sidebar-highlights](https://github.com/trevware/obsidian-sidebar-highlights). Thanks to the original author and contributors.

## License

本仓库遵循 [GNU General Public License v3.0](LICENSE)。
