# 企业 ERP 进销存管理系统

多租户企业级核心业务系统，覆盖 **采购 → 入库 → 库存 → 销售 → 出库 → 财务往来 → 数据看板** 完整业务闭环。
后端 NestJS + TypeORM + MySQL（共享库行级隔离），前端 Vue3 + Element Plus + ECharts，全栈 TypeScript。

## ✨ 功能一览

| 模块 | 功能 |
|---|---|
| 数据看板 | 今日/本月销售额、待入库、低库存预警、应收应付汇总、近 30 天销售趋势图、热销商品 TOP、最近单据 |
| 基础资料 | 商品分类（树形）、商品管理、供应商管理、客户管理（CRUD + 分页 + 筛选） |
| 采购管理 | 采购订单（草稿→确认→**入库**）、采购入库单，入库事务内自动增加库存并写流水 |
| 销售管理 | 销售订单（草稿→确认→**出库**）、销售出库单，出库 `FOR UPDATE` 锁行防超卖 |
| 库存管理 | 实时库存、库存流水（全量追溯）、库存预警（低于安全库存）、库存盘点（差异调整）、手工调整 |
| 财务管理 | 收付款单（收款/付款）、应收应付往来汇总 |
| 系统管理 | 用户管理（RBAC 角色分配）、角色管理（菜单+按钮权限树授权）、菜单权限、操作日志审计 |
| 平台能力 | 多租户行级隔离（`company_id` 全链路强制）、JWT 认证、按钮级权限指令、Swagger 文档 |

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

复制并修改环境变量文件：

```bash
copy server\.env.example server\.env   # Windows
# 修改 DB_HOST / DB_PORT / DB_USERNAME / DB_PASSWORD / DB_DATABASE / JWT_SECRET
```

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

| 账号 | 公司 | 角色 | 说明 |
|---|---|---|---|
| `admin` | DEMO 演示科技有限公司 | 超级管理员 | 全部权限 |
| `zhangsan` | DEMO | 采购员 | 采购/入库/看板 |
| `lisi` | DEMO | 销售员 | 销售/出库/看板 |
| `wangwu` | DEMO | 仓管员 | 库存/盘点/出入库单 |
| `zhaoliu` | DEMO | 财务 | 收付款/往来账 |
| `t2admin` | T2 测试公司 | 超级管理员 | **租户隔离验证**：登录后看不到 DEMO 任何数据 |

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

### 库存一致性（防超卖）
- 入库/出库/盘点均在数据库事务内完成：**订单状态 + 库存行 + 流水** 三处原子一致，失败整体回滚
- 出库对库存行执行 `SELECT ... FOR UPDATE` 锁行，扣减前校验非负，杜绝并发超卖
- 流水记录 `balance_after` 结余，任意一笔变动可追溯来源单号（`ref_type`/`ref_no`）

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
npm run test        # 单测：库存事务、防超卖、认证（13 用例）
npm run test:e2e    # e2e：租户隔离、跨租户 404、防超卖、RBAC 403、登录鉴权（7 用例，需数据库已初始化）
```

## 🚢 生产部署

```bash
# 1. 构建
npm run build       # server: nest build；web: vite build

# 2. 启动后端（PM2 集群模式，多进程水平扩展）
pm2 start ecosystem.config.js

# 3. 前端静态资源由 nginx 托管，并反向代理 /api 与 /uploads 到后端
```

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
