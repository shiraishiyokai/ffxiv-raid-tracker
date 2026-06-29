# AGENTS.md — FFXIV 副本开荒犯错记录表 架构文档

> 本文档面向 AI 助手，提供项目完整架构参考。维护代码时请优先阅读此文件。

## 1. 项目概览

- **架构**：单文件 HTML，CSS + HTML + JS 全内联，零构建依赖
- **部署**：GitHub Pages（`shiraishiyokai.github.io/ffxiv-raid-tracker/ffxiv-raid-tracker.html`）
- **云存储**：GitHub Contents API（内置编辑密钥，用户零配置）
- **FFLogs 集成**：通过 Cloudflare Worker 代理转发 GraphQL 请求

### 文件结构

```
ffxiv-raid-tracker/
├── ffxiv-raid-tracker.html   # 完整应用（唯一主文件，~3668行）
├── README.md                  # 项目说明文档
├── AGENTS.md                  # AI 架构文档（本文件）
├── icons/                     # 技能图标 PNG（73个，命名=gameID.png）
├── data/                      # 队伍数据 JSON（GitHub Contents API 目标目录）
├── fflogs-proxy/              # Cloudflare Worker 代理（主部署）
│   ├── src/index.js           # Worker 源码（122行）
│   ├── wrangler.toml          # Cloudflare 配置
│   └── package.json           # wrangler 依赖
├── fflogs-proxy-netlify/      # Netlify 备选部署（未启用）
└── fflogs-proxy-vercel/       # Vercel 备选部署（未启用）
```

## 2. 代码结构（ffxiv-raid-tracker.html 行号范围）

> 行号可能随版本变化，仅作粗略参考。

### CSS（7~727行）
- 暗色主题 CSS 变量（`--bg-primary`, `--accent-gold` 等）
- 卡片/按钮/输入框/日历/时间轴/图表样式
- 关键样式类：`.btn`, `.btn-active`, `.card`, `.chart-controls`, `.wipe-cal-grid`

### HTML（730~934行）
- `<header>` — 标题 + 操作按钮（总览趋势/团灭分布/导出/导入）
- `#connectionBar` — 云同步状态指示
- `#quickBar` — 快速录入栏（队员按钮+预设+输入框）
- `#dayNav` — 日期导航（日期选择器+前后/今天按钮）
- `#miniCalendar` — 迷你日历
- `#daySummary` — 当日摘要区
- `#fflogsSection` — FFLogs 数据展示区（导入按钮+分析结果+时间轴容器）
- `#membersGrid` — 成员卡片网格
- `#overviewChartSection` — 总览趋势图（默认隐藏）
- `#wipeBarChartSection` — 团灭分布图+日历选择器（默认隐藏）
- `#teamIssues` — 团队问题区
- `#bottomActions` — 底部操作按钮

### JS（934~3665行）

| 模块 | 行号范围 | 关键函数/变量 |
|------|---------|-------------|
| 常量/配置 | 934~1582 | `ROLES`, `JOBS`, `MITIGATION_ABILITIES`, `FFLOGS_JOB_MAP` |
| 云同步 | 1181~1469 | `syncToCloud()`, `fetchFromCloud()`, `debouncedSaveToCloud()` |
| FFLogs GraphQL | 1583~1722 | `QL_FIGHTS`, `QL_DEATHS`, `QL_CASTS`, `QL_PHASES`, `fflogsGraphQL()`, `fetchFights()`, `fetchAllDeaths()`, `fetchAllCasts()`, `fetchPhaseTransitions()` |
| FFLogs 分析 | 1723~1825 | `analyzeFights()`, `autoMapPlayers()` |
| FFLogs 导入 UI | 1903~2172 | `startFFLogsImport()`, `finishMappingAndFetch()` |
| FFLogs 渲染 | 2174~2413 | `renderFFLogsSection()`, `renderAbilityTimeline()` |
| 渲染核心 | 2417~2809 | `renderAll()`, `renderDaySummary()`, `renderMemberCards()`, `renderTeamIssues()`, `renderPresets()` |
| 图表 | 2446~2661 | `phaseToNumeric()`, `formatPhaseLabel()`, `getChartDarkOptions()`, `getOverviewChartData()`, `renderOverviewChart()`, `renderWipeBarCalendar()`, `getWipeBarChartData()`, `renderWipeBarChart()` |
| 日期/日历 | 2705~2710, 3141~3200 | `renderDayNav()`, `renderCalendar()` |
| 事件绑定 | 2810~3665 | 键盘快捷键, 按钮事件, 图表事件, `init()` |

