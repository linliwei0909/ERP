# P2 主檔 CSV 匯入契約

版本日期：2026-07-25
適用範圍：P2.6 小量測試匯入與後續正式移轉前置契約

## 1. 共通規則

- 檔案必須為 UTF-8 `.csv`，MIME type 限 `text/csv`、`application/csv` 或 `application/vnd.ms-excel`。
- 單檔上限由 `IMPORT_MAX_FILE_BYTES` 控制，預設 1 MiB。
- 第一列必須與 template header 完全一致；欄位不得缺少、增加或重複。
- `legacy_id` 是來源系統識別，只保存在 `legacy_id_map`，不得當作正式 UUID。
- 空字串視為未提供；boolean 只接受 `true`／`false`；日期使用 `YYYY-MM-DD`。
- code 類欄位依正式 service 執行 NFKC、trim、uppercase；條碼 trim；國別碼 uppercase。
- `status` 只接受 `ACTIVE`／`INACTIVE`。
- CSV 值永遠作為純文字解析，不執行公式、巨集或程式。顯示 issue 時，開頭為 `=`, `+`, `-`, `@` 的儲存格會加上單引號。
- Issue 的 `source_data_json` 使用既有 sensitive-data redaction；production log 不記錄整列或 CSV 原文。
- 原始檔案不永久保存。

## 2. 匯入順序

1. `customers`
2. `customer_companies`
3. `customer_contacts`
4. `delivery_locations`
5. `items`
6. `item_companies`
7. `price_lists`
8. `item_prices`
9. `customer_price_list_assignments`
10. `freight_rules`

P2.6 已實作 importer：`customers`, `customer_companies`, `items`, `item_companies`。其餘六類只提供 template 與 validation contract，尚未宣稱可正式執行。

## 3. customers

| 欄位 | 必填 | 型別／格式 | Normalization／允許值 | 關聯 | 錯誤範例 |
| --- | --- | --- | --- | --- | --- |
| `legacy_id` | 是 | text, 1–255 | trim；同來源與 entity 唯一 | — | 空白、重複 `C001` |
| `company_code` | 是 | text | NFKC／trim／uppercase | 必須是操作者已授權公司 | `UNKNOWN` |
| `customer_code` | 是 | text, 1–50 | NFKC／trim／uppercase | 公司內唯一 | 空白 |
| `customer_type` | 是 | enum | `DOMESTIC`, `FOREIGN` | — | `LOCAL` |
| `name` | 是 | text, 1–200 | trim | — | 空白 |
| `tax_id` | 境內選填 | text | NFKC／trim／uppercase、移除空白與 `-` | 有值時全系統唯一 | 重複統編 |
| `country_code` | 境外必填 | ISO alpha-2 | uppercase | — | `TWX` |
| `foreign_identifier` | 境外必填 | text | NFKC／trim／uppercase | 與國別組合唯一 | 空白 |

## 4. customer_companies

| 欄位 | 必填 | 型別／格式 | Normalization／允許值 | 關聯 | 錯誤範例 |
| --- | --- | --- | --- | --- | --- |
| `legacy_id` | 是 | text | trim、來源唯一 | — | 空白 |
| `customer_legacy_id` | 是 | text | trim | 必須已有 `customers` mapping | `C404` |
| `company_code` | 是 | text | NFKC／trim／uppercase | 已授權公司 | 未授權公司 |
| `customer_code` | 是 | text, 1–50 | NFKC／trim／uppercase | 公司內唯一 | 重複代碼 |
| `status` | 是 | enum | `ACTIVE`, `INACTIVE` | — | `ENABLED` |

## 5. customer_contacts

| 欄位 | 必填 | 型別／格式 | Normalization／允許值 | 關聯 | 錯誤範例 |
| --- | --- | --- | --- | --- | --- |
| `legacy_id` | 是 | text | trim、來源唯一 | — | 空白 |
| `customer_legacy_id` | 是 | text | trim | `customers` mapping | 缺少父 mapping |
| `name` | 是 | text | trim | — | 空白 |
| `department`, `job_title`, `notes` | 否 | text | trim | — | 超長文字 |
| `phone`, `mobile`, `email` | 至少一項 | text | trim；email 格式 | — | 三者皆空 |
| `is_primary` | 是 | boolean | `true`, `false` | 同客戶最多一位有效主要聯絡人 | `1` |
| `status` | 是 | enum | `ACTIVE`, `INACTIVE` | — | `Y` |

## 6. delivery_locations

| 欄位 | 必填 | 型別／格式 | Normalization／允許值 | 關聯 | 錯誤範例 |
| --- | --- | --- | --- | --- | --- |
| `legacy_id` | 是 | text | trim、來源唯一 | — | 空白 |
| `customer_legacy_id` | 是 | text | trim | `customers` mapping | 缺少父 mapping |
| `code`, `name`, `recipient_name`, `phone`, `address_line`, `full_address` | 是 | text | trim；code 同客戶唯一 | customer | 空白 code |
| `postal_code`, `city`, `district`, `notes` | 否 | text | trim | — | 欄位超長 |
| `is_default` | 是 | boolean | `true`, `false` | 同客戶最多一個有效預設地點 | `yes` |
| `status` | 是 | enum | `ACTIVE`, `INACTIVE` | — | `DELETED` |

