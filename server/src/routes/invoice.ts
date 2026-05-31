import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { parseInvoice, parseXlsxInvoice, mapToInventoryItem } from '../utils/invoiceParser';
import type { ParsedInventoryItem } from '../utils/invoiceParser';
import * as XLSX from 'xlsx';

const router = express.Router();
const prisma = new PrismaClient();

// Configure multer for invoice PDF uploads
const isProduction = process.env.NODE_ENV === 'production';
const rootDir = isProduction ? path.join(__dirname, '../../..') : path.join(__dirname, '../..');
const invoiceUploadDir = path.join(rootDir, 'uploads/invoices');

// Ensure the invoices directory exists
if (!fs.existsSync(invoiceUploadDir)) {
  fs.mkdirSync(invoiceUploadDir, { recursive: true });
  console.log(`Created invoice upload directory at ${invoiceUploadDir}`);
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, invoiceUploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const XLSX_MIMETYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream',
];

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.xlsx' || ext === '.xls' || XLSX_MIMETYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx / .xls) are allowed') as any, false);
    }
  }
});

// Auth request interface (matches the one in index.ts)
interface AuthRequest extends Request {
  userId?: string;
}

// POST route for invoice upload and parsing
router.post('/import-invoice', upload.single('invoice'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();
    const dataBuffer = fs.readFileSync(filePath);

    console.log(`Attempting to parse XLSX from path: ${filePath}`);
    console.log(`File size: ${dataBuffer.length} bytes`);

    let supplier: string = 'unknown';
    let items: ParsedInventoryItem[] = [];

    try {
      const workbook = XLSX.read(dataBuffer, { type: 'buffer' });
      const result = parseXlsxInvoice(workbook);
      supplier = result.supplier;
      items = result.items;
      console.log(`XLSX parsed successfully, found ${items.length} items`);
    } catch (parseError: any) {
      console.error('XLSX parsing internal error:', parseError);
      throw new Error(`XLSX parsing failed: ${parseError.message || 'Unknown error'}`);
    }
    
    // Clean up uploaded file
    // fs.unlinkSync(filePath);
    
    res.json({
      success: true,
      supplier: supplier,
      items: items,
      totalItems: items.length,
      totalValue: items.reduce((sum: number, item: ParsedInventoryItem) => sum + item.price * item.quantity, 0),
    });
    
  } catch (error) {
    console.error('Invoice parsing error:', error);
    
    // More detailed error response
    let errorMessage = 'Failed to parse invoice';
    let errorDetails = error instanceof Error ? error.message : 'Unknown error';
    
    if (error instanceof Error && error.message.includes('Failed to load PDF file')) {
      errorMessage = 'Invalid or corrupted PDF file';
    } else if (error instanceof Error && error.message.includes('PDF parsing failed')) {
      errorMessage = 'Could not extract text from PDF';
    }
    
    res.status(500).json({ 
      error: errorMessage, 
      details: errorDetails
    });
  }
});

// POST route for bulk adding items from invoice
router.post('/bulk-add', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { items } = req.body;
    
    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'No items provided' });
    }
    
    // Process each item
    const results = [];

    const existingItems = await prisma.inventoryItem.findMany({
      where: {
        userId: req.userId,
        sku: { not: null }
      },
      select: {
        id: true,
        sku: true,
        quantity: true
      }
    });

    const existingByNormalizedSku = new Map<
      string,
      { id: string; sku: string | null; quantity: number }
    >();

    for (const existing of existingItems) {
      const normalized = (existing.sku || '').trim().toUpperCase();
      if (!normalized) continue;
      if (!existingByNormalizedSku.has(normalized)) {
        existingByNormalizedSku.set(normalized, {
          id: existing.id,
          sku: existing.sku,
          quantity: existing.quantity
        });
      }
    }
    
    for (const item of items) {
      const rawSku = typeof item?.sku === 'string' ? item.sku : '';
      const normalizedSku = rawSku.trim().toUpperCase();

      const parsedQty =
        typeof item?.quantity === 'number'
          ? item.quantity
          : parseInt(String(item?.quantity ?? '0'), 10);
      const quantity = Number.isFinite(parsedQty) ? parsedQty : 0;

      const parsedPrice =
        typeof item?.price === 'number' ? item.price : parseFloat(String(item?.price ?? '0'));
      const price = Number.isFinite(parsedPrice) ? parsedPrice : 0;

      // Check if item already exists
      const existing = normalizedSku ? existingByNormalizedSku.get(normalizedSku) : undefined;
      
      if (existing) {
        // Update quantity
        await prisma.inventoryItem.update({
          where: { id: existing.id },
          data: {
            quantity: { increment: quantity },
            updatedAt: new Date(),
            ...(existing.sku !== normalizedSku ? { sku: normalizedSku } : {})
          }
        });

        existing.quantity += quantity;
        existing.sku = normalizedSku;
        results.push({ 
          sku: normalizedSku, 
          action: 'updated', 
          quantity: quantity,
          newTotal: existing.quantity
        });
      } else {
        // Insert new item
        const inventoryItem = mapToInventoryItem(
          {
            ...item,
            sku: normalizedSku,
            quantity,
            price,
            description: typeof item?.description === 'string' ? item.description : String(item?.description ?? '')
          },
          req.userId
        );
        
        const created = await prisma.inventoryItem.create({
          data: inventoryItem as any,
          select: { id: true, sku: true, quantity: true }
        });

        if (normalizedSku) {
          existingByNormalizedSku.set(normalizedSku, {
            id: created.id,
            sku: created.sku,
            quantity: created.quantity
          });
        }
        results.push({ 
          sku: normalizedSku, 
          action: 'added', 
          quantity: quantity 
        });
      }
    }
    
    // Emit inventory changed event
    // This would need access to the emitChange function from index.ts
    // For now, we'll rely on the client refreshing

    res.json({
      success: true,
      message: `${items.length} items processed`,
      results: results
    });
    
  } catch (error) {
    console.error('Bulk add error:', error);
    res.status(500).json({ 
      error: 'Failed to add items to inventory',
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

export default router;