## 3. 核心数据结构

### `state` 对象（全局状态）

```javascript
state = {
  teamId: 'xxx',          // 队伍唯一ID
  isCaptain: true/false,  // 是否队长模式
  days: {                 // 每日数据
    '2026-06-26': {
      furthestPhase: 'P3 50.0%',  // 手动输入的最远进度
      totalTime: 7200000,         // 手动输入的开荒时长(ms)
      members: {
        MT: { name: '玩家名', job: 'GNB', mistakes: [{desc:'踩圈', count:1}] },
        // ... H1~D4
      },
      fflogs: {              // FFLogs 导入数据（可选）
        furthestPhase: 'P3 50.0%',
        totalTime: 7200000,
        fights: [{id, startTime, endTime, duration, kill, lastPhase, lastPhaseIsIntermission, bossPercentage}],
        deaths: [{player, time}],
        abilityTimeline: [{player, abilityGameID, timestamp, fightId}],
        phaseTransitions: {fightId: [{phase, startTime}]},
      }
    }
  },
  memberNames: {MT:'', ST:'', H1:'', H2:'', D1:'', D2:'', D3:'', D4:''},
  memberJobs: {MT:'GNB', ST:'WAR', H1:'WHM', H2:'SCH', D1:'BLM', D2:'SMN', D3:'DRG', D4:'MCH'},
  playerMappingCache: {'FFLogs玩家名': 'MT'},
  mistakePresets: ['踩圈', '吃AOE', ...],
  teamIssues: [{desc, severity, date}],
}
```

### `MITIGATION_ABILITIES` 格式

键为 **game action ID**（数字），值为 `{name, icon}`：

```javascript
7531: { name: '铁壁', icon: 'icons/7531.png' },  // Rampart
```

**完整技能清单（76个）**：

| 分类 | 技能（gameID: 中文名） |
|------|----------------------|
| 通用 | 7531:铁壁, 7548:亲疏自如, 7535:溃逃, 7549:牵制, 65:真言, 7560:衰退 |
| PLD | 3542:盾阵, 25746:神圣盾阵, 3540:圣光幕帘, 7382:干预, 7385:武装戍卫, 22:壁垒, 36920:极致防御 |
| WAR | 40:战栗, 43:死斗, 44:复仇, 3551:原始直觉, 3552:均衡, 7388:挥弃, 16464:新生之息, 25751:血戮, 36923:戮罪 |
| DRK | 3636:影墙, 3638:行尸走肉, 3634:暗黑心眼, 7393:至黑之夜, 25754:献祭, 36927:暗影卫 |
| GNB | 16140:伪装, 16148:星云, 16152:超火, 16160:光之心, 16151:极光, 16161:石之心, 25758:刚玉之心, 36935:大星云 |
| WHM | 7432:神祝祷, 25861:水流幕, 25862:祝祷之钟, 16536:节制, 7433:大赦, 37011:神爱抚 |
| SCH | 188:野战治疗阵, 7434:应急战术, 25868:疾风怒涛之计, 25867:延展, 16542:复述, 37014:炽天附体 |
| AST | 3613:集体潜意识, 16559:中立学派, 25874:宏观宇宙, 3612:星位合图, 16552:占卜, 37031:太阳星座 |
| SGE | 24298:克拉克尔, 24311:万灵阵, 24305:灵蚀, 24310:全灵, 24301:发酵, 24300:佐埃, 24317:克拉斯, 24294:索特利亚, 24296:德鲁阿克勒, 24299:伊克索克勒, 24303:陶罗克勒, 24288:菲西斯, 24291:异论诊断, 24292:异论预言 |
| 远程物理 | 7405:行吟(BRD), 16889:策动(MCH), 16012:防守之桑巴(DNC), 2887:武装解除(MCH), 25857:抗死(RDM) |

### `ROLES` 定义

