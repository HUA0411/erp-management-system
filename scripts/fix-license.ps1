$ErrorActionPreference = 'Stop'
cd 'D:\02_Development\Development\Code\code\接单\企业管理系统'

$credLine = Get-Content "$env:USERPROFILE\.git-credentials" | Where-Object { $_ -match 'github.com' } | Select-Object -First 1
$ghToken = [uri]::UnescapeDataString(($credLine -replace '^https://[^:]+:', '' -replace '@github\.com$', ''))
$headers = @{ Authorization = "token $ghToken"; 'User-Agent' = 'erp-fix' }

# ---- 1. 拉取 SPDX 标准文本 ----
$f = Invoke-RestMethod -Uri 'https://api.github.com/repos/spdx/license-list-data/contents/text/PolyForm-Noncommercial-1.0.0.txt' -Headers $headers -TimeoutSec 20
$b64 = $f.content -replace "`r", '' -replace "`n", ''
$spdx = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)).Trim()

# ---- 2. 从 "## Acceptance" 开始取正文（去掉 SPDX 自带标题行）----
$bodyStart = $spdx.IndexOf('## Acceptance')
if ($bodyStart -lt 0) { throw '未找到 ## Acceptance' }
$body = $spdx.Substring($bodyStart).Trim()

$finalLicense = @"
# PolyForm Noncommercial License 1.0.0

<https://polyformproject.org/licenses/noncommercial/1.0.0>

Required Notice

Copyright 2026 HUA0411

$body
"@

# 防抖校验：标题只出现一次
$titleCount = ([regex]::Matches($finalLicense, 'PolyForm Noncommercial License 1.0.0')).Count
if ($titleCount -ne 1) { throw "标题出现 $titleCount 次，异常" }
"正确文本长度: $($finalLicense.Length) 字符，标题 1 次 ✓"
"`n=== 前 16 行预览 ==="
($finalLicense -split "`n") | Select-Object -First 16

# ---- 3. 写本地 ----
[System.IO.File]::WriteAllText('D:\02_Development\Development\Code\code\接单\企业管理系统\LICENSE', $finalLicense + "`n", [System.Text.UTF8Encoding]::new($false))
Write-Output "本地 LICENSE 已重写"

# ---- 4. 覆盖 5 个远程仓库（先取 sha 再 PUT）----
$targets = @(
    @{ name = 'multi-terminal-ecommerce'; branch = 'master' },
    @{ name = 'resume'; branch = 'main' },
    @{ name = 'java-ai-interview'; branch = 'main' },
    @{ name = 'java-interview-rag'; branch = 'main' },
    @{ name = 'Excel-chat'; branch = 'main' }
)
$contentB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($finalLicense))
foreach ($t in $targets) {
    try {
        $existing = Invoke-RestMethod -Uri "https://api.github.com/repos/HUA0411/$($t.name)/contents/LICENSE" -Headers $headers -TimeoutSec 20
        $body = @{
            message = 'docs: fix PolyForm Noncommercial 1.0.0 license text'
            content = $contentB64
            branch  = $t.branch
            sha     = $existing.sha
        } | ConvertTo-Json
        $null = Invoke-RestMethod -Uri "https://api.github.com/repos/HUA0411/$($t.name)/contents/LICENSE" -Method Put -Headers $headers -Body $body -ContentType 'application/json; charset=utf-8' -TimeoutSec 30
        Write-Output "  [$($t.name)] LICENSE 已修正 ✓"
    } catch {
        Write-Output "  [$($t.name)] 失败: $($_.Exception.Message)"
    }
}
Write-Output '远程修正完成'