## 7. items

| 欄位 | 必填 | 型別／格式 | Normalization／允許值 | 關聯 | 錯誤範例 |
| --- | --- | --- | --- | --- | --- |
| `legacy_id` | 是 | text | trim、來源唯一 | — | 空白 |
| `company_code` | 是 | text | NFKC／trim／uppercase | 已授權公司 | 未授權公司 |
| `company_item_code` | 是 | text | NFKC／trim／uppercase | 公司內唯一 | 空白 |
| `code` | 是 | text | NFKC／trim／uppercase | 全系統唯一 | normalization 後重複 |
| `name`, `base_unit` | 是 | text | trim | — | 空白 |
| `description`, `specification` | 否 | text | trim | — | — |
| `barcode` | 否 | text | trim | 有值時全系統唯一 | 重複條碼 |
| `item_type` | 是 | enum | `PRODUCT`, `RAW_MATERIAL` | — | `SERVICE` |
| 四個用途旗標 | 是 | boolean | `true`, `false` | 僅能力旗標 | `Y` |

## 8. item_companies

| 欄位 | 必填 | 型別／格式 | Normalization／允許值 | 關聯 | 錯誤範例 |
| --- | --- | --- | --- | --- | --- |
| `legacy_id` | 是 | text | trim、來源唯一 | — | 空白 |
| `item_legacy_id` | 是 | text | trim | `items` mapping | 缺少父 mapping |
| `company_code` | 是 | text | NFKC／trim／uppercase | 已授權公司 | 未授權公司 |
| `company_item_code` | 是 | text | NFKC／trim／uppercase | 公司內唯一 | 重複代碼 |
| `sales_enabled` | 是 | boolean | `true`, `false` | — | `1` |
| `status` | 是 | enum | `ACTIVE`, `INACTIVE` | — | `ENABLED` |

## 9. price_lists

| 欄位 | 必填 | 型別／格式 | Normalization／允許值 | 關聯 | 錯誤範例 |
| --- | --- | --- | --- | --- | --- |
| `legacy_id`, `company_code`, `code`, `name`, `status` | 是 | 依正式主檔 | code NFKC／trim／uppercase；status 正式值域 | company | 重複公司 code |

## 10. item_prices

| 欄位 | 必填 | 型別／格式 | Normalization／允許值 | 關聯 | 錯誤範例 |
| --- | --- | --- | --- | --- | --- |
| `legacy_id`, `price_list_legacy_id`, `item_legacy_id`, `unit_price`, `valid_from`, `status` | 是 | 未稅價 `numeric(18,5)`、日期 | 單價非負；半開期間 | price list、item mapping | 重疊期間 |
| `valid_to` | 否 | `YYYY-MM-DD` | 必須晚於 `valid_from` | — | 與生效日相同 |

## 11. customer_price_list_assignments

| 欄位 | 必填 | 型別／格式 | Normalization／允許值 | 關聯 | 錯誤範例 |
| --- | --- | --- | --- | --- | --- |
| `legacy_id`, `customer_legacy_id`, `company_code`, `price_list_legacy_id`, `valid_from`, `status` | 是 | text／日期／enum | 半開期間 | customer、company、price list mapping | 跨公司價格表 |
| `valid_to` | 否 | `YYYY-MM-DD` | 晚於生效日 | — | 重疊指派 |

## 12. freight_rules

| 欄位 | 必填 | 型別／格式 | Normalization／允許值 | 關聯 | 錯誤範例 |
| --- | --- | --- | --- | --- | --- |
| `legacy_id`, `customer_legacy_id`, `company_code`, `delivery_location_legacy_id`, `mode`, `valid_from`, `status` | 是 | text／日期／enum | mode 正式值域；半開期間 | customer、company、location mapping | 其他客戶地點 |
| `unit_freight` | 按數量必填 | `numeric(18,0)` | 非負 | — | 負數 |
| `fixed_freight` | 固定模式必填 | `numeric(18,0)` | 非負 | — | 免運仍填金額 |
| `valid_to` | 否 | `YYYY-MM-DD` | 晚於生效日 | — | 重疊期間 |

## 13. 匯入框架完成度

- 已完成：四類 importer 的 CSV 解析、typed validation、normalization、檔內／DB duplicate、legacy mapping、dry-run、execute、issues、summary、reconciliation、idempotent rerun。
- 契約完成但 importer 尚未實作：contacts、locations、price lists、item prices、assignments、freight rules。
- 尚未執行任何完整 Ragic 正式資料移轉。