```javascript
const ROLES = {
  MT: { label: 'MT', role: 'tank' },
  ST: { label: 'ST', role: 'tank' },
  H1: { label: 'H1', role: 'healer' },
  H2: { label: 'H2', role: 'healer' },
  D1: { label: 'D1', role: 'dps' },
  D2: { label: 'D2', role: 'dps' },
  D3: { label: 'D3', role: 'dps' },
  D4: { label: 'D4', role: 'dps' },
};
```

### `FFLOGS_JOB_MAP`

将 FFLogs 返回的 `player.subType` 映射到项目内部职业 key：

```javascript
const FFLOGS_JOB_MAP = {
  Paladin: 'PLD', Warrior: 'WAR', DarkKnight: 'DRK', Gunbreaker: 'GNB',
  WhiteMage: 'WHM', Scholar: 'SCH', Astrologian: 'AST', Sage: 'SGE',
  // ... DPS jobs
};
```

## 4. 模块详解

### 云同步模块

- **队长模式** `syncToCloud()`：直接上传 state 到 GitHub，SHA冲突重试机制
- **队员模式** `syncToCloud()`：拉取云端→合并备注→上传，不覆盖队长数据
- **`fetchFromCloud()`**：从 GitHub 拉取数据，Base64解码，覆盖本地（保护正在编辑的备注）
- **`debouncedSaveToCloud()`**：延迟3秒自动保存，避免频繁上传
- ⚠️ **陷阱**：`state = content`（云端数据）会丢失新字段（playerMappingCache, memberNames, memberJobs等），必须在赋值后手动迁移

### FFLogs 模块

**GraphQL 查询模板**：
- `QL_FIGHTS` — 获取战斗列表（code, fightIDs）
- `QL_DEATHS` — 获取死亡事件（code, fightIDs）
- `QL_CASTS` — 获取技能释放（code, fightIDs, abilityIDs）
- `QL_PHASES` — 获取阶段转换（code, fightIDs，仅返回 id + startTime）

**数据获取流程**：
1. 用户输入 FFLogs 报告链接 → 提取 code 和 fightIDs
2. `fetchFights()` → `fetchAllDeaths()` → `fetchAllCasts()` → `fetchPhaseTransitions()`
3. `analyzeFights()` 计算统计（furthestPhase 含boss血量百分比，如 "P3 50.0%"）
4. `autoMapPlayers()` 三步映射：缓存→名称匹配→职业匹配

**phaseTransitions 处理**：
- FFLogs `PhaseTransition` 类型**没有 phase 字段**，只有 id 和 startTime
- phase 编号从排序推断：`idx + 1`（FFLogs 包含 P1 起始 transition）
- 渲染时跳过 relTs < 1000ms 的 transition（P1 起始线无意义）

### 技能时间轴模块

`renderAbilityTimeline(fl)` 渲染减伤技能时间轴：
- 按玩家分行，排序依据 `positionOrder`（MT→ST→H1→H2→D1→D4）
- 从 `fl.abilityTimeline` 筛选 `MITIGATION_ABILITIES` 中定义的技能
- 图标来源：`MITIGATION_ABILITIES[c.abilityGameID].icon`
- 分P线：从 `fl.phaseTransitions[fightId]` 绘制垂直分割线+顶部标签

### 图表模块

- **总览趋势** `renderOverviewChart()`：Chart.js 折线图，3个指标（进度/时长/犯错）
  - 进度 Y 轴：`phaseToNumeric()` 将 "P3 50%" → 3.5，tooltip 显示原始标签
  - 犯错 Y 轴：纯数字（次）
  - 时长 Y 轴：累计小时
- **团灭分布** `renderWipeBarChart()` + `renderWipeBarCalendar()`：
  - 日历选择日期（`wipeBarCalMonth` + `wipeBarSelectedDate` 两个独立变量）
  - 点击日期 → `renderWipeBarChart()` 重绘柱状图
  - 柱状图按 lastPhase 分组统计非 kill 战斗
- 按钮为 toggle：点击展开（`btn-active` 金色），再点关闭

### 渲染核心

