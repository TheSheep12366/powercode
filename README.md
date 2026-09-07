# PowerCode · 多人在线代码协作平台

基于 Node.js 22 + TypeScript 的多人在线代码协作平台（规划文档见 `docs/技术栈与功能清单.md`）。

## 当前进度

- ✅ monorepo 脚手架（pnpm workspace：`apps/server` + `apps/web` + `packages/shared`）
- ✅ 数据库层：SQLite（better-sqlite3，WAL）+ Drizzle ORM，全部表迁移就绪
- ✅ M1 认证与会话：登录/登出/me、bcrypt(12)、Cookie Session（httpOnly，服务端可吊销）、登录限速、改密（踢其它会话）、审计日志
- ✅ M2 用户管理：CRUD API + 管理面板（搜索/筛选/排序/分页、重置密码、禁用踢线、最后管理员保护）
- ✅ M4 共享目录管理：添加已有目录/自动创建（相对路径基于 WORKSPACES_ROOT 补全）、可见性（所有用户/指定用户）、移除共享（不删磁盘文件）、大小统计（du+文件数）、路径防护（拒绝 `/`）
- ✅ M3 权限管理（全量）：目录权限 rw/ro/deny（用户级 > 权限组授予 > 组级、deny 优先、管理员天然读写）、权限矩阵页、用户组 CRUD、**权限组（角色模板：管理能力勾选 + 工作区访问范围[全部/指定+级别]）**、能力位鉴权（requireCap 替代管理员总闸）、`/api/my/directories` 工作区数据源
- ✅ **M6 实时协作编辑（P0 全量）**：工作区页（左文件树 + 中多标签编辑器 + 右在线列表 + 底部终端占位）；CodeMirror 6（行号/括号/搜索替换/100+ 语言按扩展名懒加载）；Yjs + Hocuspocus v4 实时同步（局域网 <100ms、断线自动重连、自动合并）；远程光标/选区（彩色 + 用户名标签）；在线列表（正在编辑的文件，可点击跳转）；自动保存（防抖 1s 原子写盘）；文件操作（新建/重命名/删除/上传 50MB/下载/目录 zip）；大文件与二进制保护（>2MB 或二进制拒绝进编辑器）；协作层鉴权（按 cookie 会话 + 目录权限，只读连接写入被服务器拒绝）；权限组/用户级/组级条目全链路生效
- ✅ **M6 体验增强（17 项）**：①文件树重复 bug ②根目录上传 bug ③用户头像上传（PNG/JPG/GIF/WebP，全站显示：工作区顶栏/在线面板/通讯录/用户主页/管理列表）④头像绿点在线状态（悬停显示正在编辑）⑤用户主页（基本信息+在线状态+正在编辑，头像可自助更换）⑥通讯录（可见性可由管理员/授权者切换公开或受限）⑦共享目录弹窗可见用户改下拉多选（MultiSelect）⑧文件夹选择器固定 3 行高度内滚动+弱滚动条 ⑨工作区项目选择页隔离（多项目卡片+在编人数悬停显示名单）⑩暗色模式手动切换（首帧防闪，CodeMirror oneDark 同步）⑪更强高亮（oneDark + 140+ 语言）⑫自身光标彩色化 ⑬文件树"XX 正在编辑"指示 ⑭全部边栏/终端动画收起展开 ⑮弱化代码区滚动条 ⑯自动换行全局同步（Y.Map 共享偏好）⑰颜色值内联方块+点击取色器 ⑱保存按钮/Ctrl+S/未保存蓝点/关闭确认（stateless 强制写盘协议）
- ✅ **体验修复轮**：编辑器空白（ViewPlugin 需类构造 + WidgetType 导入）、文件树重复、根目录上传、在线状态全面重构（**全局单连接 presence——“正在使用即在线”**，登出仅断自己，退出工作区自动清空在编状态，生命周期 E2E 5/5）、通讯录列表式重做（返回+实时在线）、用户主页改模态（全站点击用户名弹出）、终端亮色适配、工作区状态持久化（标签页 sessionStorage + 目录展开 localStorage）、暗色手动切换
- ✅ **单点登录强制**：同账号在新设备登录会顶替旧会话——旧设备立即收到"账号已在其他设备登录"提示并被踢下线（401 专用码 + presence 5s 清扫按会话粒度踢 socket），新设备完全不受影响；登出仅断自己
- ✅ **单点登录强制**之外的身份体系：用户头像上传（全站显示）、头像绿点在线状态（悬停显示正在编辑）、用户主页模态、通讯录（可见性可切换）
- ✅ **仪表盘重构（首页）**：可自定义卡片系统（添加/删除/拖拽排序，布局按用户持久化）+ 12 种卡片：通讯录、项目详情（在编成员/文件数/体积/代码行数）、GitHub 式贡献图（120 天，基于审计日志）、总代码行数统计、最近动态（管理员看全员）、日历、公告（管理员/授权者发布，已读统计+一键提醒未读=卡片高亮抖动推送）、倒数日（个人+全员强制）、TODO（个人时间轴+全员计划强制）、用户管理（管理专属）、快捷创建项目（管理专属）、AI 预留位；公告/倒数日/TODO 有内容时卡片固定显示不可移除
- ✅ **权限组细化**：新增 管理公告（canManageAnnouncements）、管理全员计划（canManageGlobalPlans）两个能力位，覆盖公告与全员计划的全部管理操作
- ✅ 测试基建：`apps/server/collab-e2e.mjs`（八项协作 E2E）、`apps/server/presence-e2e.mts`（五项在线状态生命周期 E2E）、`apps/server/session-e2e.mts`（七项会话顶替 E2E），测试账号 c2test/c3test（密码 Test@123456）
- ✅ 附加：添加共享目录弹窗内置**文件夹选择器**（浏览/上级…/新建/选择，限制在工作区根内）、可见用户勾选修复；fuxsto-design 已收入 `vendor/` 本地化（file: 依赖，防上游变动）
- ✅ UI：**fuxsto-design 0.1.1**（Vue 3 + Tailwind CSS v4，zinc 单色风格，shadcn 式令牌）全量重构前端；思源黑体自托管；主包 gzip 约 55KB。**必须使用子路径默认导出**（如 `import DialogDefault from 'fuxsto-design/dialog'`）——该版本主入口与命名导出均有 bug
- ✅ 局域网访问：HOST=`::` **IPv4/IPv6 双栈监听**（无 IPv6 环境自动回退 0.0.0.0）；Windows 防火墙 + Hyper-V 防火墙已放行 3100，iptables/ip6tables 均已放行
- ⬜ 下一阶段：M6-9/10/11（外部修改检测/大文件搜索优化）→ M7 Web 终端（SSH 集成）→ M5 SSH 账户管理

