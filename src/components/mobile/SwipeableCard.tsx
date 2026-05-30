import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Edit, Trash2, Plus, Minus } from 'lucide-react';
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

interface SwipeableInventoryCardProps {
  item: InventoryItem;
  showReorderNeed?: boolean;
  onQuantityChange: (id: string, qty: number) => void;
  onEdit: (item: InventoryItem) => void;
  onDelete: (id: string) => void;
}

export function SwipeableInventoryCard({ item, showReorderNeed, onQuantityChange, onEdit, onDelete }: SwipeableInventoryCardProps) {
  const isLowStock = item.quantity <= (item.low_stock_threshold || 3) || item.quantity === 1;
  const threshold = item.low_stock_threshold || 3;
  const reorderNeed = Math.max(0, threshold - item.quantity);
  
  return (
    <Card className="relative overflow-hidden mb-3">
      <CardContent className="p-4">
        <div className="flex gap-3">
          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-start gap-2">
              <div className="flex-1 min-w-0">
                {/* Vehicle headline */}
                {(item.make || item.model) ? (
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-base text-foreground">
                        {[item.make, item.model].filter(Boolean).join(' ')}
                      </span>
                      {item.year_from && (
                        <Badge variant="outline" className="text-xs px-1.5 py-0 font-mono border-primary/40 text-primary">
                          {item.year_from}{item.year_to && item.year_to !== item.year_from ? `–${item.year_to}` : ''}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{item.item_name}</p>
                  </div>
                ) : (
                  <h3 className="font-semibold text-base truncate">{item.item_name || 'Unnamed Item'}</h3>
                )}
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  {item.category && (
                    <Badge variant="secondary" className="text-xs px-1.5 py-0">{item.category}</Badge>
                  )}
                  <Badge variant="outline" className="text-xs font-mono px-1.5 py-0">{item.sku}</Badge>
                  {item.quantity === 0 ? (
                    <Badge variant="destructive" className="text-xs px-1.5 py-0 h-5">Out of Stock</Badge>
                  ) : isLowStock ? (
                    <Badge variant="outline" className="text-xs px-1.5 py-0 h-5 bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-400">Low Stock</Badge>
                  ) : null}
                  {showReorderNeed && reorderNeed > 0 && (
                    <Badge variant="secondary" className="text-xs px-1.5 py-0 h-5">Need {reorderNeed}</Badge>
                  )}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="font-bold text-primary">{formatCurrency(item.cost || 0)}</div>
                <div className="text-xs text-muted-foreground">cost</div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-3 bg-muted/30 rounded-lg p-1">
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground hover:bg-background shadow-sm rounded-md"
              onClick={() => onQuantityChange(item.id, Math.max(0, item.quantity - 1))}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="w-8 text-center font-semibold">{item.quantity}</span>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground hover:bg-background shadow-sm rounded-md"
              onClick={() => onQuantityChange(item.id, item.quantity + 1)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              className="border-muted-foreground/20"
              onClick={() => onEdit(item)}
            >
              <Edit className="h-4 w-4 text-muted-foreground" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="hover:bg-destructive/10 hover:text-destructive text-muted-foreground"
              onClick={() => onDelete(item.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        {(item.fcc_id || item.supplier) && (
          <div className="mt-3 pt-3 border-t flex gap-3 text-xs text-muted-foreground">
            {item.fcc_id && <span>FCC: {item.fcc_id}</span>}
            {item.supplier && <span>• {item.supplier}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
