$ErrorActionPreference = 'Stop'
cd 'D:\02_Development\Development\Code\code\接单\企业管理系统'

$credLine = Get-Content "$env:USERPROFILE\.git-credentials" | Where-Object { $_ -match 'github.com' } | Select-Object -First 1
$ghToken = [uri]::UnescapeDataString(($credLine -replace '^https://[^:]+:', '' -replace '@github\.com$', ''))
$headers = @{ Authorization = "token $ghToken"; 'User-Agent' = 'erp-publish' }

# ---- 1. 拉取 SPDX 官方标准文本 ----
$f = Invoke-RestMethod -Uri 'https://api.github.com/repos/spdx/license-list-data/contents/text/PolyForm-Noncommercial-1.0.0.txt' -Headers $headers -TimeoutSec 20
$b64 = $f.content -replace "`r", '' -replace "`n", ''
$spdx = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)).TrimEnd("`n")

# ---- 2. 构造带版权声明的标准 LICENSE ----
$license = @"
# PolyForm Noncommercial License 1.0.0

<https://polyformproject.org/licenses/noncommercial/1.0.0>

Required Notice

Copyright 2026 HUA0411

"@ + $spdx

# 去掉 SPDX 文本自带的标题行（避免重复），保留 ## Acceptance 起的正文
$lines = $license -split "`n"
$bodyStart = -1
for ($i = 0; $i -lt $lines.Length; $i++) { if ($lines[$i] -match '^## Acceptance') { $bodyStart = $i; break } }
if ($bodyStart -lt 0) { throw '未找到 SPDX 正文起始行' }
$finalLicense = (($lines | Select-Object -First ($bodyStart + 0)) -join "`n").TrimEnd() + "`n`n" + (($lines | Select-Object -Skip $bodyStart) -join "`n")
# 上面只是把 ## 保留；直接输出完整文本：
$finalLicense = $license
$finalLicense = $finalLicense -replace "`r`n", "`n"
"LICENSE 最终文本长度: $($finalLicense.Length)"

# ---- 3. 本地 ERP 仓库 LICENSE 替换（去掉 Kun 定制版）----
$localPath = 'D:\02_Development\Development\Code\code\接单\企业管理系统\LICENSE'
[System.IO.File]::WriteAllText($localPath, $finalLicense + "`n", [System.Text.UTF8Encoding]::new($false))
Write-Output '本地 LICENSE 已替换为官方标准版'

# ---- 4. 批量写入 5 个远程仓库 ----
$targets = @(
    @{ name = 'multi-terminal-ecommerce'; branch = 'master' },
    @{ name = 'resume'; branch = 'main' },
    @{ name = 'java-ai-interview'; branch = 'main' },
    @{ name = 'java-interview-rag'; branch = 'main' },
    @{ name = 'Excel-chat'; branch = 'main' }
)
$contentB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($finalLicense))
foreach ($t in $targets) {
    $body = @{
        message = 'docs: add PolyForm Noncommercial 1.0.0 license'
        content = $contentB64
        branch  = $t.branch
    } | ConvertTo-Json
    try {
        $null = Invoke-RestMethod -Uri "https://api.github.com/repos/HUA0411/$($t.name)/contents/LICENSE" -Method Put -Headers $headers -Body $body -ContentType 'application/json; charset=utf-8' -TimeoutSec 30
        Write-Output "  [$($t.name)] LICENSE 已创建 ✓（分支 $($t.branch)）"
    } catch {
        Write-Output "  [$($t.name)] 失败: $($_.Exception.Message)"
    }
}
Write-Output '批量授权完成'
