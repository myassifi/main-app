// Invoice Parser Utility Functions
import { InventoryItem } from '@prisma/client';
import * as XLSX from 'xlsx';

/**
 * Parse any XLSX/XLS workbook into inventory items.
 * Reads the first sheet, auto-detects header row, maps columns by name.
 */
export function parseXlsxInvoice(workbook: XLSX.WorkBook): { supplier: string; items: ParsedInventoryItem[] } {
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // Convert to array of arrays (raw rows)
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  if (rows.length < 2) return { supplier: 'unknown', items: [] };

  // Find header row (first row with at least 2 non-empty cells)
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const nonEmpty = rows[i].filter((c: any) => String(c).trim() !== '').length;
    if (nonEmpty >= 2) { headerRowIdx = i; break; }
  }

  const headers = rows[headerRowIdx].map((h: any) => String(h).toLowerCase().trim());

  // Flexible column mapping
  const col = (names: string[]) => {
    for (const n of names) {
      const idx = headers.findIndex(h => h.includes(n));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  // Primary columns matching your Excel structure:
  // make | model | year from | year to | category | fcc id | chip type | supplier | quantity | unit cost | low stock
  const makeCol      = col(['make']);
  const modelCol     = col(['model']);
  const yearFromCol  = col(['year from', 'yearfrom', 'year_from', 'from']);
  const yearToCol    = col(['year to', 'yearto', 'year_to', 'to']);
  const categoryCol  = col(['category', 'cat', 'type']);
  const fccIdCol     = col(['fcc id', 'fccid', 'fcc', 'fcc_id']);
  const chipTypeCol  = col(['chip type', 'chiptype', 'chip', 'key type', 'keytype']);
  const supplierCol  = col(['supplier', 'vendor', 'brand', 'source']);
  const qtyCol       = col(['quantity', 'qty', 'ordered', 'amount']);
  const priceCol     = col(['unit cost', 'price', 'cost', 'each', 'unit price', 'rate']);
  const lowStockCol  = col(['low stock', 'lowstock', 'low_stock', 'threshold', 'reorder']);

  // Detect global supplier from first rows if supplier column absent
  const topText = rows.slice(0, 5).flat().join(' ').toLowerCase();
  let globalSupplier = 'unknown';
  if (topText.includes('key4')) globalSupplier = 'key4.com';
  else if (topText.includes('transponder island')) globalSupplier = 'transponderisland.com';
  else if (topText.includes('xhorse')) globalSupplier = 'xhorse';
  else if (topText.includes('keydiy')) globalSupplier = 'keydiy';
  else if (topText.includes('autel')) globalSupplier = 'autel';

  const items: ParsedInventoryItem[] = [];

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];

    const make     = makeCol !== -1    ? String(row[makeCol] ?? '').trim() : '';
    const model    = modelCol !== -1   ? String(row[modelCol] ?? '').trim() : '';
    const category = categoryCol !== -1 ? String(row[categoryCol] ?? '').trim() : '';
    const fccId    = fccIdCol !== -1   ? String(row[fccIdCol] ?? '').trim() : '';
    const chipType = chipTypeCol !== -1 ? String(row[chipTypeCol] ?? '').trim() : '';
    const rawSupplier = supplierCol !== -1 ? String(row[supplierCol] ?? '').trim() : '';
    const rawQty   = qtyCol !== -1     ? row[qtyCol] : '';
    const rawPrice = priceCol !== -1   ? row[priceCol] : '';
    const rawLowStock = lowStockCol !== -1 ? row[lowStockCol] : '';
    const rawYearFrom = yearFromCol !== -1 ? row[yearFromCol] : '';
    const rawYearTo   = yearToCol !== -1   ? row[yearToCol] : '';

    // Skip completely empty rows
    if (!make && !model && !fccId && !chipType) continue;

    const qty      = parseInt(String(rawQty).replace(/[^0-9]/g, ''), 10) || 0;
    const price    = parseFloat(String(rawPrice).replace(/[^0-9.]/g, '')) || 0;
    const lowStock = parseInt(String(rawLowStock).replace(/[^0-9]/g, ''), 10) || 3;
    const yearFrom = rawYearFrom ? parseInt(String(rawYearFrom).replace(/[^0-9]/g, ''), 10) || null : null;
    const yearTo   = rawYearTo   ? parseInt(String(rawYearTo).replace(/[^0-9]/g, ''), 10) || null : null;

    // Build auto description from make + model + category
    const descParts = [make, model, yearFrom ? String(yearFrom) : '', category].filter(Boolean);
    const description = descParts.join(' ') || fccId || chipType || `ROW-${i}`;

    // Build SKU from fcc id, or fall back to make+model shorthand
    const sku = fccId || [make, model, yearFrom].filter(Boolean).join('-') || `ROW-${i}`;

    items.push({
      sku,
      description,
      price,
      quantity: qty,
      total: price * qty,
      supplier: rawSupplier || globalSupplier,
      category: category || 'Uncategorized',
      make: make || undefined,
      model: model || undefined,
      yearFrom,
      yearTo,
      fccId: fccId || undefined,
      chipType: chipType || undefined,
      lowStockThreshold: lowStock,
    });
  }

  return { supplier: globalSupplier, items };
}

