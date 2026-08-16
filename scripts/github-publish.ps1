$ErrorActionPreference = 'Stop'
cd 'D:\02_Development\Development\Code\code\接单\企业管理系统'

# ---- 1. 提取 GitHub 凭据（不打印 token） ----
$credLine = Get-Content "$env:USERPROFILE\.git-credentials" | Where-Object { $_ -match 'github.com' } | Select-Object -First 1
if (-not $credLine) { throw '未找到 .git-credentials 中的 github.com 凭据' }
$ghToken = [uri]::UnescapeDataString(($credLine -replace '^https://[^:]+:', '' -replace '@github\.com$', ''))
$ghUser = [uri]::UnescapeDataString(($credLine -replace '^https://', '' -split ':' | Select-Object -First 1))
Write-Output "GitHub 用户: $ghUser（token 长度 $($ghToken.Length)）"
$headers = @{ Authorization = "token $ghToken"; 'User-Agent' = 'erp-publish' }
$repoName = 'erp-management-system'

# ---- 2. 创建公开仓库（不存在时） ----
$repoUrl = "https://github.com/$ghUser/$repoName"
try {
    $null = Invoke-RestMethod -Uri "https://api.github.com/repos/$ghUser/$repoName" -Headers $headers -TimeoutSec 15
    Write-Output "仓库已存在: $repoUrl"
} catch {
    $body = @{
        name = $repoName
        description = 'Enterprise ERP system (multi-tenant, NestJS + TypeORM + MySQL, Vue3 + Element Plus) - purchase/sales/inventory/finance'
        private = $false
        auto_init = $false
    } | ConvertTo-Json
    $new = Invoke-RestMethod -Uri 'https://api.github.com/user/repos' -Method Post -Headers $headers -Body $body -TimeoutSec 20
    Write-Output "仓库创建成功: $($new.html_url)"
}

# ---- 3. 本地提交 ----
git add -A
git commit -m "feat: 企业 ERP 进销存管理系统（多租户）

- NestJS + TypeORM + MySQL，多租户行级隔离（company_id 全链路强制）
- Vue3 + Element Plus + ECharts，21 个页面，RBAC 按钮级权限
- 采购入库/销售出库事务化，FOR UPDATE 防超卖，库存流水全量追溯
- 收付款/应收应付/数据看板，Swagger 文档，单测 13 + e2e 7
- PolyForm Noncommercial 1.0.0 授权（商用需单独授权）"

# ---- 4. 配置 remote 并推送 ----
git remote remove origin 2>$null
git remote add origin "https://github.com/$ghUser/$repoName.git"
git branch -M main
git push -u origin main
Write-Output "推送完成: $repoUrl"
