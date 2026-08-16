$ErrorActionPreference = 'Stop'
$base = 'http://localhost:3000/api'

function Post-Json($url, $token, $body) {
    $h = @{}
    if ($token) { $h.Authorization = "Bearer $token" }
    Invoke-RestMethod -Uri $url -Method Post -Headers $h -ContentType 'application/json' -Body ($body | ConvertTo-Json -Depth 8)
}
function Put-Json($url, $token, $body) {
    Invoke-RestMethod -Uri $url -Method Put -Headers @{ Authorization = "Bearer $token" } -ContentType 'application/json' -Body ($body | ConvertTo-Json -Depth 8)
}
function Get-Auth($url, $token) { Invoke-RestMethod -Uri $url -Headers @{ Authorization = "Bearer $token" } }

$login = Post-Json "$base/auth/login" $null @{ companyCode = 'DEMO'; username = 'admin'; password = '123456' }
$token = $login.data.token
"== 登录: $($login.data.user.username) / $($login.data.user.companyName) / perms=$($login.data.user.permissions.Count)"

# 采购闭环：新建 → 确认 → 入库 → 库存增加
$po = Post-Json "$base/purchase-orders" $token @{ supplierId = 1; orderDate = '2026-08-16'; remark = '闭环测试'; items = @(@{ productId = 1; quantity = 50; price = 120 }) }
$poId = [int]$po.data.id
"== 新建采购订单 #${poId}: $($po.data.orderNo) 总额=$($po.data.totalAmount) 状态=$($po.data.status)"
$null = Put-Json "$base/purchase-orders/$poId/confirm" $token @{}
$inv1 = Get-Auth "$base/inventory?page=1&pageSize=200" $token
$qty1 = [double](($inv1.data.list | Where-Object { $_.productId -eq 1 }).quantity)
$wh = Put-Json "$base/purchase-orders/$poId/warehouse" $token @{}
"== 确认->入库: $($wh.inboundNo)"
$inv2 = Get-Auth "$base/inventory?page=1&pageSize=200" $token
$qty2 = [double](($inv2.data.list | Where-Object { $_.productId -eq 1 }).quantity)
"== P001 库存: $qty1 -> $qty2 (期望 +50, 差=$($qty2 - $qty1))"

# 销售闭环：新建 → 确认 → 出库 → 库存减少
$so = Post-Json "$base/sale-orders" $token @{ customerId = 1; orderDate = '2026-08-16'; remark = '闭环测试'; items = @(@{ productId = 1; quantity = 30; price = 199 }) }
$soId = [int]$so.data.id
$null = Put-Json "$base/sale-orders/$soId/confirm" $token @{}
$ob = Put-Json "$base/sale-orders/$soId/outbound" $token @{}
"== 新建销售订单 #${soId} -> 确认 -> 出库: $($ob.outboundNo)"
$inv3 = Get-Auth "$base/inventory?page=1&pageSize=200" $token
$qty3 = [double](($inv3.data.list | Where-Object { $_.productId -eq 1 }).quantity)
"== P001 库存: $qty2 -> $qty3 (期望 -30, 差=$($qty3 - $qty2))"

# 超卖拦截
$so2 = Post-Json "$base/sale-orders" $token @{ customerId = 1; orderDate = '2026-08-16'; items = @(@{ productId = 1; quantity = 99999; price = 199 }) }
$so2Id = [int]$so2.data.id
$null = Put-Json "$base/sale-orders/$so2Id/confirm" $token @{}
try {
    $null = Put-Json "$base/sale-orders/$so2Id/outbound" $token @{}
    "== 超卖尝试: 未拦截 (FAIL!)"
} catch {
    $errBody = $_.ErrorDetails.Message | ConvertFrom-Json
    "== 超卖尝试: 已拦截 code=$($errBody.code) msg=$($errBody.message)"
}
$inv4 = Get-Auth "$base/inventory?page=1&pageSize=200" $token
$qty4 = [double](($inv4.data.list | Where-Object { $_.productId -eq 1 }).quantity)
"== 超卖后库存未变: $qty3 == $qty4 ? $($qty3 -eq $qty4)"

# 流水
$recs = Get-Auth "$base/inventory/records?page=1&pageSize=8" $token
"== 最近流水:"
$recs.data.list | ForEach-Object { "   $($_.type) 数量=$($_.quantity) 结余=$($_.balanceAfter) 来源=$($_.refNo) 操作人=$($_.operator)" }

# 盘点 +5
$stocktake = Post-Json "$base/stocktakes" $token @{ remark = '冒烟盘点'; items = @(@{ productId = 1; actualQty = $qty4 + 5 }) }
$stId = [int]$stocktake.data.id
$null = Put-Json "$base/stocktakes/$stId/confirm" $token @{}
$inv5 = Get-Auth "$base/inventory?page=1&pageSize=200" $token
$qty5 = [double](($inv5.data.list | Where-Object { $_.productId -eq 1 }).quantity)
"== 盘点 +5: $qty4 -> $qty5 ? $($qty5 -eq ($qty4 + 5))"

# 收付款 + 应收汇总
$pay = Post-Json "$base/payments" $token @{ type = 'receive'; partnerType = 'customer'; partnerId = 1; amount = 3000; orderNo = $so.data.orderNo; payDate = '2026-08-16'; method = '银行转账' }
"== 登记收款: $($pay.docNo) $($pay.amount)"
$acc = Get-Auth "$base/finance/accounts" $token
$cus1 = $acc.data | Where-Object { $_.partnerType -eq 'customer' -and $_.partnerId -eq 1 }
"== 应收汇总(客户1): total=$($cus1.totalAmount) paid=$($cus1.paidAmount) balance=$($cus1.balance)"

# 看板联动
$dash = Get-Auth "$base/dashboard/summary" $token
"== 看板: 本月销售=$($dash.data.monthSaleAmount) 待入库=$($dash.data.pendingInboundCount) 低库存=$($dash.data.lowStockCount)"
"== 完成"
