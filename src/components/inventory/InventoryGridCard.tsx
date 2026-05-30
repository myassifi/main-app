import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Edit, Trash2 } from 'lucide-react';
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

interface InventoryGridCardProps {
  item: InventoryItem;
  showReorderNeed?: boolean;
  onEdit: (item: InventoryItem) => void;
  onDelete: (id: string) => Promise<void>;
}

export function InventoryGridCard({ item, showReorderNeed, onEdit, onDelete }: InventoryGridCardProps) {
  const isLowStock = (item.low_stock_threshold && item.quantity <= item.low_stock_threshold) || item.quantity === 1;
  const isOutOfStock = item.quantity === 0;
  const threshold = item.low_stock_threshold || 3;
  const reorderNeed = Math.max(0, threshold - item.quantity);

  return (
    <Card className="group relative overflow-hidden hover:shadow-lg transition-shadow duration-200">
      <CardContent className="p-0">
        <div className="relative border-b bg-muted/20 p-4">
          {/* Stock Badge */}
          {isOutOfStock ? (
            <Badge variant="destructive" className="absolute top-2 right-2">
              Out of Stock
            </Badge>
          ) : isLowStock ? (
            <Badge variant="outline" className="absolute top-2 right-2 bg-amber-500 text-white border-transparent">
              Low Stock
            </Badge>
          ) : null}

          {/* Quick Actions - Show on hover */}
          <div className="flex gap-1">
            <Button
              size="icon"
              variant="secondary"
              className="h-8 w-8"
              onClick={() => onEdit(item)}
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="secondary"
              className="h-8 w-8 hover:text-destructive"
              onClick={() => onDelete(item.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content Section */}
        <div className="p-4 space-y-3">

          {/* Vehicle headline */}
          {(item.make || item.model) ? (
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-bold text-base text-foreground">
                  {[item.make, item.model].filter(Boolean).join(' ')}
                </span>
                {item.year_from && (
                  <Badge variant="outline" className="text-xs px-1.5 py-0 font-mono border-primary/30 text-primary">
                    {item.year_from}{item.year_to && item.year_to !== item.year_from ? `–${item.year_to}` : ''}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{item.item_name}</p>
            </div>
          ) : (
            <h3 className="font-semibold text-sm line-clamp-2">{item.item_name || item.sku}</h3>
          )}

          {/* Category + Chip badges */}
          <div className="flex flex-wrap gap-1">
            {item.category && (
              <Badge variant="secondary" className="text-xs">{item.category}</Badge>
            )}
            {item.key_type && (
              <Badge variant="outline" className="text-xs text-muted-foreground">{item.key_type}</Badge>
            )}
          </div>

          {/* SKU + FCC */}
          <div className="space-y-1 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">SKU</span>
              <span className="font-mono text-foreground">{item.sku}</span>
            </div>
            {item.fcc_id && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">FCC ID</span>
                <span className="font-mono text-foreground">{item.fcc_id}</span>
              </div>
            )}
          </div>

          {/* Price & Quantity */}
          <div className="flex items-center justify-between pt-2 border-t">
            <div>
              <div className="text-lg font-bold text-primary">
                {formatCurrency(item.cost || 0)}
              </div>
              <div className="text-xs text-muted-foreground">Unit Cost</div>
            </div>
            <div className="text-right">
              <div className={`text-lg font-semibold ${isOutOfStock ? 'text-destructive' : isLowStock ? 'text-amber-500' : 'text-foreground'}`}>
                {item.quantity}
              </div>
              <div className="text-xs text-muted-foreground">In Stock</div>
              {showReorderNeed && reorderNeed > 0 && (
                <div className="text-xs font-medium text-primary">Need {reorderNeed}</div>
              )}
            </div>
          </div>

          {item.supplier && (
            <p className="text-xs text-muted-foreground truncate">📦 {item.supplier}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
