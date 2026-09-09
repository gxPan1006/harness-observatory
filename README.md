# Harness 观察

一个面向 Agent Harness 工程师的中文前沿观察台。

**在线阅读：[ai-cognit.com/harness/](https://ai-cognit.com/harness/)**

从一手论文、开源实现和工程文章中追踪设计变化。每条内容包含原文事实、工程启发、可验证实验、证据边界和原始链接。日报做跨来源综合，资料按六条设计方向组织，避免只有新闻标题的时间线。

## 阅读方式

- **每日观察**：阅读简报与更新流；可回看历史简报，按来源、类型、时间和已读状态筛选。
- **行业方向**：六个议题的跨来源综合分析；阅读共同机制、路线取舍与可执行验证问题，每条可追溯到来源。
- **资料库**：全文字段搜索，原文日期 / 收录时间 / 重要性排序。
- **我的收藏**：Google 登录后私密同步书签、已读状态、关注和个人笔记；仍支持 JSON 导入导出。
- **来源与更新**：抓取状态、实际更新时间、失败及排队数量、运行历史。

站点公开可读。收藏、阅读状态、关注和笔记需要 Google 登录，按 Google 的稳定账号标识隔离并存储在服务器私有 SQLite 中，可跨设备同步。未登录不返回任何个人数据。旧版浏览器记录不会自动上传：登录后可主动导入，保留本机备份。

## 来源

配置在 [`collector/sources.json`](collector/sources.json)，包括：

- OpenAI：Codex（含 app-server 文档）、Agents SDK、官方文章 RSS。
- Anthropic：Engineering、Claude Agent SDK、Claude Code 版本记录、Skills。
- DeepSeek：官方 `deepseek-ai/deepseek-harness` 仓库及架构文档、与北大合著的时空可组合性论文、V3.2 Agent 训练报告。
- Google：Gemini CLI、ADK。
- LangChain：Deep Agents、LangGraph、官方工程博客。
- Aider、OpenCode、Pi、Hermes、mini-SWE-agent、AutoGen、CrewAI、smolagents。
- OpenHands、SWE-agent、MCP Python SDK，以及 arXiv 的 Harness / 编码 Agent / 上下文工程论文。

GitHub 仓库观察固定到实际 commit，后续观察包含相对上次已收录版本的差异；API 模式过滤预发布；接口限流时回退公开 Atom 订阅，订阅中可能含预发布，须按原文版本标签判断。基础文章按原文日期展示，不伪装成当天发布。论文条目基于公开摘要，未宣称阅读全文或独立复现。官方网页不可用时，可以依据足够长的官方 RSS 简介生成**明确标注证据范围**的短条目。

**机制专项跟踪**：`collector/sources.json` 的 `watches` 独立读取指定源码文件，目前跟踪 Codex 的 TokenBudget、`new_context`、预算查询和压缩分支。每天固定到实际 commit，文件内容未变则不重复提炼；文件缺失或超出证据预算时明确报错，不悄悄截断。此类源码观察不把收录日或仓库 HEAD 日期当成机制发布日期。综合层按机制去重，普通版本更新不会覆盖同仓库的专项观察；仍保留跨组织取样。增加监测范围应同时核对功能开关和旧路径，避免把可选实现写成全面替代。

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

可用环境变量：`DEEPSEEK_API_KEY`、`DEEPSEEK_MODEL`、`DEEPSEEK_BASE_URL`、`MAX_ITEMS_PER_RUN`、`STATE_DIR`、`OUTPUT_DIR`、可选只读 `GITHUB_TOKEN`。已知仓库通常每日约 42 次 GitHub API 请求；接口限流时回退公开 commits / releases Atom 订阅，代码差异直接读取公开 diff。

`--process-only` 可处理已有队列与新增基础资料，不重复访问来源索引。`--process-only --max-items 0 --refresh-digest` 仅重新综合当天已收录资料。

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

## 跨来源综合层

每天采集结束后，按六个方向选择最多 20 条资料：组织轮流取样，同一仓库仅取最新观察，避免某个项目的发布记录淹没其他路线。DeepSeek 根据原文事实、已有工程推断和证据边界生成共同机制、路线取舍和待验证实验。共同机制和取舍的每条判断至少引用两个不同组织，引用 ID 必须存在于输入中。该校验保证引用有效与组织多样性，不等于自动证明语义正确。

综合结果与具体信源分层展示，明确标注为推断。输入指纹未变则复用；失败保留上次成功结果并记录错误。每次最多新增六份综合分析，每份最多 2,600 输出 tokens，校验失败最多修复一次。来源覆盖是样本，不代表行业总体。

## Google 账号服务

`account/server.py` 仅监听 `127.0.0.1:8791`，由 Nginx 代理 `/harness/api/`。Google OAuth 使用授权码、PKCE、state 和 nonce，Google 官方 Python 验证器核验 ID token 的签名、有效期、issuer 与 audience。会话使用随机令牌的 HttpOnly / Secure / SameSite=Lax Cookie，服务端仅保存哈希。写请求校验 Origin、自定义请求头和当前账号；浏览器跨账号切换后，旧标签页写入返回 409。增量更新在 SQLite 事务内合并，避免另一设备的不同字段被整个覆盖。

生产配置位于 `/etc/harness-account.env`（0600），数据库位于 `/var/lib/harness-observatory/accounts/`（0700），均不在站点目录或 Git 中。此部署复用既有 Google 客户端与已登记的 `cloud.ai-cognit.com/auth/google/callback`；Nginx 仅将 `harness_` 开头的 OAuth state 转交本服务，其余回调维持原 Cogni 上游。其他部署应配置自己的 OAuth 客户端与精确回调 URL，并调整代理配置。

配置项：`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`GOOGLE_REDIRECT_URI`、`ACCOUNT_ORIGIN`，可选 `ACCOUNT_DB`、`ACCOUNT_PORT`。服务单元见 `deploy/harness-account.service`；不要把 Google 凭据放到前端环境变量中。授权码、临时登录票据及个人 API 不记录访问日志，响应禁止缓存。备份应覆盖私有 accounts 目录，并在停服时备份或使用 SQLite 在线备份接口。

默认登录会话有效 30 天，退出会立即撤销。保存失败在界面明确提示，可重试或导出未保存记录；本地未提交修改不会跨账号上传。Google 的实际登录需由账号本人完成。

本服务器的 Google 回调 TLS 由 `harness-certificate.timer` 每日检查续期。专用脚本只在续期期间临时允许 root 访问解析出的 ACME 地址，结束后删除例外，以适配此主机既有的出站代理规则；其他主机通常只需正常的 Certbot 续期配置，不应复制这一主机专用规则。