`renderAll()` 调用链：
1. `renderConnectionBar()` → `renderQuickBarIcons()` → `renderDayNav()`
2. `renderCalendar()`（仅日历可见时）→ `renderDaySummary()`
3. `renderFFLogsSection()` → `renderMemberCards()` → `renderTeamIssues()` → `renderPresets()`
4. 如图表展开 → `renderWipeBarChart()` / `renderOverviewChart()`

## 5. 图标系统

图标存储在 `icons/` 目录，文件命名格式为 `{gameID}.png`。

### 添加新追踪技能的完整步骤

#### 第1步：确认技能的 game ID（action ID）

获取途径：
- **FFLogs 报告**：从 cast 事件的 `abilityGameID` 字段获取
- **用户直接提供**：注意确认是 game action ID（不是 Lodestone ID 或 FFLogs 界面 ID）
- **Garland Tools 网站**：`https://www.garlandtools.org/db/#action/{技能英文名}` 搜索

#### 第2步：从 Garland Tools API 获取 icon ID

⚠️ **关键：action ID ≠ icon ID！** 7.0 (Dawntrail) 新技能两者完全不同，旧技能（6.x及之前）碰巧相同。

**API 端点**：
```
https://www.garlandtools.org/db/doc/action/en/2/{gameID}.json
```

**示例**：
```bash
curl -s "https://www.garlandtools.org/db/doc/action/en/2/36923.json" | python3 -m json.tool
# 返回: {"action":{"name":"Damnation","icon":2573,"id":36923,...}}
# → icon ID = 2573, action ID = 36923
```

**手动查看**（当 API 不可用时）：
访问 `https://www.garlandtools.org/db/#action/36923`，页面加载后图标出现在 `<div id="minimap">` 下，路径如 `../files/icons/action/2573.png`，其中 2573 即为 icon ID。

#### 第3步：从 XivAPI CDN 下载图标 PNG

**URL 格式**：
```
https://xivapi.com/i/{icon_id前3位}000/{icon_id_6位补零}.png
```

**icon ID → URL 转换规则**：
1. 将 icon ID 补零到6位（如 2573 → 002573）
2. 取前3位 + "000" 作为文件夹（如 002 → 002000）
3. 组合为完整 URL

| icon ID | 补零 | 文件夹 | 完整 URL |
|---------|------|--------|---------|
| 2573 | 002573 | 002000 | `https://xivapi.com/i/002000/002573.png` |
| 3435 | 003435 | 003000 | `https://xivapi.com/i/003000/003435.png` |
| 2128 | 002128 | 002000 | `https://xivapi.com/i/002000/002128.png` |
| 3109 | 003109 | 003000 | `https://xivapi.com/i/003000/003109.png` |

**下载命令**（⚠️ 文件名用 game ID，不是 icon ID）：
```bash
# 戮罪 Damnation: gameID=36923, iconID=2573
curl -s -o icons/36923.png "https://xivapi.com/i/002000/002573.png"
file icons/36923.png
# 应输出: PNG image data, 40 x 40, 8-bit/color RGBA, non-interlaced

# 暗影卫 Shadowed Vigil: gameID=36927, iconID=3094
curl -s -o icons/36927.png "https://xivapi.com/i/003000/003094.png"

# 太阳星座 Sun Sign: gameID=37031, iconID=3109
curl -s -o icons/37031.png "https://xivapi.com/i/003000/003109.png"

# 抗死 Magick Barrier: gameID=25857, iconID=3237
curl -s -o icons/25857.png "https://xivapi.com/i/003000/003237.png"
```

#### 第4步：添加到 MITIGATION_ABILITIES

在 `ffxiv-raid-tracker.html` 的 `MITIGATION_ABILITIES` 对象中添加一行：

```javascript
36923: { name: '戮罪', icon: 'icons/36923.png' },  // Damnation (WAR)
```

格式：`{gameID}: { name: '中文名', icon: 'icons/{gameID}.png' }`

#### 第5步：提交推送

```bash
git add ffxiv-raid-tracker.html icons/{gameID}.png
git commit -m "feat: 添加{技能名}({英文名})技能追踪"
git push
```

### ⚠️ 常见错误