/**
 * Detect supplier from invoice text
 */
export function detectSupplier(text: string): string {
  if (text.includes('KEY4, Inc.') || text.includes('key4.com')) {
    return 'key4';
  }
  if (text.includes('Transponder Island') || text.includes('transponderisland.com')) {
    return 'transponderisland';
  }
  if (text.includes('locksmithkeyless.com')) {
    return 'locksmithkeyless';
  }
  // Some invoices don't include the domain in extracted PDF text; detect by structure.
  // locksmithkeyless-style invoices commonly include explicit SKU lines plus an xN quantity.
  if (/\bSKU\s*:\s*[A-Z0-9\-]{3,}\b/i.test(text) && /\bx\s*\d{1,4}\b/i.test(text)) {
    return 'locksmithkeyless';
  }
  return 'generic';
}

/**
 * Parse Key4.com invoices
 */
export function parseKey4Invoice(text: string): ParsedInventoryItem[] {
  const items: ParsedInventoryItem[] = [];
  
  // Key4 invoice pattern: SKU Description $Price Quantity $Total
  // Example: "CR-XHS-XNBU01EN Xhorse Wireless Flip Remote Key Buick Style 4 Buttons $12.59 4 $50.36"
  
  const lines = text
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0);

  // Look for lines that start with common SKU prefixes
  const skuPattern = /^(CR-|KB-|KS-|AC-|RS-|TK-|TOOL-)[A-Z0-9\-]+/;
  const headerPattern = /^(IMAGE|DESCRIPTION|PRICE|QUANTITY|TOTAL)$/i;
  const priceQtyTotalPattern = /^\$([0-9]+(?:\.[0-9]+)?)\s+(\d+)\s+\$([0-9]+(?:\.[0-9]+)?)/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (headerPattern.test(line)) continue;

    const skuMatch = line.match(skuPattern);
    if (!skuMatch) continue;

    const sku = skuMatch[0];

    // 1) Single-line format: SKU ... $price qty $total
    const singleLineMatch = line.match(new RegExp(`${sku}\\s+(.+?)\\s+\\$([0-9.]+)\\s+(\\d+)\\s+\\$([0-9.]+)`));
    if (singleLineMatch) {
      items.push({
        sku,
        description: singleLineMatch[1].trim(),
        price: parseFloat(singleLineMatch[2]),
        quantity: parseInt(singleLineMatch[3], 10),
        total: parseFloat(singleLineMatch[4]),
        supplier: 'key4.com',
        category: getCategoryFromSKU(sku),
      });
      continue;
    }

    // 2) Multi-line format:
    // SKU
    // description line(s)
    // maybe style/code line(s)
    // $price qty $total
    const descParts: string[] = [];
    let parsedPrice: number | null = null;
    let parsedQty: number | null = null;
    let parsedTotal: number | null = null;

    const lookaheadLimit = 10;
    for (let j = i + 1; j < lines.length && j <= i + lookaheadLimit; j++) {
      const next = lines[j];
      if (headerPattern.test(next)) continue;

      // stop if we hit the next SKU block
      if (skuPattern.test(next)) {
        break;
      }

      const priceMatch = next.match(priceQtyTotalPattern);
      if (priceMatch) {
        parsedPrice = parseFloat(priceMatch[1]);
        parsedQty = parseInt(priceMatch[2], 10);
        parsedTotal = parseFloat(priceMatch[3]);
        i = j; // advance outer loop to the price line
        break;
      }

      // keep as part of description
      descParts.push(next);
    }

    if (parsedPrice !== null && parsedQty !== null && parsedTotal !== null) {
      const description = descParts.join(' ').replace(/\s+/g, ' ').trim();
      items.push({
        sku,
        description,
        price: parsedPrice,
        quantity: parsedQty,
        total: parsedTotal,
        supplier: 'key4.com',
        category: getCategoryFromSKU(sku),
      });
    }
  }
  
  return items;
}

