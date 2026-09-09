import React, { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  Circle,
  Code2,
  Compass,
  ExternalLink,
  FileText,
  FlaskConical,
  Github,
  Layers3,
  Menu,
  Radio,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import "./style.css";

type Item = {
  id: string;
  url: string;
  title: string;
  titleZh: string;
  org: string;
  kind: string;
  published: string | null;
  addedAt: string;
  summary: string;
  facts: string[];
  insight: string;
  experiment: string;
  caveat: string;
  themes: string[];
  significance: string;
  evidence: { label: string; url: string }[];
  model: string;
  revision?: string;
  abstractOnly?: boolean;
  excerptOnly?: boolean;
  repo?: string;
};
type Theme = {
  id: string;
  name: string;
  question: string;
  description: string;
};
type Digest = {
  date: string;
  headline: string;
  synthesis: string;
  watch: string[];
  items: string[];
};
type Source = {
  id: string;
  name: string;
  org: string;
  url: string;
  ok: boolean;
  checkedAt: string;
  lastSuccessAt?: string;
  discovered?: number;
  type: string;
};
type Run = {
  finishedAt: string;
  newItems: number;
  errors: number;
  attempted: number;
  pending: number;
};
type Feed = {
  updatedAt: string;
  items: Item[];
  themes: Theme[];
  digests: Digest[];
  sources: Source[];
  schedule: string;
  lastRun: Run;
  runs: Run[];
};
type Personal = {
  read: string[];
  saved: string[];
  following: string[];
  notes: Record<string, string>;
  lastVisit: string;
};
const STORE = "harness-observatory-v1";
const EMPTY: Personal = {
  read: [],
  saved: [],
  following: [],
  notes: {},
  lastVisit: "",
};
const KIND: Record<string, string> = {
  article: "工程文章",
  paper: "论文",
  code: "代码观察",
  release: "版本更新",
};
const INITIAL = (() => {
  try {
    const d = JSON.parse(localStorage.getItem(STORE) || "{}");
    if (
      !["read", "saved", "following"].every(
        (k) =>
          d[k] === undefined ||
          (Array.isArray(d[k]) &&
            d[k].every((x: unknown) => typeof x === "string")),
      ) ||
      (d.notes !== undefined &&
        (d.notes === null ||
          typeof d.notes !== "object" ||
          Array.isArray(d.notes) ||
          !Object.values(d.notes).every((v) => typeof v === "string")))
    )
      return EMPTY;
    return { ...EMPTY, ...d } as Personal;
  } catch {
    return EMPTY;
  }
})();
const INITIAL_VISIT = INITIAL.lastVisit;
const fmt = (d: string | null, full = false) =>
  d
    ? new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        ...(full ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
        timeZone: "Asia/Shanghai",
      }).format(new Date(d))
    : "日期未标注";