1. **直接用 game ID 当 icon ID 下载**：7.0 技能两者不同，会下载到错误图标。必须先查 Garland Tools 获取真实 icon ID。
2. **用 XivAPI v1 搜索端点**：没有 7.0 数据，搜不到 Dawntrail 技能。
3. **用 XivAPI v1 Action 端点**：用的是 XivAPI 顺序 ID，不是 game action ID。
4. **文件名用 icon ID**：MITIGATION_ABILITIES 引用的是 game ID，所以文件必须命名为 `{gameID}.png`。
5. **下载后不验证**：URL 不存在时 XivAPI 返回 HTML 而非 PNG，用 `file` 命令验证。
6. **猜测技能-职业对应**：绝对不要猜测！必须从数据、Garland Tools 或用户确认。

### 批量查找 game ID 的方法

如果不知道 game ID，可以在 Garland Tools API 上按 ID 范围扫描：

```bash
# 搜索某个职业（如 WAR job=21）的 7.0 技能
for id in $(seq 36920 36930); do
  result=$(curl -s "https://www.garlandtools.org/db/doc/action/en/2/${id}.json" 2>/dev/null)
  name=$(echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); a=d['action']; print(f'{a[\"name\"]} id={a[\"id\"]} icon={a[\"icon\"]} job={a.get(\"job\",\"?\")} lvl={a.get(\"lvl\",\"?\")}')")
  if [ -n "$name" ]; then echo "$name"; fi
done
```

job 编号参考：PLD=19, WAR=21, DRK=32, GNB=37, WHM=24, SCH=28, AST=33, SGE=40, BRD=23, MCH=31, DNC=38, RDM=35

## 6. fflogs-proxy 模块

Cloudflare Worker 代理，解决浏览器跨域和 OAuth2 认证问题。

**架构**：
- 请求流：浏览器 → `POST /graphql` → Worker → OAuth2 获取 Bearer Token → `POST cn.fflogs.com/api/v2/client` → 返回结果
- Token 缓存1小时，自动刷新
- CORS headers 允许所有来源

**路由**：
- `POST /graphql` — 转发 GraphQL 查询
- `GET /health` — 健康检查
- `OPTIONS *` — CORS preflight

**配置**：
- `wrangler.toml`：name, main, compatibility_date
- Secrets：`FFLOGS_CLIENT_ID`, `FFLOGS_CLIENT_SECRET`（通过 `wrangler secret put` 设置）

## 7. 常见维护任务

### 添加新追踪技能
→ 见 **第5节 图标系统** 的完整5步流程

### 修复云同步字段迁移
当 `state` 对象新增字段后，`fetchFromCloud()` 和 `syncToCloud()` 中 `state = content` / `state = mergeBase` 会覆盖丢失新字段。必须在赋值前保存本地值，赋值后恢复：

```javascript
const localPlayerMappingCache = state.playerMappingCache;
state = content;  // 云端数据不含新字段
if (!state.playerMappingCache) state.playerMappingCache = localPlayerMappingCache || {};
```

### 修改 FFLogs 查询
GraphQL 查询模板在 `QL_FIGHTS`, `QL_DEATHS`, `QL_CASTS`, `QL_PHASES` 常量中定义。修改时注意：
- FFLogs GraphQL schema 可能变化，先用 `__schema` 查询确认字段存在
- `PhaseTransition` 类型只有 `id` 和 `startTime`，没有 `phase` 字段

## 8. 已知陷阱

| 陷阱 | 说明 |
|------|------|
| 不要猜测技能-职业 | 绝对不要凭印象或搜索结果猜测，必须从 Garland Tools 数据或用户确认 |
| `state = content` 丢失新字段 | 云端数据不含新增字段，赋值后必须手动迁移 |
| phaseTransitions 无 phase 字段 | 需从排序推断：idx+1，渲染时跳过 relTs<1000ms |
| Chart.js 实例必须先 destroy | 否则报 canvas reuse 错误 |
| 团灭日历不应重置用户选择 | `wipeBarSelectedDate` 是独立变量，不应在重绘时强制设回 activeDate |
| GitHub Pages 有10分钟缓存 | `max-age=600`，代码推送后可能延迟生效 |
| furthestPhase 格式含boss血量 | "P3 50.0%"，`phaseToNumeric()` 需同时解析 phase 和百分比 |
