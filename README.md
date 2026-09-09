# Harness 观察

一个面向 Agent Harness 工程师的中文前沿观察台。

**在线阅读：[ai-cognit.com/harness/](https://ai-cognit.com/harness/)**

从一手论文、开源实现和工程文章中追踪设计变化。每条内容包含原文事实、工程启发、可验证实验、证据边界和原始链接。日报做跨来源综合，资料按六条设计方向组织，避免只有新闻标题的时间线。

## 阅读方式

- **每日观察**：阅读简报与更新流；可回看历史简报，按来源、类型、时间和已读状态筛选。
- **设计方向**：上下文与记忆、执行与编排、工具与协议、评测与反馈、运行时与隔离、自改进与适配。
- **资料库**：全文字段搜索，原文日期 / 收录时间 / 重要性排序。
- **我的收藏**：书签、已读状态、个人笔记；JSON 导入导出可跨浏览器迁移。
- **来源与更新**：抓取状态、实际更新时间、失败及排队数量、运行历史。

阅读状态和笔记只保存在当前浏览器，不上传服务器。站点公开可读，没有账号和跨设备自动同步。

## 来源

配置在 [`collector/sources.json`](collector/sources.json)，包括：

- OpenAI：Codex（含 app-server 文档）、Agents SDK、官方文章 RSS。
- Anthropic：Engineering、Claude Agent SDK、Claude Code 版本记录、Skills。
- DeepSeek：官方 `deepseek-ai/deepseek-harness` 仓库及架构文档。
- Google：Gemini CLI、ADK。
- LangChain：Deep Agents、LangGraph、官方工程博客。
- OpenHands、SWE-agent、MCP Python SDK，以及 arXiv 的 Harness / 编码 Agent / 上下文工程论文。

GitHub 仓库观察固定到实际 commit，后续观察包含相对上次已收录版本的差异；预发布 release 不纳入版本流。基础文章按原文日期展示，不伪装成当天发布。论文条目基于公开摘要，未宣称阅读全文或独立复现。官方网页不可用时，可以依据足够长的官方 RSS 简介生成**明确标注证据范围**的短条目。

LLM 提炼可能出错。事实与综合判断分开，性能数据是作者报告；读者应回到来源核验。此站覆盖有限的精选来源，不承诺覆盖所有前沿信息。

## 本地运行

Node.js 22+、Python 3.11+。

```sh
npm ci
npm run dev
```

打开 `http://127.0.0.1:5173/harness/`。首次运行复制仓库内的公开演示数据；实时资料由采集器生成，演示数据时间不会伪装为当前时间。

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env
# 在 .env 中填入自己的 DeepSeek key，勿提交
set -a
. ./.env
set +a
.venv/bin/python collector/update.py
npm run build
```

默认 `deepseek-v4-flash`，每次最多处理 24 条，每条请求限制输出长度，失败采用有限重试。未变化 / 已收录资料不重复调用模型。失败条目指数退避后再次尝试；成功摘要逐条落盘，防止中断后重复付费。

可用环境变量：`DEEPSEEK_API_KEY`、`DEEPSEEK_MODEL`、`DEEPSEEK_BASE_URL`、`MAX_ITEMS_PER_RUN`、`STATE_DIR`、`OUTPUT_DIR`、可选只读 `GITHUB_TOKEN`。默认每日 39–52 次 GitHub API 请求；未登录配额不足时保留已有资料，下一次重试。

`--max-items 0` 只检查来源和发布已有内容，不调用模型。首次回填可显式增加到 `--max-items 60`（上限 100），常规任务继续使用 24。模型请求有次数与 token 上限，但这不是精确的人民币消费上限。

## 部署结构

React + Vite 静态站，由现有 Nginx 的 `/harness/` 路径提供；Python 采集器由 systemd 每天北京时间 08:00 运行（最多随机延迟一分钟）。不需要保持本地电脑或 Codex 运行。

```text
/opt/harness-observatory/                  采集器及 Python 虚拟环境
/etc/harness-observatory.env               root:root 0600，仅服务端密钥
/var/lib/harness-observatory/state/        私有状态、队列、运行日志
/var/lib/harness-observatory/public/       只含生成的公开 feed.json
/var/www/harness-observatory/harness/      Vite 构建产物
  data -> /var/lib/harness-observatory/public
```

[`deploy/nginx-location.conf`](deploy/nginx-location.conf) 必须 include 在现有域名的 `server` 块内；不替换首页和其他服务。静态目录中没有 `.env`、私钥、原始抓取文档、采集器或写接口。JSON 原子替换，抓取或模型错误不会抹掉已有资料。Nginx 返回 no-cache，并限制 CSP。

部署时创建无登录权限的专用 `harness` 用户，将源代码安装到 `/opt/harness-observatory`，将环境文件设为 root 0600，复制两个 update unit 至 `/etc/systemd/system/`，然后：

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now harness-update.timer
sudo systemctl start harness-update.service
sudo journalctl -u harness-update.service -n 60 --no-pager
sudo systemctl list-timers harness-update.timer
```

服务以独立用户运行，文件系统只允许写 `/var/lib/harness-observatory`，有限制内存、CPU、超时、禁止提权。服务退出码 1 表示存在部分失败，公开站点仍保留上次和本次成功内容。来源页面显示部分失败；没有配置邮件/消息通知。

**现有透明代理的特殊部署**：[`harness-egress.service`](deploy/harness-egress.service) 仅供当前服务器使用，给 `harness` 用户的 80/443 出站请求单独直连，解决原透明代理 TLS 握手失败。不改其他用户/服务的代理规则，不新增入站端口。普通服务器不安装此 unit，也不需要它。停用该 unit 会删除它添加的精确规则。

更新网站：重新构建后复制 `dist/`，保留线上 `data` 符号链接；更改采集器后复制 `collector/`。发布前备份现有 Nginx 配置并运行 `nginx -t`。备份 `/var/lib/harness-observatory/state/` 可保留完整历史与去重状态。

## 验证

```sh
.venv/bin/python -m unittest discover -s tests -v
npm run build
```

回归测试覆盖：模型不能覆盖来源与日期、无效摘要拒绝、格式修复、虚构日报引用拒绝、RSS 降级标识、URL 去重、原子发布、失败保留历史、已收录内容不重复调用 LLM。

## 许可

源代码使用 MIT。链接文章、论文、代码仓库的版权与许可归各自作者；本站仅提供简短提炼和原始链接。