## 目录结构

```
powercode/
├─ apps/server/        # Express 5 API（src/，构建到 dist/）
│  ├─ src/db/          # schema + 客户端 + 初始管理员
│  ├─ src/routes/      # auth / health
│  ├─ src/middleware/  # 会话与权限
│  ├─ src/lib/         # 日志(pino) / 限速 / 审计
│  └─ drizzle/         # SQL 迁移（drizzle-kit generate 生成）
├─ apps/web/           # Vue 3 SPA（Vite，构建到 dist/，由后端静态托管）
├─ packages/shared/    # 前后端共享类型
└─ data/               # SQLite 数据库（gitignore）
```

## 常用命令

```bash
# 本机使用宝塔 Node 22（勿用系统 Node 20，原生模块 ABI 不同）
export PATH=/www/server/nodejs/v22.23.2/bin:$HOME/.local/bin:$PATH
export npm_config_cache=$HOME/.npm/cache   # 宝塔全局 npm 缓存目录 root 专属，需覆盖

pnpm install        # 安装依赖
pnpm build          # 构建 shared → server → web
pnpm start          # 生产启动（node apps/server/dist/index.js，读取根目录 .env）
pnpm dev:server     # 后端开发（tsx watch）
pnpm dev:web        # 前端开发（Vite 5173，/api 代理到 3100）
pnpm db:generate    # 修改 schema.ts 后生成迁移
```

## 开发环境默认账号

- 用户名 `admin`，密码 `Admin@123456`（来自 `.env` 的 `ADMIN_INITIAL_PASSWORD`，仅首次建库时创建）
- 首次登录后请通过接口或后续的用户管理界面改密

## 宝塔面板部署（Node 项目）

添加 Node 项目（**默认项目**）：

| 表单项 | 值 |
|---|---|
| 项目目录 | `/www/wwwroot/powercode` |
| 项目名称 | `powercode` |
| 启动选项 | `start`（面板读取根 package.json scripts） |
| Node 版本 | v22.23.2 |
| 包管理器 | pnpm，**勾选"不安装 node_module"**（依赖已由命令行装好） |
| 更多配置 → 项目端口 | **3100**（本机 3000 已被其他服务占用） |
| 更多配置 → 运行用户 | www（`data/` 目录已开放读写） |

注意：

1. 面板的"安装依赖"和命令行安装都会因宝塔全局 npm 缓存目录（`/www/server/nodejs/cache`，root 专属）对非 root 用户报 EACCES——所以面板里必须勾选"不安装 node_module"，依赖统一用上面的命令行方式（带 `npm_config_cache` 覆盖）安装。
2. 反向代理需支持 WebSocket（协作/终端阶段会用到），届时由部署脚本检查补齐 `Upgrade`/`Connection` 头。
