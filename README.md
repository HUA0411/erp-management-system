# 企业 ERP 进销存管理系统

多租户企业级核心业务系统，覆盖 **采购 → 入库 → 库存 → 销售 → 出库 → 财务往来 → 数据看板** 完整业务闭环。
后端 NestJS + TypeORM + MySQL（共享库行级隔离），前端 Vue3 + Element Plus + ECharts，全栈 TypeScript。

## ✨ 功能一览

| 模块     | 功能                                                                                          |
| -------- | --------------------------------------------------------------------------------------------- |
| 数据看板 | 今日/本月销售额、待入库、低库存预警、应收应付汇总、近 30 天销售趋势图、热销商品 TOP、最近单据 |
| 基础资料 | 商品分类（树形）、商品管理、供应商管理、客户管理（CRUD + 分页 + 筛选）                        |
| 采购管理 | 采购订单（草稿→确认→**入库**）、采购入库单，入库事务内自动增加库存并写流水                    |
| 销售管理 | 销售订单（草稿→确认→**出库**）、销售出库单，出库 `FOR UPDATE` 锁行防超卖                      |
| 库存管理 | 实时库存、库存流水（全量追溯）、库存预警（低于安全库存）、库存盘点（差异调整）、手工调整      |
| 财务管理 | 收付款单（收款/付款）、应收应付往来汇总                                                       |
| 系统管理 | 用户管理（RBAC 角色分配）、角色管理（菜单+按钮权限树授权）、菜单权限、操作日志审计            |
| 平台能力 | 多租户行级隔离（`company_id` 全链路强制）、JWT 认证、按钮级权限指令、Swagger 文档             |

## 🧱 技术栈

- **后端**：NestJS 11 · TypeORM 0.3 · MySQL 8.0 · JWT · bcryptjs · class-validator · @nestjs/throttler · Swagger
- **前端**：Vue 3.5 · Vite 6 · Element Plus · Pinia · Vue Router · Axios · ECharts 5
- **共享**：npm workspaces monorepo（`server` / `web` / `shared` 类型包）
- **测试**：Jest 单测（库存事务/防超卖/认证）+ supertest e2e（租户隔离/防超卖/RBAC）

## 🚀 快速开始

- Node.js ≥ 20（开发机 v22 已验证）
- MySQL 8.0（本机 localhost:3306）

### 1. 安装依赖

```bash
npm install
```

### 2. 配置数据库连接

```bash
# 服务端进程的 cwd 是 server/，实际读取的是 server/.env
# 根目录的 .env 一并放一份，便于在仓库根直接跑脚本
cp .env.example server/.env
cp .env.example .env

# 必改：JWT_SECRET（openssl rand -hex 32）
# 常用：DB_HOST / DB_PORT / DB_USERNAME / DB_PASSWORD / DB_DATABASE
chmod 600 .env server/.env    # 文件里含数据库口令与 JWT 密钥
```

> `JWT_SECRET` 若不修改，服务**会拒绝启动**并给出明确提示 —— 而不是像以前那样
> 静默使用仓库里公开的占位串（那等于任何人都能伪造任意租户的超管 token）。

### 3. 初始化数据库（幂等，可重复执行）

```bash
npm run db:init    # 建库 → 执行迁移 → 写入种子数据
```

### 4. 一键启动（后端 :3000 + 前端 :5173）

```bash
npm run dev
```

访问：

- 前端控制台：http://localhost:5173
- Swagger API 文档：http://localhost:3000/api/docs

### 演示账号（密码均为 `123456`）

| 账号       | 公司                  | 角色       | 说明                                         |
| ---------- | --------------------- | ---------- | -------------------------------------------- |
| `admin`    | DEMO 演示科技有限公司 | 超级管理员 | 全部权限                                     |
| `zhangsan` | DEMO                  | 采购员     | 采购/入库/看板                               |
| `lisi`     | DEMO                  | 销售员     | 销售/出库/看板                               |
| `wangwu`   | DEMO                  | 仓管员     | 库存/盘点/出入库单                           |
| `zhaoliu`  | DEMO                  | 财务       | 收付款/往来账                                |
| `t2admin`  | T2 测试公司           | 超级管理员 | **租户隔离验证**：登录后看不到 DEMO 任何数据 |

### 数据库维护命令

```bash
npm run db:init     # 建库 + 迁移 + 种子（含演示数据，幂等）
npm run db:reset    # 清空全部业务数据，保留权限/角色/用户模板（客户干净起步）
npm run db:demo     # 清空后重新注入演示数据（恢复出厂演示状态）
```

