import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CheckCircle } from 'lucide-react';
import { ImportTab } from '@/components/ImportTab';

type Item = { id: number; itemCode: string; description: string; unitOfMeasure: string };

const schema = z.object({
  itemId: z.string().min(1, 'Item is required'),
  location: z.enum(['ADEL', 'CALHOUN'], { required_error: 'Location is required' }),
  quantity: z.coerce.number({ invalid_type_error: 'Must be a number' }).positive('Must be greater than 0'),
  unitCost: z.coerce.number({ invalid_type_error: 'Must be a number' }).positive('Must be greater than 0').optional().or(z.literal(NaN).transform(() => undefined)),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function OpeningBalancePage() {
  const [items, setItems] = useState<Item[]>([]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      location: 'ADEL',
    },
  });

  useEffect(() => {
    api
      .get<{ items: Item[] }>('/api/items')
      .then((data) => setItems(data.items))
      .catch(() => {});
  }, []);

  async function onSubmit(values: FormValues) {
    setSubmitError(null);
    setSuccessMessage(null);
    try {
      const data = await api.post<{ transaction: { id: number } }>(
        '/api/transactions/opening-balances',
        {
          itemId: parseInt(values.itemId),
          location: values.location,
          quantity: values.quantity,
          unitCost: values.unitCost || undefined,
          notes: values.notes || undefined,
        }
      );
      setSuccessMessage(`Opening balance #${data.transaction.id} recorded successfully.`);
      const prevLocation = values.location;
      reset({
        itemId: '',
        location: prevLocation,
        quantity: undefined,
        unitCost: undefined,
        notes: '',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save opening balance.';
      setSubmitError(message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Opening Balances</h1>
        <p className="mt-1 text-sm text-gray-500">
          Set initial stock counts for go-live. Enter one at a time or bulk-load from a CSV file.
        </p>
      </div>

      <Tabs defaultValue="single">
        <TabsList>
          <TabsTrigger value="single">Single Entry</TabsTrigger>
          <TabsTrigger value="csv">CSV Import</TabsTrigger>
        </TabsList>

        <TabsContent value="single" className="mt-4">
          <div className="max-w-2xl">
            {successMessage && (
              <Alert className="border-green-200 bg-green-50 mb-6">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">{successMessage}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* Row 1: Item + Location */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="itemId">Item <span className="text-red-500">*</span></Label>
                  <Select onValueChange={(v) => setValue('itemId', v)}>
                    <SelectTrigger id="itemId">
                      <SelectValue placeholder="Select item..." />
                    </SelectTrigger>
                    <SelectContent>
                      {items.map((item) => (
                        <SelectItem key={item.id} value={String(item.id)}>
                          {item.itemCode} — {item.description}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.itemId && (
                    <p className="text-xs text-red-600">{errors.itemId.message}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="location">Location <span className="text-red-500">*</span></Label>
                  <Select
                    defaultValue="ADEL"
                    onValueChange={(v) => setValue('location', v as 'ADEL' | 'CALHOUN')}
                  >
                    <SelectTrigger id="location">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ADEL">ADEL</SelectItem>
                      <SelectItem value="CALHOUN">CALHOUN</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.location && (
                    <p className="text-xs text-red-600">{errors.location.message}</p>
                  )}
                </div>
              </div>

              {/* Row 2: Quantity + Unit Cost */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="quantity">Quantity <span className="text-red-500">*</span></Label>
                  <Input
                    id="quantity"
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0"
                    {...register('quantity')}
                  />
                  {errors.quantity && (
                    <p className="text-xs text-red-600">{errors.quantity.message}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="unitCost">Unit Cost ($) <span className="text-gray-400">(optional)</span></Label>
                  <Input
                    id="unitCost"
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    {...register('unitCost')}
                  />
                  {errors.unitCost && (
                    <p className="text-xs text-red-600">{errors.unitCost.message}</p>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1">
                <Label htmlFor="notes">Notes <span className="text-gray-400">(optional)</span></Label>
                <Textarea
                  id="notes"
                  placeholder="Any notes about this opening balance..."
                  rows={3}
                  {...register('notes')}
                />
              </div>

              {submitError && (
                <p className="text-sm text-red-600">{submitError}</p>
              )}

              <div className="flex justify-end">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : 'Save Opening Balance'}
                </Button>
              </div>
            </form>
          </div>
        </TabsContent>

        <TabsContent value="csv" className="mt-4">
          <ImportTab
            label="Opening Balance"
            previewEndpoint="/api/transactions/opening-balances/import/preview"
            commitEndpoint="/api/transactions/opening-balances/import"
            columnHint="item_code, location, quantity, unit_cost"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