function safeUrl(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : "#";
  } catch {
    return "#";
  }
}
function IconKind({ kind }: { kind: string }) {
  return kind === "paper" ? (
    <FlaskConical size={14} />
  ) : kind === "code" || kind === "release" ? (
    <Code2 size={14} />
  ) : (
    <FileText size={14} />
  );
}
export default function App() {
  const [feed, setFeed] = useState<Feed | null>(null),
    [error, setError] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const refresh = () => setRetry((r) => r + 1);
    window.addEventListener("focus", refresh);
    const t = setInterval(refresh, 30 * 60 * 1000);
    return () => {
      window.removeEventListener("focus", refresh);
      clearInterval(t);
    };
  }, []);
  const [route, setRoute] = useState(location.hash.slice(1) || "today");
  const [personal, setPersonal] = useState<Personal>(INITIAL),
    [storageError, setStorageError] = useState(false);
  const [query, setQuery] = useState(""),
    [org, setOrg] = useState("all"),
    [kind, setKind] = useState("all"),
    [readFilter, setReadFilter] = useState("all"),
    [dateFilter, setDateFilter] = useState("all"),
    [sort, setSort] = useState("published");
  const [digestDate, setDigestDate] = useState("");
  const [mobile, setMobile] = useState(false),
    [toast, setToast] = useState(""),
    [limit, setLimit] = useState(20);
  const importRef = useRef<HTMLInputElement>(null),
    searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onHash = () => {
      setRoute(location.hash.slice(1) || "today");
      setMobile(false);
      setLimit(20);
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    setError(false);
    const c = new AbortController();
    fetch(import.meta.env.BASE_URL + "data/feed.json", {
      cache: "no-cache",
      signal: c.signal,
    })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((d) => {
        if (!Array.isArray(d.items) || !Array.isArray(d.sources)) throw Error();
        setFeed(d);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(true);
      });
    return () => c.abort();
  }, [retry]);
  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify(personal));
    } catch {
      setStorageError(true);
    }
  }, [personal]);
  useEffect(() => {
    if (feed)
      setPersonal((p) => ({ ...p, lastVisit: new Date().toISOString() }));
  }, [!!feed]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 2600);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobile(false);
      if (
        e.key === "/" &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  useEffect(
    () => setLimit(20),
    [query, org, kind, readFilter, dateFilter, sort],
  );
  const toggle = (field: "read" | "saved" | "following", id: string) =>
    setPersonal((p) => ({
      ...p,
      [field]: p[field].includes(id)
        ? p[field].filter((x) => x !== id)
        : [...p[field], id],
    }));
  const go = (r: string) => {
    location.hash = r;
  };
  const clear = () => {
    setQuery("");
    setOrg("all");
    setKind("all");
    setReadFilter("all");
    setDateFilter("all");
    setSort("published");
  };
  const navigate = (r: string) => {
    clear();
    go(r);
  };
  const exportData = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(personal, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download =
      "harness-reading-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    URL.revokeObjectURL(url);
    setToast("阅读记录已导出");
  };
  const importData = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw Error();
      const d = JSON.parse(await file.text());
      if (
        !["read", "saved", "following"].every(
          (k) =>
            Array.isArray(d[k]) &&
            d[k].every((x: unknown) => typeof x === "string"),
        ) ||
        typeof d.notes !== "object" ||
        d.notes === null ||
        Array.isArray(d.notes) ||
        !Object.values(d.notes).every((x) => typeof x === "string")
      )
        throw Error();
      setPersonal((p) => ({
        ...p,
        read: [...new Set([...p.read, ...d.read])],
        saved: [...new Set([...p.saved, ...d.saved])],
        following: [...new Set([...p.following, ...d.following])],
        notes: { ...p.notes, ...d.notes },
      }));
      setToast("已合并阅读记录");
    } catch {
      setToast("无法导入：请选择本站导出的 JSON 文件");
    }
    if (importRef.current) importRef.current.value = "";
  };
  const view = route.split("/")[0];
  const themeId = view === "theme" ? route.split("/")[1] : null;
  const currentTheme = feed?.themes.find((t) => t.id === themeId);
  const article =
    view === "article"
      ? feed?.items.find((i) => i.id === route.split("/")[1])
      : null;
  useEffect(() => {
    document.title = article
      ? article.titleZh + " · Harness 观察"
      : "Harness 观察 · Agent 工程前沿";
  }, [article]);
  const isNew = (i: Item) => !!INITIAL_VISIT && i.addedAt > INITIAL_VISIT;
  const stale = feed
    ? Date.now() - new Date(feed.updatedAt).getTime() > 36 * 3600 * 1000
    : false;
  const unread =
    feed?.items.filter((i) => !personal.read.includes(i.id)).length || 0;
  const nav = [
    { id: "today", label: "每日观察", icon: Radio },
    { id: "themes", label: "设计方向", icon: Compass },
    { id: "library", label: "资料库", icon: Layers3 },
    { id: "saved", label: "我的收藏", icon: Bookmark },
    { id: "sources", label: "来源与更新", icon: Activity },
  ];
  let items =
    feed?.items.filter(
      (i) =>
        (view !== "saved" || personal.saved.includes(i.id)) &&
        (!themeId || i.themes.includes(themeId)) &&
        (org === "all" || i.org === org) &&
        (kind === "all" || i.kind === kind) &&
        (readFilter === "all" ||
          (readFilter === "unread"
            ? !personal.read.includes(i.id)
            : personal.read.includes(i.id))) &&
        (dateFilter === "all" ||
          (dateFilter === "new"
            ? isNew(i)
            : i.published &&
              new Date(i.published).getTime() >=
                Date.now() - Number(dateFilter) * 86400000)) &&
        (!query ||
          [
            i.title,
            i.titleZh,
            i.summary,
            i.org,
            ...i.themes.map(
              (id) => feed.themes.find((t) => t.id === id)?.name || id,
            ),
          ]
            .join(" ")
            .toLowerCase()
            .includes(query.toLowerCase())),
    ) || [];
  if (sort === "added")
    items = [...items].sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  if (sort === "priority")
    items = [...items].sort(
      (a, b) =>
        Number(b.significance === "high") - Number(a.significance === "high"),
    );
  const digest =
    feed?.digests.find((d) => d.date === digestDate) || feed?.digests[0];
  function card(i: Item) {
    const saved = personal.saved.includes(i.id),
      read = personal.read.includes(i.id);
    return (
      <article className={"entry " + (read ? "is-read" : "")} key={i.id}>
        <div className="entry-main">
          <div className="eyebrow">
            <span
              className={"org-dot " + i.org.toLowerCase().replace(/\W/g, "")}
            />
            <span className="org-name">{i.org}</span>
            <span className="separator">/</span>
            <span className="kind">
              <IconKind kind={i.kind} />
              {KIND[i.kind]}
            </span>
            <time>{fmt(i.published)}</time>
            {isNew(i) && <span className="new-badge">新收录</span>}
            {read && (
              <span className="read-label">
                <Check size={12} />
                已读
              </span>
            )}
          </div>
          <h3>
            <a href={"#article/" + i.id}>
              {i.titleZh}
              <ArrowUpRight size={17} />
            </a>
          </h3>
          <p>{i.summary}</p>
          <div className="entry-bottom">
            <div className="tags">
              {i.themes.map((t) => (
                <a key={t} href={"#theme/" + t}>
                  {feed?.themes.find((x) => x.id === t)?.name}
                </a>
              ))}
            </div>
            <div className="entry-actions">
              <button
                aria-label={(read ? "标为未读：" : "标为已读：") + i.titleZh}
                title={read ? "标为未读" : "标为已读"}
                onClick={() => toggle("read", i.id)}
                className={read ? "active" : ""}
              >
                <CheckCheck size={17} />
              </button>
              <button
                aria-label={(saved ? "取消收藏：" : "收藏：") + i.titleZh}
                title={saved ? "取消收藏" : "收藏"}
                onClick={() => toggle("saved", i.id)}
                className={saved ? "active" : ""}
              >
                <Bookmark size={17} fill={saved ? "currentColor" : "none"} />
              </button>
            </div>
          </div>
        </div>
      </article>
    );
  }
  function filters() {
    return (
      <>
        <div className="filters">
          <label className="search">
            <Search size={17} />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索概念、公司或文章…"
              aria-label="搜索资料"
            />
            <kbd>/</kbd>
            {query && (
              <button aria-label="清空搜索" onClick={() => setQuery("")}>
                <X size={15} />
              </button>
            )}
          </label>
          <div className="select-wrap">
            <select
              aria-label="筛选来源"
              value={org}
              onChange={(e) => setOrg(e.target.value)}
            >
              <option value="all">所有来源</option>
              {[...new Set(feed?.items.map((i) => i.org))].sort().map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
            <ChevronDown size={13} />
          </div>
          <div className="select-wrap">
            <select
              aria-label="筛选类型"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="all">所有类型</option>
              {Object.entries(KIND).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <ChevronDown size={13} />
          </div>
        </div>
        <div className="list-tools">
          <div className="segmented">
            {[
              ["all", "全部"],
              ["unread", "未读"],
              ["read", "已读"],
            ].map(([k, v]) => (
              <button
                key={k}
                className={readFilter === k ? "selected" : ""}
                onClick={() => setReadFilter(k)}
              >
                {v}
              </button>
            ))}
          </div>
          <select
            aria-label="时间范围"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
          >
            <option value="all">不限时间</option>
            <option value="7">最近 7 天发布</option>
            <option value="30">最近 30 天发布</option>
            <option value="new">上次访问后收录</option>
          </select>
          <span className="result-count">{items.length} 条</span>
          <select
            aria-label="排序方式"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="published">原文日期 ↓</option>
            <option value="added">收录时间 ↓</option>
            <option value="priority">重要变化优先</option>
          </select>
        </div>
      </>
    );
  }
  function list() {
    return (
      <>
        {filters()}
        <div className="entries">
          {items.slice(0, limit).map(card)}
          {items.length === 0 && (
            <div className="empty">
              <Search size={26} />
              <h3>
                {view === "saved"
                  ? "这里还没有符合条件的收藏"
                  : "没有找到符合条件的资料"}
              </h3>
              <p>
                {view === "saved"
                  ? "点击文章旁的书签，留到下次阅读。"
                  : "试试其他关键词，或放宽筛选条件。"}
              </p>
              <button className="button" onClick={clear}>
                重置筛选
              </button>
            </div>
          )}
        </div>
        {items.length > limit && (
          <button className="load-more" onClick={() => setLimit((l) => l + 20)}>
            继续阅读 · 还有 {items.length - limit} 条<ChevronDown size={16} />
          </button>
        )}
      </>
    );
  }
  return (
    <div className="shell">
      <a
        className="skip"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        跳到内容
      </a>
      <div className="mobile-top">
        <a href="#today" className="brand">
          <span className="logo">
            H<span />
          </span>
          Harness 观察
        </a>
        <button
          aria-label={mobile ? "收起导航" : "打开导航"}
          aria-expanded={mobile}
          onClick={() => setMobile(!mobile)}
        >
          {mobile ? <X /> : <Menu />}
        </button>
      </div>
      {mobile && (
        <button
          className="scrim"
          aria-label="关闭导航"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={"sidebar " + (mobile ? "open" : "")}>
        <a href="#today" className="brand">
          <span className="logo">
            H<span />
          </span>
          <span>
            Harness <b>观察</b>
            <small>THE ENGINEERING FIELDNOTES</small>
          </span>
        </a>
        <div className="nav-caption">工作台</div>
        <nav>
          {nav.map(({ id, label, icon: Icon }) => (
            <a
              key={id}
              href={"#" + id}
              onClick={() => clear()}
              className={
                view === id || (view === "theme" && id === "themes")
                  ? "nav-active"
                  : ""
              }
            >
              <Icon size={18} />
              {label}
              {id === "saved" && personal.saved.length > 0 && (
                <span className="nav-count">{personal.saved.length}</span>
              )}
            </a>
          ))}
        </nav>
        <div className="sidebar-rule" />
        <div className="nav-caption">
          持续关注{" "}
          <span>{personal.following.length.toString().padStart(2, "0")}</span>
        </div>
        <div className="following">
          {feed?.themes
            .filter((t) => personal.following.includes(t.id))
            .map((t) => (
              <a href={"#theme/" + t.id} key={t.id}>
                <span className="tiny-dot" />
                {t.name}
              </a>
            ))}
          {personal.following.length === 0 && (
            <p>
              在设计方向中关注议题，
              <br />
              把值得追的线索留在这里。
            </p>
          )}
          <a className="explore" href="#themes">
            探索设计方向 <ArrowRight size={14} />
          </a>
        </div>
        <div className="sidebar-footer">
          <div className="status-line">
            <span
              className={
                "status-dot " + (stale || feed?.lastRun.errors ? "warn" : "")
              }
            />
            {!feed
              ? "正在连接"
              : stale
                ? "更新已延迟"
                : feed.lastRun.errors
                  ? feed.sources.some((s) => !s.ok)
                    ? "部分来源待重试"
                    : "部分条目待重试"
                  : "每日同步已启用"}
          </div>
          <small>北京时间 · 每天 08:00</small>
          <a
            href="https://github.com/gxPan1006/harness-observatory"
            target="_blank"
            rel="noreferrer"
          >
            <Github size={14} /> 开放源代码 <ArrowUpRight size={12} />
          </a>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div>
            <span className="breadcrumb">Agent engineering</span>
            <span className="separator">/</span>
            {article
              ? "阅读笔记"
              : currentTheme?.name ||
                nav.find((n) => n.id === view)?.label ||
                "每日观察"}
          </div>
          <a href="#sources">
            <span className={"status-dot " + (stale ? "warn" : "")} />
            {feed ? "同步于 " + fmt(feed.updatedAt, true) : "正在获取最新资料"}
          </a>
        </header>
        <main id="main-content" tabIndex={-1}>
          {storageError && (
            <div className="notice">
              浏览器存储不可用，阅读记录暂不能保存。你仍可以导出记录。
            </div>
          )}
          {stale && (
            <div className="notice">
              距离上次同步已超过 36 小时。以下是最后一次可用资料，请查看
              <a href="#sources">更新状态</a>。
            </div>
          )}
          {error ? (
            <div className="empty">
              <Activity size={32} />
              <h1>资料暂时未能加载</h1>
              <p>请稍后重试，已有阅读记录仍保留在此浏览器。</p>
              <button className="button" onClick={() => setRetry((r) => r + 1)}>
                重新加载
              </button>
            </div>
          ) : !feed ? (
            <div className="loading">
              <span className="status-dot" />
              正在打开观察台…
            </div>
          ) : (
            <>
              {article ? (
                <div className="reading">
                  <button className="back" onClick={() => navigate("library")}>
                    <ArrowLeft size={16} />
                    返回资料库
                  </button>
                  <div className="eyebrow">
                    <span className="org-name">{article.org}</span>
                    <span className="separator">/</span>
                    <IconKind kind={article.kind} />
                    {KIND[article.kind]}
                    <span className="separator">/</span>
                    {fmt(article.published)}
                  </div>
                  <h1>{article.titleZh}</h1>
                  <p className="original-title">{article.title}</p>
                  <p className="lead">{article.summary}</p>
                  <div className="reading-actions">
                    <a
                      className="button primary"
                      href={safeUrl(article.url)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      阅读原文
                      <ArrowUpRight size={16} />
                    </a>
                    <button
                      className={
                        "button " +
                        (personal.saved.includes(article.id) ? "on" : "")
                      }
                      onClick={() => toggle("saved", article.id)}
                    >
                      <Bookmark size={16} />
                      {personal.saved.includes(article.id) ? "已收藏" : "收藏"}
                    </button>
                    <button
                      className="button"
                      onClick={() => toggle("read", article.id)}
                    >
                      <CheckCheck size={16} />
                      {personal.read.includes(article.id)
                        ? "已读 · 标为未读"
                        : "标为已读"}
                    </button>
                  </div>
                  <section className="reading-section">
                    <div className="section-kicker">
                      <FileText size={16} />
                      原文事实
                    </div>
                    <ul className="facts">
                      {article.facts.map((f, j) => (
                        <li key={j}>
                          <span>{String(j + 1).padStart(2, "0")}</span>
                          {f}
                        </li>
                      ))}
                    </ul>
                  </section>
                  <section className="insight-box">
                    <div className="section-kicker">
                      <Sparkles size={16} />
                      工程启发 <span>综合推断</span>
                    </div>
                    <p>{article.insight}</p>
                  </section>
                  <section className="reading-section">
                    <div className="section-kicker">
                      <FlaskConical size={16} />
                      可以试的一个实验
                    </div>
                    <p>{article.experiment}</p>
                  </section>
                  <section className="reading-section boundary">
                    <div className="section-kicker">证据边界</div>
                    <p>{article.caveat}</p>
                    {article.excerptOnly && (
                      <p>此条目仅依据官方 RSS 简介，未获取完整正文。</p>
                    )}
                    {article.abstractOnly && (
                      <p>
                        论文条目基于公开摘要提炼，尚未做全文复现或同行评审核验。
                      </p>
                    )}
                    <div className="evidence-links">
                      {article.evidence.map((e, j) => (
                        <a
                          href={safeUrl(e.url)}
                          key={j}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {e.label}
                          <ExternalLink size={13} />
                        </a>
                      ))}
                    </div>
                    <small>
                      DeepSeek 辅助提炼 · {article.model} · 收录于{" "}
                      {fmt(article.addedAt, true)}
                      {article.revision && " · " + article.revision}
                      <br />
                      请以原文为准；代码观察基于所链接的文档及版本记录。
                    </small>
                  </section>
                  <section className="reading-section">
                    <div className="section-kicker">
                      <BookOpen size={16} />
                      我的笔记 <span>自动保存在当前浏览器</span>
                    </div>
                    <textarea
                      aria-label="我的笔记"
                      placeholder="记下它与你的 harness 的关系，或下一次想验证的假设…"
                      value={personal.notes[article.id] || ""}
                      onChange={(e) =>
                        setPersonal((p) => ({
                          ...p,
                          notes: { ...p.notes, [article.id]: e.target.value },
                        }))
                      }
                    />
                  </section>
                  <section className="reading-section">
                    <div className="section-kicker">沿着这条线索继续</div>
                    <div className="tags">
                      {article.themes.map((t) => (
                        <a href={"#theme/" + t} key={t}>
                          {feed.themes.find((x) => x.id === t)?.name}
                          <ArrowRight size={13} />
                        </a>
                      ))}
                    </div>
                    {feed.items
                      .filter(
                        (i) =>
                          i.id !== article.id &&
                          i.themes.some((t) => article.themes.includes(t)),
                      )
                      .slice(0, 3)
                      .map(card)}
                  </section>
                </div>
              ) : view === "article" ? (
                <div className="empty">
                  <h1>这条资料不存在</h1>
                  <a href="#library" className="button">
                    返回资料库
                  </a>
                </div>
              ) : view === "themes" ? (
                <>
                  <div className="page-heading">
                    <div className="overline">DESIGN DIRECTIONS</div>
                    <h1>沿着问题，追踪演化。</h1>
                    <p>把公司的新进展放回系统设计中，看哪些假设正在改变。</p>
                  </div>
                  <div className="theme-grid">
                    {feed.themes.map((t, j) => {
                      const related = feed.items.filter((i) =>
                        i.themes.includes(t.id),
                      );
                      return (
                        <section className="theme-card" key={t.id}>
                          <div className="theme-top">
                            <span className="theme-index">0{j + 1}</span>
                            <button
                              onClick={() => toggle("following", t.id)}
                              className={
                                "follow-button " +
                                (personal.following.includes(t.id) ? "on" : "")
                              }
                            >
                              {personal.following.includes(t.id) ? (
                                <Check size={14} />
                              ) : (
                                <Circle size={13} />
                              )}{" "}
                              {personal.following.includes(t.id)
                                ? "已关注"
                                : "关注"}
                            </button>
                          </div>
                          <h2>
                            <a href={"#theme/" + t.id}>
                              {t.name}
                              <ArrowUpRight size={18} />
                            </a>
                          </h2>
                          <h3>{t.question}</h3>
                          <p>{t.description}</p>
                          <div className="theme-meta">
                            {related.length} 条资料
                            <span>
                              {
                                related.filter(
                                  (i) => !personal.read.includes(i.id),
                                ).length
                              }{" "}
                              条未读
                            </span>
                          </div>
                          <div className="theme-latest">
                            最新线索
                            <a href={"#article/" + related[0]?.id}>
                              {related[0]?.titleZh || "等待下一次同步"}
                              <ArrowRight size={14} />
                            </a>
                          </div>
                        </section>
                      );
                    })}
                  </div>
                  <div className="method-note">
                    方向根据原始资料归类。关注后可从左侧快速进入，阅读与关注状态保存在当前浏览器。
                  </div>
                </>
              ) : view === "sources" ? (
                <>
                  <div className="page-heading">
                    <div className="overline">SOURCES & METHODOLOGY</div>
                    <h1>信息从哪里来。</h1>
                    <p>优先官方资料；保留来源、日期与证据边界。</p>
                  </div>
                  <div className="source-summary">
                    <div>
                      <span>同步计划</span>
                      <strong>每天 08:00</strong>
                      <small>北京时间 · 服务器自动运行</small>
                    </div>
                    <div>
                      <span>本次新增</span>
                      <strong>
                        {feed.lastRun.newItems} <em>条</em>
                      </strong>
                      <small>{fmt(feed.lastRun.finishedAt, true)}</small>
                    </div>
                    <div>
                      <span>来源连通</span>
                      <strong>
                        {feed.sources.filter((s) => s.ok).length}{" "}
                        <em>/ {feed.sources.length}</em>
                      </strong>
                      <small>
                        {feed.lastRun.errors
                          ? `${feed.lastRun.errors} 项抓取或提炼待重试`
                          : "本次没有错误"}
                      </small>
                    </div>
                  </div>
                  <section className="methodology">
                    <h2>从变化到工程认知</h2>
                    <div className="method-steps">
                      <div>
                        <b>01 · 获取</b>
                        <p>
                          官方工程博客、GitHub 文档与正式版本、arXiv
                          相关论文。文章回溯发现，代码固定到具体版本。
                        </p>
                      </div>
                      <div>
                        <b>02 · 提炼</b>
                        <p>
                          DeepSeek
                          读取实际抓取内容，输出事实、设计启发和对照实验。论文摘要、文档宣称均明确标注。
                        </p>
                      </div>
                      <div>
                        <b>03 · 留下线索</b>
                        <p>
                          相关度筛选、去重，按设计方向组织。来源失败时保留已有内容，下次同步重试。
                        </p>
                      </div>
                    </div>
                    <p className="method-footnote">
                      每次常规任务最多提炼 24 条，剩余内容排队（当前{" "}
                      {feed.lastRun.pending}{" "}
                      条）；故障不会用虚构摘要补齐。原文日期与收录时间分开显示，预发布版本不纳入版本流。
                    </p>
                  </section>
                  <h2 className="section-heading">
                    监测来源<span>{feed.sources.length} 个</span>
                  </h2>
                  <div className="source-list">
                    {feed.sources.map((s) => (
                      <div className="source-row" key={s.id}>
                        <span
                          className={"status-dot " + (!s.ok ? "warn" : "")}
                        />
                        <div>
                          <a
                            href={safeUrl(s.url)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {s.name}
                            <ArrowUpRight size={14} />
                          </a>
                          <small>
                            {s.type === "github"
                              ? "文档 / 提交 / 正式版本"
                              : s.type === "arxiv"
                                ? "论文摘要"
                                : "官方文章"}{" "}
                            · {s.org}
                          </small>
                        </div>
                        <span className={s.ok ? "source-ok" : "source-warn"}>
                          {s.ok ? "已同步" : "待重试"}
                        </span>
                        <time>{fmt(s.checkedAt, true)}</time>
                      </div>
                    ))}
                  </div>
                  <h2 className="section-heading">运行记录</h2>
                  <div className="run-list">
                    {[...feed.runs].reverse().map((r, j) => (
                      <div key={j}>
                        <time>{fmt(r.finishedAt, true)}</time>
                        <span>新增 {r.newItems} 条</span>
                        <span>
                          {r.errors ? `${r.errors} 项待重试` : "完成"}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="method-note">
                    未覆盖全部前沿信息；这是围绕官方来源持续维护的观察窗口。新增来源可通过公开仓库的
                    collector/sources.json 扩展。
                  </div>
                </>
              ) : (
                <>
                  <div className="page-heading">
                    <div className="overline">
                      {view === "today"
                        ? "THE DAILY OBSERVATION"
                        : view === "saved"
                          ? "YOUR READING DESK"
                          : themeId
                            ? "DESIGN DIRECTION"
                            : "THE RESEARCH LIBRARY"}
                    </div>
                    <div className="heading-row">
                      <h1>
                        {view === "today"
                          ? "读懂变化，再设计系统。"
                          : view === "saved"
                            ? "值得再读。"
                            : currentTheme
                              ? currentTheme.name
                              : "Harness 资料库"}
                      </h1>
                      {currentTheme && (
                        <button
                          className="button"
                          onClick={() => toggle("following", currentTheme.id)}
                        >
                          {personal.following.includes(currentTheme.id) ? (
                            <Check size={15} />
                          ) : (
                            <Circle size={15} />
                          )}{" "}
                          {personal.following.includes(currentTheme.id)
                            ? "已关注"
                            : "关注方向"}
                        </button>
                      )}
                    </div>
                    <p>
                      {view === "today"
                        ? "从一手资料中，追踪 Agent Harness 的设计选择与演化。"
                        : view === "saved"
                          ? "收藏、阅读标记与笔记保存在当前浏览器，可导出带走。"
                          : currentTheme
                            ? currentTheme.description
                            : "论文、开源实现与工程文章，回到每个观点的原始依据。"}
                    </p>
                  </div>
                  {view === "saved" && (
                    <div className="personal-tools">
                      <button className="button" onClick={exportData}>
                        <ArrowDownToLine size={15} />
                        导出阅读记录
                      </button>
                      <button
                        className="button"
                        onClick={() => importRef.current?.click()}
                      >
                        导入记录
                      </button>
                      <input
                        type="file"
                        accept="application/json,.json"
                        hidden
                        ref={importRef}
                        onChange={(e) => importData(e.target.files?.[0])}
                      />
                    </div>
                  )}
                  <div
                    className={
                      view === "today" ? "dashboard-layout" : "single-column"
                    }
                  >
                    <div className="primary-column">
                      {view === "today" && digest && (
                        <section className="digest">
                          <div className="digest-label">
                            <span>
                              <Sparkles size={15} />
                              阅读简报
                            </span>
                            <label className="digest-date">
                              <select
                                aria-label="选择简报日期"
                                value={digest.date}
                                onChange={(e) => setDigestDate(e.target.value)}
                              >
                                {feed.digests.map((d) => (
                                  <option key={d.date} value={d.date}>
                                    {fmt(d.date)} · 整理
                                  </option>
                                ))}
                              </select>
                              <ChevronDown size={12} />
                            </label>
                          </div>
                          <h2>{digest.headline}</h2>
                          <p>{digest.synthesis}</p>
                          <div className="digest-links">
                            {digest.items.slice(0, 3).map((id, j) => {
                              const i = feed.items.find((x) => x.id === id);
                              return i ? (
                                <a href={"#article/" + id} key={id}>
                                  <span>0{j + 1}</span>
                                  <div>
                                    {i.titleZh}
                                    <small>{i.org}</small>
                                  </div>
                                  <ArrowUpRight size={16} />
                                </a>
                              ) : null;
                            })}
                          </div>
                          <div className="digest-footer">
                            跨来源综合判断 · 点击条目核对原文
                          </div>
                        </section>
                      )}
                      <div className="section-heading">
                        {view === "today"
                          ? "更新流"
                          : currentTheme
                            ? "方向资料"
                            : "全部资料"}
                        <span>
                          {view === "today"
                            ? "按原文日期排列，兼收基础资料"
                            : `${items.length} 条`}
                        </span>
                      </div>
                      {list()}
                    </div>
                    {view === "today" && (
                      <aside className="right-rail">
                        <section className="reading-pulse">
                          <div className="rail-label">你的阅读进度</div>
                          <div className="pulse-number">
                            {unread}
                            <span>条未读</span>
                          </div>
                          <div className="progress-track">
                            <span
                              style={{
                                width: `${feed.items.length ? (personal.read.filter((id) => feed.items.some((i) => i.id === id)).length / feed.items.length) * 100 : 0}%`,
                              }}
                            />
                          </div>
                          <p>
                            已读 {feed.items.length - unread} /{" "}
                            {feed.items.length} 条
                          </p>
                          {INITIAL_VISIT && (
                            <button onClick={() => setDateFilter("new")}>
                              自上次访问新收录 {feed.items.filter(isNew).length}{" "}
                              条 <ArrowRight size={13} />
                            </button>
                          )}
                        </section>
                        <section>
                          <div className="rail-label">追踪的六个问题</div>
                          <div className="rail-themes">
                            {feed.themes.map((t, j) => (
                              <a href={"#theme/" + t.id} key={t.id}>
                                <span>0{j + 1}</span>
                                <div>
                                  {t.name}
                                  <small>
                                    {
                                      feed.items.filter((i) =>
                                        i.themes.includes(t.id),
                                      ).length
                                    }{" "}
                                    条线索
                                  </small>
                                </div>
                                <ArrowUpRight size={14} />
                              </a>
                            ))}
                          </div>
                        </section>
                        {digest && (
                          <section className="watch">
                            <div className="rail-label">
                              <FlaskConical size={14} />
                              带着问题读
                            </div>
                            {digest.watch.slice(0, 2).map((q, j) => (
                              <p key={j}>{q}</p>
                            ))}
                          </section>
                        )}
                        <div className="rail-note">
                          原文事实 → 工程启发 → 对照实验
                          <br />
                          每条线索都能回到出处。
                        </div>
                      </aside>
                    )}
                  </div>
                </>
              )}
            </>
          )}
          <footer className="footer">
            <span>
              Harness 观察 <span className="separator">/</span>{" "}
              保持好奇，保持验证。
            </span>
            <a href="#sources">
              来源与方法
              <ArrowUpRight size={13} />
            </a>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}