## 💼 商业交付

本系统按**源码交付**设计，可直接出售给需要进销存/库存/财务一体化的企业客户：

- 📦 **交付文档**：`docs/交付清单.md`（交付物清单与验收步骤）
- 🚢 **部署文档**：`docs/部署指南.md`（Linux/Windows 生产部署、nginx、备份、安全清单）
- 🛠 **定制文档**：`docs/定制开发指南.md`（改品牌/加页面/加模块/加权限的逐步教程）
- 📜 **授权模板**：`docs/授权协议模板.md`（源码授权范围与限制）

**定制成本**：品牌换肤改 `web/src/config/brand.ts` 一个文件；新增页面照抄现有模式；新增业务模块照抄现有 module 结构。技术栈为国内主流（NestJS + Vue3 + Element Plus + MySQL），接单方易维护、易交付。

## 🏗 架构设计

### 多租户（共享库 · 行级隔离）

- 所有业务表（含用户/角色）携带 `company_id` 列 + 复合索引
- `TenantMiddleware` 从 JWT 解析租户并写入 `AsyncLocalStorage`（`TenantContext`），贯穿请求全链路
- `TenantSubscriber` 在写入前兜底注入 `company_id`，杜绝"忘记带租户"的越权写
- 所有仓储查询显式携带租户条件；跨租户按 ID 取数返回业务 404（不暴露存在性）
- e2e 测试验证：T2 登录后商品数为 0、跨租户读 DEMO 单据返回 40406

### 库存一致性（防超卖 / 防重复执行）

- 入库/出库/盘点均在数据库事务内完成：**订单状态 + 库存行 + 流水** 三处原子一致，失败整体回滚
- 出库对库存行执行 `SELECT ... FOR UPDATE` 锁行，扣减前校验非负，杜绝并发超卖
- 流水记录 `balance_after` 结余，任意一笔变动可追溯来源单号（`ref_type`/`ref_no`）

**状态流转一律用条件 UPDATE 抢占，不做「先查再改」。**
事务外读到的 status 是快照，两个并发请求会读到同一个旧状态、双双通过校验、
双双跑完整套流程。`server/src/common/utils/claim-status.ts` 把它收敛成一句：

```ts
const claimed = await claimStatus(
  manager,
  SaleOrderEntity,
  { id, companyId },
  'confirmed',
  'outbound',
);
if (!claimed) throw new BusinessException('该订单已被处理，请刷新后重试', 40040);
```

覆盖：销售确认/取消/出库、采购确认/取消/入库、盘点确认、AI 提案取消。
数据库层再加一道唯一索引 `sale_outbound(company_id, order_id)` 与
`purchase_inbound(company_id, order_id)` 兜底。

其余并发约定：

- **加锁顺序统一按 `productId` 升序**，避免两张明细顺序相反的订单互相等锁形成死锁（1213）
- 事务重试只针对 1062 / 1213 / 1205，退避后重试，用尽抛可读的业务异常而不是 500
- 盘点差异在**确认时**按「实盘 − 当前账面」重算，不用建单时的快照（否则期间的出入库会把结论冲淡）

### 权限（RBAC）

- 权限 = 菜单 + 按钮两级，全局模板（公司共用），角色按公司实例化
- 前端：侧边栏按 `/auth/profile` 返回的菜单树动态渲染；按钮级 `v-permission` 指令
- 后端：`@RequirePermissions(...)` 声明式校验 + 权限码 30s 内存 TTL 缓存（角色变更即时失效）；平台超管全放行

### 编号与金额

- 单号：`PO/IB/SO/OB/ST/PAY + yyyyMMdd + 4位序号`，租户内唯一索引兜底 + 唯一键冲突重试
- 金额一律 `DECIMAL(12,2)` 服务端计算，mysql2 字符串经 transformer 转 number

## 📁 项目结构

```
├── package.json            # npm workspaces + 一键脚本（dev / db:init / test）
├── ecosystem.config.js     # PM2 生产集群配置
├── scripts/smoke-test.ps1  # 接口冒烟测试（业务闭环/防超卖/盘点/收付款）
├── shared/src/index.ts     # 前后端共享类型（import type，零运行时）
├── server/                 # NestJS 后端
│   ├── src/
│   │   ├── common/         # 响应拦截器/异常过滤器/守卫/装饰器/DTO
│   │   ├── tenant/         # 租户上下文/中间件/订阅器/基类实体
│   │   ├── database/       # 数据源/命名策略/迁移
│   │   ├── seed/           # 幂等种子数据
│   │   ├── entities/       # 22 张表实体
│   │   └── {auth,users,roles,permissions,logs,categories,products,suppliers,customers,purchase,sale,inventory,finance,dashboard}/   # 业务模块
│   └── test/               # e2e 测试
└── web/                    # Vue3 前端
    └── src/views/          # 21 个页面（登录/看板/各业务模块）
```