function isLikelyYearRangeSku(sku: string) {
  return /^\d{4}\s*-\s*\d{4}$/.test(sku.trim());
}

export function parseLocksmithKeylessInvoice(text: string): ParsedInventoryItem[] {
  const items: ParsedInventoryItem[] = [];

  const lines = text
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0);

  const skuLinePattern = /^SKU\s*:\s*([A-Z0-9\-]{3,})\b/i;
  const qtyPattern = /\bx\s*(\d{1,4})\b/i;
  const pricePattern = /\$\s*([0-9]+(?:\.[0-9]{1,2})?)/;

  let blockStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const skuMatch = lines[i].match(skuLinePattern);
    if (!skuMatch) continue;

    const sku = skuMatch[1].trim();
    if (!sku || isLikelyYearRangeSku(sku)) {
      blockStart = i + 1;
      continue;
    }

    let quantity = 1;
    let price: number | null = null;

    for (let j = i; j <= Math.min(lines.length - 1, i + 4); j++) {
      const q = lines[j].match(qtyPattern);
      if (q) {
        const parsed = parseInt(q[1], 10);
        if (Number.isFinite(parsed) && parsed > 0) quantity = parsed;
      }
    }

    for (let j = Math.max(0, i - 6); j <= Math.min(lines.length - 1, i + 2); j++) {
      const m = lines[j].match(pricePattern);
      if (m) {
        const parsed = parseFloat(m[1]);
        if (Number.isFinite(parsed)) {
          price = parsed;
          break;
        }
      }
    }

    const descParts: string[] = [];
    for (let j = blockStart; j < i; j++) {
      const l = lines[j];
      if (skuLinePattern.test(l)) continue;
      if (/^No\./i.test(l)) continue;
      if (qtyPattern.test(l) && l.replace(qtyPattern, '').trim().length === 0) continue;
      if (pricePattern.test(l) && l.replace(pricePattern, '').trim().length === 0) continue;
      descParts.push(l);
    }
    const description = descParts.join(' ').replace(/\s+/g, ' ').trim();

    if (price === null || !description) {
      blockStart = i + 1;
      continue;
    }

    items.push({
      sku,
      description,
      price,
      quantity,
      total: price * quantity,
      supplier: 'locksmithkeyless.com',
      category: 'Uncategorized'
    });

    blockStart = i + 1;
  }

  return items;
}

/**
 * Parse Transponder Island invoices
 */
export function parseTransponderIslandInvoice(text: string): ParsedInventoryItem[] {
  const items: ParsedInventoryItem[] = [];
  const lines = text.split('\n');
  
  // Specific patterns for Transponder Island invoices would go here
  // This is a simplified version
  
  const pattern = /([A-Z0-9\-]{5,})\s+(.+?)\s+(\d+)\s+\$([0-9.]+)\s+\$([0-9.]+)/;
  
  lines.forEach(line => {
    const match = line.match(pattern);
    if (match) {
      items.push({
        sku: match[1],
        description: match[2].trim(),
        quantity: parseInt(match[3], 10),
        price: parseFloat(match[4]),
        total: parseFloat(match[5]),
        supplier: 'transponderisland.com',
        category: 'Transponder Keys' // Default category for this supplier
      });
    }
  });
  
  return items;
}

/**
 * Parse generic invoice (fallback)
 */
