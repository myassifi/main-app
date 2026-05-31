import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  AlertCircle, 
  FileUp, 
  Loader2, 
  PackageCheck, 
  CheckCircle2, 
  Trash2, 
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { api } from '@/integrations/api/client';

interface InvoiceItem {
  sku: string;
  description: string;
  price: number;
  quantity: number;
  total: number;
  supplier: string;
  category: string;
}

interface InvoiceUploadProps {
  onComplete: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}

export default function InvoiceUpload({ onComplete, open: controlledOpen, onOpenChange, hideTrigger }: InvoiceUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [parsedItems, setParsedItems] = useState<InvoiceItem[]>([]);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'upload' | 'review' | 'success'>('upload');
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;
  const setIsOpen = (open: boolean) => {
    if (!isControlled) setInternalOpen(open);
    onOpenChange?.(open);
  };
  const [importingItems, setImportingItems] = useState(false);

  const XLSX_TYPES = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/octet-stream',
  ];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    const ext = selectedFile.name.split('.').pop()?.toLowerCase();
    if (ext === 'xlsx' || ext === 'xls' || XLSX_TYPES.includes(selectedFile.type)) {
      setFile(selectedFile);
      setError('');
    } else {
      setError('Please select an Excel file (.xlsx or .xls)');
      setFile(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    
    setLoading(true);
    setError('');
    
    const formData = new FormData();
    formData.append('invoice', file);
    
    try {
      const response = await api.importInvoice(file);
      setParsedItems(response.items || []);
      setStep('review');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to parse invoice';
      setError(message);
      console.error('Invoice parse error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    setImportingItems(true);
    
    try {
      await api.bulkAddInvoiceItems(parsedItems);
      setStep('success');
      toast({
        title: 'Success',
        description: `${parsedItems.length} items added to inventory`,
      });
      setTimeout(() => {
        resetState();
        onComplete();
      }, 2000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to add items to inventory';
      setError(message);
      console.error('Import error:', err);
    } finally {
      setImportingItems(false);
    }
  };

  const handleEdit = (index: number, field: keyof InvoiceItem, value: string | number) => {
    setParsedItems((prev) =>
      prev.map((item, i) => (i === index ? ({ ...item, [field]: value } as InvoiceItem) : item))
    );
  };

  const handleRemove = (index: number) => {
    setParsedItems(parsedItems.filter((_, i) => i !== index));
  };

  const resetState = () => {
    setIsOpen(false);
    setFile(null);
    setParsedItems([]);
    setError('');
    setStep('upload');
    setLoading(false);
    setImportingItems(false);
  };

  return (
    <>
      {!hideTrigger && (
        <Button 
          variant="outline"
          size="sm"
          onClick={() => setIsOpen(true)}
          className="gap-2 touch-target"
        >
          <FileUp className="h-4 w-4" />
          <span className="hidden sm:inline">Import Invoice</span>
        </Button>
      )}

      <Dialog open={isOpen} onOpenChange={(open) => {
        if (!open) {
          resetState();
        }
        setIsOpen(open);
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {step === 'upload' && 'Import Invoice'}
              {step === 'review' && 'Review Invoice Items'}
              {step === 'success' && 'Import Complete'}
            </DialogTitle>
          </DialogHeader>

          {/* UPLOAD VIEW */}
          {step === 'upload' && (
            <div className="space-y-6 py-4">
              <div className="bg-muted/30 border border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileChange}
                  id="invoice-file"
                  className="hidden"
                />
                <label
                  htmlFor="invoice-file"
                  className="flex flex-col items-center justify-center space-y-4 cursor-pointer"
                >
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <FileUp className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-base">
                      {file ? file.name : 'Choose Excel Invoice (.xlsx)'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Select an Excel file (.xlsx / .xls) from Key4, Transponder Island or other suppliers
                    </p>
                  </div>
                </label>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="flex justify-end space-x-2">
                <Button
                  variant="outline"
                  onClick={() => setIsOpen(false)}
                  className="touch-target"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleUpload}
                  disabled={!file || loading}
                  className="touch-target"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Parsing...
                    </>
                  ) : (
                    'Parse Invoice'
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* REVIEW VIEW */}
          {step === 'review' && (
            <div className="flex flex-col overflow-hidden h-full">
              <div className="text-sm text-muted-foreground mb-3 flex justify-between">
                <div>Found {parsedItems.length} items in invoice</div>
                <div className="font-medium">
                  Total Value: ${parsedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0).toFixed(2)}
                </div>
              </div>

              <div className="overflow-y-auto flex-1 border rounded-md">
                <table className="w-full">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr className="text-left text-xs">
                      <th className="p-2 font-medium">SKU</th>
                      <th className="p-2 font-medium">Description</th>
                      <th className="p-2 font-medium">Price</th>
                      <th className="p-2 font-medium">Qty</th>
                      <th className="p-2 font-medium">Total</th>
                      <th className="p-2 font-medium">Category</th>
                      <th className="p-2 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedItems.map((item, index) => (
                      <tr key={index} className="border-b text-sm">
                        <td className="p-2">
                          <Input
                            size={15}
                            value={item.sku}
                            onChange={(e) => handleEdit(index, 'sku', e.target.value)}
                            className="h-8 text-xs"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            value={item.description}
                            onChange={(e) => handleEdit(index, 'description', e.target.value)}
                            className="h-8 text-xs"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            type="number"
                            step="0.01"
                            value={item.price}
                            onChange={(e) => handleEdit(index, 'price', parseFloat(e.target.value))}
                            className="h-8 w-20 text-xs"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => handleEdit(index, 'quantity', parseInt(e.target.value, 10))}
                            className="h-8 w-16 text-xs"
                          />
                        </td>
                        <td className="p-2">
                          ${(item.price * item.quantity).toFixed(2)}
                        </td>
                        <td className="p-2">
                          <Badge variant="secondary" className="text-xs">
                            {item.category}
                          </Badge>
                        </td>
                        <td className="p-2">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleRemove(index)}
                            className="h-8 w-8 p-0"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {error && (
                <Alert variant="destructive" className="mt-3">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="flex justify-end space-x-2 mt-4">
                <Button
                  variant="outline"
                  onClick={() => setStep('upload')}
                  className="touch-target"
                >
                  Back
                </Button>
                <Button
                  onClick={handleConfirm}
                  disabled={importingItems || parsedItems.length === 0}
                  className="touch-target"
                >
                  {importingItems ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <PackageCheck className="h-4 w-4 mr-2" />
                      Import {parsedItems.length} Items
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* SUCCESS VIEW */}
          {step === 'success' && (
            <div className="py-8 text-center space-y-4">
              <div className="h-16 w-16 rounded-full bg-green-100 mx-auto flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-medium">Import Complete</h3>
                <p className="text-muted-foreground">
                  {parsedItems.length} items have been added to your inventory
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