## 🧪 测试

```bash
npm run test                      # 单测 52 用例 / 7 个套件
npm run test:e2e:init -w server   # 首次：创建并初始化独立测试库 erp_system_test
npm run test:e2e -w server        # e2e 73 用例 / 5 个套件
```

单测覆盖的是「错了不会报错、只会让数据不对」的那部分逻辑：

| 套件                  | 盯住的规则                                                |
| --------------------- | --------------------------------------------------------- |
| `inventory.service`   | 库存事务、防超卖、`FOR UPDATE` 锁                         |
| `sale-orders.service` | 订单状态机（草稿→确认→出库→取消 的守卫分支）、租户隔离    |
| `finance.service`     | 应收应付口径、金额两位小数、4 个聚合查询恒带 `company_id` |
| `permission.service`  | 权限码聚合、菜单树过滤、超管放行、缓存与失效              |
| `no-generator`        | 单号原子分配（见「并发取号」）                            |
| `auth.service`        | 登录、防用户枚举                                          |
| `tool-registry`       | AI 工具的权限过滤                                         |

e2e 里有三组**回归用例，每一条都对应一个真实发生过的缺陷**（修复前必红）：

| 套件             | 盯住的缺陷                                                                                                                                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `concurrency`    | 20 个并发建单不重号；同一订单 5 个并发出库只出库一次、库存只扣一次（修复前 5 次全成功、75→50）；并发确认只生效一次；10 个并发订单抢一半库存不超卖                                                                          |
| `api-contract`   | 11 个列表接口不带参数不再 500；`pageSize` 上限生效；商品/库存列表翻页真的换数据；五个角色的权限矩阵；`@RequirePermissions` 的权限码必须真实存在；收付款幂等（同 `requestId` 提交 5 次只落一条）；收款/删除回写订单已收金额 |
| `login-security` | 四种登录失败返回完全一致的 code 与 message；用户不存在时也跑一次 bcrypt（抹平可用来枚举用户名的时序差）；连续 5 次失败锁定账号，且计数写在数据库里（PM2 集群下同样有效）                                                   |

`api-contract` 里那条「权限码必须真实存在」是根因防护：曾经 `product:view` 等权限码
只写在代码里、没进权限表，守卫精确匹配永远不命中，导致除超管外
**所有角色打开商品/客户/供应商管理都是 403**，而菜单还显示着。现在缺码会直接测试失败。

> **e2e 必须串行跑**（`jest-e2e.json` 里 `maxWorkers: 1`）。5 个套件共用同一个
> `erp_system_test` 库，并行时会互相踩：登录锁定用例会把别的套件正在用的账号锁上，
> 并发用例的清理会删掉别的套件刚建的数据。串行跑完 73 个用例总共 3 秒，不值得为并行冒险。

> **e2e 强制使用独立测试库。** 测试会对 `ai_config` 等表执行清空操作，
> 打到生产库会直接抹掉真实配置。库名不以 `_test` 结尾时 `test/assert-test-db.ts`
> 会直接抛错终止，不依赖任何人记得改环境变量。

## 🧹 代码规范

```bash
npm run lint          # ESLint（含类型感知规则）
npm run lint:fix      # 自动修复
npm run format        # Prettier 格式化
npm run format:check  # 只检查不修改
```

定位是**抓真问题，不管排版**：格式交给 Prettier，ESLint 只保留能抓 bug 的规则
（`no-floating-promises` 漏 await、`no-unused-vars` 死代码、Vue 状态误用等）。
这样存量项目不会一上来报几千条风格警告，最后所有人都学会加 `eslint-disable`。

## 📱 窄屏适配

桌面端的表格在手机上塞不下（商品页 11 列，390px 屏幕只能看到不到 2 列，
文字还被截断）。`components/ResponsiveList.vue` 在 ≤640px 时把表格换成卡片：

```vue
<ResponsiveList :items="list" :fields="cardFields" :loading="loading">
  <el-table>…</el-table>                    <!-- 宽屏走这里 -->
  <template #actions="{ row }">…</template> <!-- 卡片底部的操作按钮 -->
</ResponsiveList>
```

