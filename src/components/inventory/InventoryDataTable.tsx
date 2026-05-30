import { Edit, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/format';

interface InventoryItem {
  id: string;
  item_name?: string;
  sku: string;
  key_type: string;
  quantity: number;
  cost?: number;
  supplier?: string;
  category?: string;
  make?: string;
  model?: string;
  module?: string;
  total_cost_value?: number;
  fcc_id?: string;
  low_stock_threshold?: number;
  year_from?: number;
  year_to?: number;
  created_at?: string;
}

interface InventoryDataTableProps {
  data: InventoryItem[];
  showReorderNeed?: boolean;
  onQuantityChange: (id: string, newQuantity: number) => Promise<void>;
  onEdit: (item: InventoryItem) => void;
  onDelete: (id: string) => Promise<void>;
}

export function InventoryDataTable({ data, showReorderNeed, onQuantityChange, onEdit, onDelete }: InventoryDataTableProps) {
  return (
    <div className="rounded-md border">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="p-3 text-left text-sm font-medium">Item / Vehicle</th>
            <th className="p-3 text-left text-sm font-medium">SKU</th>
            <th className="p-3 text-left text-sm font-medium hidden md:table-cell">Category</th>
            <th className="p-3 text-right text-sm font-medium">Quantity</th>
            {showReorderNeed && (
              <th className="p-3 text-right text-sm font-medium">Need</th>
            )}
            <th className="p-3 text-right text-sm font-medium">Unit Cost</th>
            <th className="p-3 text-left text-sm font-medium">Supplier</th>
            <th className="p-3 text-right text-sm font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {data.map((item) => {
            const isLowStock = (item.low_stock_threshold && item.quantity <= item.low_stock_threshold) || item.quantity === 1;
            const threshold = item.low_stock_threshold || 3;
            const reorderNeed = Math.max(0, threshold - item.quantity);
            return (
              <tr key={item.id} className="border-b hover:bg-muted/50">
                <td className="p-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{item.item_name || item.sku}</span>
                      {item.quantity === 0 ? (
                        <Badge variant="destructive" className="text-xs">Out of Stock</Badge>
                      ) : isLowStock ? (
                        <Badge variant="outline" className="text-xs bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-400">Low Stock</Badge>
                      ) : null}
                    </div>
                    {(item.make || item.model) && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {(item.make || item.model) && (
                          <span className="text-xs font-medium text-primary">
                            {[item.make, item.model].filter(Boolean).join(' ')}
                          </span>
                        )}
                        {item.year_from && (
                          <Badge variant="outline" className="text-xs px-1.5 py-0 font-mono border-muted-foreground/30 text-muted-foreground">
                            {item.year_from}{item.year_to && item.year_to !== item.year_from ? `–${item.year_to}` : ''}
                          </Badge>
                        )}
                      </div>
                    )}
                    {item.fcc_id && (
                      <p className="text-xs text-muted-foreground font-mono">FCC: {item.fcc_id}</p>
                    )}
                  </div>
                </td>
                <td className="p-3 text-sm text-muted-foreground font-mono">{item.sku || '-'}</td>
                <td className="p-3 hidden md:table-cell">
                  {item.category && (
                    <Badge variant="secondary" className="text-xs">{item.category}</Badge>
                  )}
                  {item.key_type && (
                    <p className="text-xs text-muted-foreground mt-0.5">{item.key_type}</p>
                  )}
                </td>
                <td className="p-3 text-right font-medium">{item.quantity}</td>
                {showReorderNeed && (
                  <td className="p-3 text-right font-medium text-primary">{reorderNeed}</td>
                )}
                <td className="p-3 text-right">{formatCurrency(item.cost || 0)}</td>
                <td className="p-3 text-sm text-muted-foreground">{item.supplier || '-'}</td>
                <td className="p-3">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onEdit(item)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onDelete(item.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