export function parseGenericInvoice(text: string): ParsedInventoryItem[] {
  // Basic regex patterns for common invoice formats
  const items: ParsedInventoryItem[] = [];
  const lines = text.split('\n');
  
  // Look for lines with: [SKU/Code] [Description] [Price] [Qty]
  const pattern = /([A-Z0-9][A-Z0-9\-]{4,19})\s+(.+?)\s+\$([0-9]+(?:\.[0-9]{1,2})?)\s+(\d+)/;
  
  lines.forEach(line => {
    const match = line.match(pattern);
    if (match) {
      if (isLikelyYearRangeSku(match[1])) return;
      items.push({
        sku: match[1],
        description: match[2].trim(),
        price: parseFloat(match[3]),
        quantity: parseInt(match[4], 10),
        total: parseFloat(match[3]) * parseInt(match[4], 10),
        supplier: 'unknown',
        category: 'Uncategorized'
      });
    }
  });
  
  return items;
}

/**
 * Get category from SKU prefix
 */
export function getCategoryFromSKU(sku: string): string {
  const prefix = sku.split('-')[0];
  const categories: Record<string, string> = {
    'CR': 'Complete Remote/Key',
    'KB': 'Key Blade',
    'KS': 'Key Shell',
    'AC': 'Accessory/Chip',
    'RS': 'Remote Shell',
    'TK': 'Transponder Key',
    'TOOL': 'Tool'
  };
  return categories[prefix] || 'Other';
}

/**
 * Parse any invoice based on detected supplier
 */
export function parseInvoice(text: string): {
  supplier: string;
  items: ParsedInventoryItem[];
} {
  const supplier = detectSupplier(text);
  let items: ParsedInventoryItem[] = [];
  
  if (supplier === 'key4') {
    items = parseKey4Invoice(text);
  } else if (supplier === 'transponderisland') {
    items = parseTransponderIslandInvoice(text);
  } else if (supplier === 'locksmithkeyless') {
    items = parseLocksmithKeylessInvoice(text);
  } else {
    // As a defensive fallback, try the SKU:/xN parser first. If it finds anything,
    // prefer it over the generic regex which is prone to false positives (years/makes).
    const lkItems = parseLocksmithKeylessInvoice(text);
    items = lkItems.length > 0 ? lkItems : parseGenericInvoice(text);
  }
  
  return {
    supplier,
    items
  };
}

/**
 * Interface for parsed inventory items from invoices
 */
export interface ParsedInventoryItem {
  sku: string;
  description: string;
  price: number;
  quantity: number;
  total: number;
  supplier: string;
  category: string;
  make?: string;
  model?: string;
  yearFrom?: number | null;
  yearTo?: number | null;
  fccId?: string;
  chipType?: string;
  lowStockThreshold?: number;
}

/**
 * Convert parsed invoice item to inventory item format
 */
export function mapToInventoryItem(item: ParsedInventoryItem, userId: string): Partial<InventoryItem> {
  return {
    sku: item.sku,
    itemName: item.description,
    cost: item.price,
    quantity: item.quantity,
    supplier: item.supplier || null,
    category: item.category || null,
    keyType: item.chipType || guessKeyTypeFromDescription(item.description),
    make: item.make || guessMakeFromDescription(item.description) || null,
    model: item.model || null,
    yearFrom: item.yearFrom ?? null,
    yearTo: item.yearTo ?? null,
    fccId: item.fccId || null,
    lowStockThreshold: item.lowStockThreshold ?? 3,
    userId
  };
}

/**
 * Guess key type from description
 */
function guessKeyTypeFromDescription(description: string): string {
  const desc = description.toLowerCase();
  
  if (desc.includes('remote') || desc.includes('fob')) return 'Remote';
  if (desc.includes('transponder') || desc.includes('chip')) return 'Transponder';
  if (desc.includes('blade')) return 'Blade';
  if (desc.includes('shell')) return 'Shell';
  
  return 'Other';
}

/**
 * Guess make from description
 */
function guessMakeFromDescription(description: string): string {
  const desc = description.toLowerCase();
  const makes = [
    'toyota', 'honda', 'ford', 'chevrolet', 'gm', 'nissan', 'hyundai', 
    'kia', 'mazda', 'subaru', 'volkswagen', 'vw', 'audi', 'bmw', 
    'mercedes', 'lexus', 'acura', 'infiniti', 'jeep', 'dodge', 'chrysler'
  ];
  
  for (const make of makes) {
    if (desc.includes(make)) {
      return make.charAt(0).toUpperCase() + make.slice(1);
    }
  }
  
  return 'n/a';
}