`fields` 里给每个字段声明标签、取值方式，并标出哪个是主字段（卡片标题）、
哪个是状态徽标。已应用：商品、客户、供应商、销售订单、采购订单、实时库存。

> 组件列表页（分类、权限管理）和流水页仍是表格 —— 它们列少，
> 横向滚动可以接受，没有做卡片化。

## 📦 构建产物

前端改为**按需引入 Element Plus**（`unplugin-vue-components`），首屏体积：

|             | 全量引入  | 按需引入                        |
| ----------- | --------- | ------------------------------- |
| 首屏 JS+CSS | 1600.7 KB | **313.8 KB**                    |
| 首屏 gzip   | 449 KB    | **104 KB**                      |
| 最大 chunk  | 1.3 MB    | 524 KB（ECharts，看板页懒加载） |

侧边栏图标原先用 `import * as Icons` 动态取值，打包器无法 tree-shaking，
把约 300 个图标全打进了包里。改成显式映射表 `layout/menu-icons.ts`。

> ⚠️ 在「系统管理 → 权限管理」给菜单选新图标时，必须把该图标加进
> `layout/menu-icons.ts`，否则菜单不显示图标（不报错，只是空白）。

## 🔒 安全须知

| 配置项                      | 说明                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `JWT_SECRET`                | **必填**。启动时强校验：空值 / `.env.example` 占位串 / 长度 < 32 一律拒绝启动。生成：`openssl rand -hex 32`        |
| `CORS_ORIGINS`              | 允许的前端来源（逗号分隔）。默认仅放行 `localhost:5173`，**禁止填 `*`**                                            |
| `TRUST_PROXY`               | 部署在 nginx 后方时设为 `1`，限流才能按真实客户端 IP 统计。无反代时保持 `0`，否则可伪造 `X-Forwarded-For` 绕过限流 |
| `AI_ALLOWED_HOSTS`          | AI 服务商域名白名单。留空表示不限制（仍会拦截 http 与内网地址）                                                    |
| `AI_ALLOW_INSECURE_BASEURL` | 使用内网自建模型（Ollama 等）时设为 `1`，**会关闭 AI 接口地址的 SSRF 防护**                                        |
| `AI_KEY_ENC_SECRET`         | 加密 `ai_config.api_key` 的密钥。留空则从 `JWT_SECRET` 派生。轮换后需重新保存一次 AI 配置                          |

已内置的防护：

- 全局限流（默认 300 次/分·IP），登录接口单独收紧为 8 次/分·IP
- helmet 安全响应头；生产环境启用 CSP，关闭 `X-Powered-By`
- Swagger 仅在非生产环境暴露
- 上传白名单仅位图格式（**不含 svg**），`/uploads` 强制 `Content-Disposition: attachment`
- AI 接口地址出站校验：强制 https、拦截环回/私有/链路本地/云元数据地址，
  并对域名做 DNS 解析后二次校验
- `ai_config.api_key` 以 AES-256-GCM 加密落库
- JWT 可吊销：改密码 / 管理员重置密码 / 停用账号后，已签发 token 在 5 秒内失效

## 🚢 生产部署

```bash
# 1. 构建
npm run build       # server: nest build；web: vite build

# 2. 启动后端（PM2 集群模式，多进程水平扩展）
NODE_ENV=production pm2 start ecosystem.config.js

# 3. 前端静态资源由 nginx 托管，并反向代理 /api 与 /uploads 到后端
```

> `NODE_ENV=production` 时 Swagger 不再暴露，CSP 生效。
> `.env` 权限应为 `600`（含数据库口令与 JWT 密钥）。

```nginx
server {
  listen 80;
  root /path/to/web/dist;
  location /api  { proxy_pass http://127.0.0.1:3000; }
  location /uploads { proxy_pass http://127.0.0.1:3000; }
}
```

## 📈 扩展路径（架构预留）

- **Redis 升级**：当前限流（@nestjs/throttler）与权限缓存为进程内存实现（单机/PM2 集群均可用）。多实例跨进程一致场景，将 `PermissionService` 缓存与 throttler store 替换为 Redis 即可，业务代码零改动
- **多仓库/批次**：`inventory` 表加 `warehouse_id`/`batch_no` 维度即可扩展
- **退货回冲**：新增退货单类型，复用 `InventoryService.movement`（type 扩展 `return`）

## ⚠️ 已知范围

- 已入库/出库订单锁定不可编辑（避免复杂回冲）；取消仅限草稿/已确认
- 商品/供应商/客户删除采用停用（`status=0`）软删除，被业务引用的实体禁止物理删除
- 初始化脚本幂等：已存在种子数据时自动跳过
