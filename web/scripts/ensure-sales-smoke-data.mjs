import "dotenv/config";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not configured");

const client = new pg.Client({ connectionString });

try {
  await client.connect();
  const { rows: lots } = await client.query(`
    SELECT il.id, il."itemId", il."warehouseId", il.quantity, il."lotNumber",
           i."companyId", i.code AS "itemCode", i.name AS "itemName", w.code AS "warehouseCode"
    FROM "InventoryLot" il
    JOIN "Item" i ON i.id = il."itemId"
    JOIN "Company" c ON c.id = i."companyId"
    JOIN "Warehouse" w ON w.id = il."warehouseId"
    WHERE il.status = 'AVAILABLE' AND il.quantity >= 2 AND i.status = 'ACTIVE' AND c.status = 'ACTIVE'
    ORDER BY il.quantity DESC
    LIMIT 1
  `);
  const lot = lots[0];
  if (!lot) throw new Error("找不到至少有 2 單位可用庫存的啟用品項");

  const { rows: priceLists } = await client.query(`
    INSERT INTO "PriceList" ("companyId", code, name, type, currency, status, "updatedAt")
    VALUES ($1, 'TEST-SALES', '銷售流程測試價格表', 'SHARED', 'TWD', 'ACTIVE', NOW())
    ON CONFLICT ("companyId", code) DO UPDATE SET name = EXCLUDED.name, status = 'ACTIVE', "updatedAt" = NOW()
    RETURNING id
  `, [lot.companyId]);
  const priceListId = priceLists[0].id;
  await client.query(`
    INSERT INTO "PriceListItem" ("priceListId", "itemId", "unitPrice", "updatedAt")
    VALUES ($1, $2, 120, NOW())
    ON CONFLICT ("priceListId", "itemId") DO UPDATE SET "unitPrice" = 120, "updatedAt" = NOW()
  `, [priceListId, lot.itemId]);
  const { rows: customers } = await client.query(`
    INSERT INTO "Customer" ("companyId", "priceListId", code, name, "legalName", address, "invoiceAddress", "contactName", phone, "paymentTerms", "salesOwner", status, "updatedAt")
    VALUES ($1, $2, 'C999999', '銷售流程測試客戶', '銷售流程測試客戶', '測試市測試區測試路 1 號', '測試市測試區測試路 1 號', '測試收件人', '02-0000-0000', '測試付款條件', 'TEST', 'ACTIVE', NOW())
    ON CONFLICT (code) DO UPDATE SET "companyId" = EXCLUDED."companyId", "priceListId" = EXCLUDED."priceListId", status = 'ACTIVE', address = EXCLUDED.address, "invoiceAddress" = EXCLUDED."invoiceAddress", "updatedAt" = NOW()
    RETURNING id, code
  `, [lot.companyId, priceListId]);
  const customer = customers[0];

  console.log(JSON.stringify({ customerId: customer.id, customerCode: customer.code, itemId: lot.itemId, itemCode: lot.itemCode, itemName: lot.itemName, warehouseId: lot.warehouseId, warehouseCode: lot.warehouseCode, inventoryLotId: lot.id, lotNumber: lot.lotNumber, availableQuantity: String(lot.quantity), unitPrice: "120" }));
} finally {
  await client.end();
}
