import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Check, X as XIcon, RotateCcw, Loader2, Copy } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

type ComponentSnapshot = {
  itemId: number;
  itemCode: string;
  description: string;
  quantityPer: number;
  scrapPercent?: number | null;
  cutDetails?: unknown;
  effectiveQty?: number;
  unitCost?: number;
  source?: string;
};

type ConfigurationSnapshot = {
  bomId: number;
  bomCode: string;
  selections: {
    groupId: number;
    groupName: string;
    selectionType: string;
    packageId: number | null;
    packageName: string;
    quantity: number;
    allowQuantity: boolean;
  }[];
  deviations: unknown[];
  componentSnapshot: ComponentSnapshot[];
};

type ProductionOrderLine = {
  id: number;
  lineNumber: number;
  status: string;
  componentSnapshot: ComponentSnapshot[];
  lineCost: number;
  postedAt: string | null;
  postedBy: number | null;
  voidedAt: string | null;
  voidedBy: number | null;
  reversedAt: string | null;
  reversedBy: number | null;
  notes: string | null;
  batchId: string | null;
  poster?: { fullName: string } | null;
  voider?: { fullName: string } | null;
  reverser?: { fullName: string } | null;
};

type ProductionOrder = {
  id: number;
  orderNumber: string;
  status: string;
  orderType: string;
  location: string;
  totalQuantity: number;
  quantityProduced: number;
  totalCost: number;
  notes: string | null;
  vinReference: string | null;
  configurationSnapshot: ConfigurationSnapshot | null;
  configurationKey: string | null;
  finishedGood: { id: number; itemCode: string; description: string; unitOfMeasure: string };
  bom: { id: number; bomCode: string; name: string } | null;
  creator: { fullName: string };
  createdAt: string;
  lines: ProductionOrderLine[];
};

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-blue-50 text-blue-700 border-blue-200',
  PARTIAL: 'bg-amber-50 text-amber-700 border-amber-200',
  COMPLETED: 'bg-gray-100 text-gray-600 border-gray-200',
};

const LINE_STATUS_COLORS: Record<string, string> = {
  STAGED: 'bg-blue-50 text-blue-700 border-blue-200',
  POSTED: 'bg-green-50 text-green-700 border-green-200',
  VOIDED: 'bg-gray-100 text-gray-600 border-gray-200',
  REVERSED: 'bg-red-50 text-red-700 border-red-200',
};

type ActionType = 'post' | 'void' | 'reverse' | 'post-all' | null;

export function ProductionOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<ProductionOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Action state
  const [actionType, setActionType] = useState<ActionType>(null);
  const [actionLineId, setActionLineId] = useState<number | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [postAllProgress, setPostAllProgress] = useState<string | null>(null);

  const fetchOrder = useCallback(async () => {
    if (!id) return;
    try {
      const res = await api.get<{ order: ProductionOrder }>(`/api/production/orders/${id}`);
      setOrder(res.order);
    } catch {
      setAlert({ type: 'error', message: 'Failed to load production order' });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  // Clear alert after 5s
  useEffect(() => {
    if (!alert) return;
    const timer = setTimeout(() => setAlert(null), 5000);
    return () => clearTimeout(timer);
  }, [alert]);

  function openAction(type: ActionType, lineId?: number) {
    setActionType(type);
    setActionLineId(lineId ?? null);
    setActionReason('');
    setConfirmOpen(true);
  }

  async function executeAction() {
    if (!order || !actionType) return;
    setSubmitting(true);
    setAlert(null);

    try {
      if (actionType === 'post' && actionLineId) {
        await api.post(`/api/production/orders/${order.id}/lines/${actionLineId}/post`, {});
        setAlert({ type: 'success', message: `Line posted successfully` });
      } else if (actionType === 'void' && actionLineId) {
        if (!actionReason.trim()) {
          setAlert({ type: 'error', message: 'Reason is required' });
          setSubmitting(false);
          return;
        }
        await api.post(`/api/production/orders/${order.id}/lines/${actionLineId}/void`, {
          reason: actionReason.trim(),
        });
        setAlert({ type: 'success', message: `Line voided successfully` });
      } else if (actionType === 'reverse' && actionLineId) {
        if (!actionReason.trim()) {
          setAlert({ type: 'error', message: 'Reason is required' });
          setSubmitting(false);
          return;
        }
        await api.post(`/api/production/orders/${order.id}/lines/${actionLineId}/reverse`, {
          reason: actionReason.trim(),
        });
        setAlert({ type: 'success', message: `Line reversed successfully` });
      } else if (actionType === 'post-all') {
        setPostAllProgress('Posting all staged lines...');
        const res = await api.post<{ posted: { lineNumber: number }[]; failed: { lineNumber: number; error: string }[] }>(
          `/api/production/orders/${order.id}/post-all`,
          {}
        );
        const postedCount = res.posted.length;
        const failedCount = res.failed.length;
        if (failedCount === 0) {
          setAlert({ type: 'success', message: `All ${postedCount} line(s) posted successfully` });
        } else {
          setAlert({
            type: 'error',
            message: `Posted ${postedCount}, failed ${failedCount}: ${res.failed.map((f) => `Line ${f.lineNumber}: ${f.error}`).join('; ')}`,
          });
        }
        setPostAllProgress(null);
      }

      setConfirmOpen(false);
      await fetchOrder();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Action failed';
      setAlert({ type: 'error', message: msg });
    } finally {
      setSubmitting(false);
      setActionType(null);
      setActionLineId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-gray-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading...
      </div>
    );
  }

  if (!order) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertDescription>Production order not found</AlertDescription>
        </Alert>
      </div>
    );
  }

  const stagedLines = order.lines.filter((l) => l.status === 'STAGED');
  const postedLines = order.lines.filter((l) => l.status === 'POSTED');

  // Get component list from first line's snapshot (all lines share the same)
  const components = order.lines[0]?.componentSnapshot ?? [];
  const hasConfigSnapshot = !!order.configurationSnapshot;

  // Build confirm dialog content
  let confirmTitle = '';
  let confirmDescription = '';
  let confirmLabel = '';
  let confirmVariant: 'default' | 'destructive' = 'default';
  const actionLine = actionLineId ? order.lines.find((l) => l.id === actionLineId) : null;

  if (actionType === 'post') {
    confirmTitle = 'Post Production Line?';
    confirmDescription = `This will consume components and add 1 ${order.finishedGood.itemCode} to stock at ${order.location}. Line #${actionLine?.lineNumber}.`;
    confirmLabel = 'Post Line';
  } else if (actionType === 'void') {
    confirmTitle = 'Void Production Line?';
    confirmDescription = `This will release reserved components back to available stock. Line #${actionLine?.lineNumber}.`;
    confirmLabel = 'Void Line';
    confirmVariant = 'destructive';
  } else if (actionType === 'reverse') {
    confirmTitle = 'Reverse Posted Line?';
    confirmDescription = `This will return consumed components to stock and remove the finished good. Line #${actionLine?.lineNumber}.`;
    confirmLabel = 'Reverse Line';
    confirmVariant = 'destructive';
  } else if (actionType === 'post-all') {
    confirmTitle = 'Post All Staged Lines?';
    confirmDescription = `This will post ${stagedLines.length} staged line(s). Each line is processed independently — if one fails, others still succeed.`;
    confirmLabel = 'Post All';
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link
            to="/in-production"
            className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-2"
          >
            <ArrowLeft className="mr-1 h-3 w-3" /> Back to In Production
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{order.orderNumber}</h1>
            <Badge className={STATUS_COLORS[order.status] || ''}>
              {order.status}
            </Badge>
          </div>
        </div>

        {stagedLines.length > 0 && (
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => openAction('post-all')}
              disabled={submitting}
            >
              Post All Staged ({stagedLines.length})
            </Button>
          </div>
        )}
      </div>

      {alert && (
        <Alert variant={alert.type === 'error' ? 'destructive' : 'default'}>
          <AlertDescription>{alert.message}</AlertDescription>
        </Alert>
      )}

      {postAllProgress && (
        <Alert>
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertDescription>{postAllProgress}</AlertDescription>
        </Alert>
      )}

      {/* Order Info */}
      <div className="grid grid-cols-2 gap-4 rounded-lg border p-4 sm:grid-cols-4">
        <div>
          <p className="text-xs text-gray-500">Finished Good</p>
          <p className="text-sm font-medium">{order.finishedGood.itemCode}</p>
          <p className="text-xs text-gray-500">{order.finishedGood.description}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Location</p>
          <p className="text-sm font-medium">{order.location}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">BOM</p>
          <p className="text-sm font-medium">{order.bom?.bomCode ?? 'Manual'}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Created</p>
          <p className="text-sm font-medium">
            {new Date(order.createdAt).toLocaleDateString()}
          </p>
          <p className="text-xs text-gray-500">by {order.creator.fullName}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Total Quantity</p>
          <p className="text-sm font-medium">{order.totalQuantity}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Produced</p>
          <p className="text-sm font-medium">{postedLines.length}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Total Cost</p>
          <p className="text-sm font-medium">
            ${order.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
        </div>
        {order.vinReference && (
          <div>
            <p className="text-xs text-gray-500">VIN Reference</p>
            <p className="text-sm font-medium">{order.vinReference}</p>
          </div>
        )}
        {order.notes && (
          <div>
            <p className="text-xs text-gray-500">Notes</p>
            <p className="text-sm">{order.notes}</p>
          </div>
        )}
      </div>

      {/* Configuration Section (if options were selected) */}
      {order.configurationSnapshot && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Configuration</h2>
          <div className="rounded-lg border p-4 bg-gray-50/50 space-y-2">
            {order.configurationKey && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Config Key:</span>
                <code className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded">{order.configurationKey}</code>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  title="Copy to clipboard"
                  onClick={() => navigator.clipboard.writeText(order.configurationKey!)}
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {order.configurationSnapshot.selections
                .filter(s => s.packageId !== null)
                .map((s, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">{s.groupName}:</span>
                    <span className="font-medium">{s.packageName}</span>
                    {s.allowQuantity && s.quantity > 1 && (
                      <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
                        x{s.quantity}
                      </Badge>
                    )}
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Component Template */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Components (per unit)</h2>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item Code</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Qty / Unit</TableHead>
                {hasConfigSnapshot && <TableHead>Source</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {components.map((comp, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-medium">{comp.itemCode}</TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {comp.description}
                    {comp.scrapPercent != null && comp.scrapPercent > 0 && (
                      <span className="text-xs text-muted-foreground ml-1">(+{comp.scrapPercent}% scrap)</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {comp.effectiveQty ?? comp.quantityPer}
                  </TableCell>
                  {hasConfigSnapshot && (
                    <TableCell>
                      {comp.source && (
                        <Badge
                          variant={comp.source === 'BASE' ? 'secondary' : 'outline'}
                          className={`text-[10px] px-1.5 py-0 h-5 ${
                            comp.source === 'BASE'
                              ? ''
                              : comp.source.startsWith('BASE +')
                              ? 'text-purple-700 border-purple-300'
                              : 'text-blue-700 border-blue-300'
                          }`}
                        >
                          {comp.source}
                        </Badge>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Production Lines */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Production Lines</h2>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">#</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>By</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell className="font-medium">{line.lineNumber}</TableCell>
                  <TableCell>
                    <Badge className={LINE_STATUS_COLORS[line.status] || ''}>
                      {line.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {line.status === 'POSTED'
                      ? `$${line.lineCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                      : '—'}
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {line.postedAt
                      ? new Date(line.postedAt).toLocaleDateString()
                      : line.voidedAt
                      ? new Date(line.voidedAt).toLocaleDateString()
                      : line.reversedAt
                      ? new Date(line.reversedAt).toLocaleDateString()
                      : '—'}
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {line.poster?.fullName ||
                      line.voider?.fullName ||
                      line.reverser?.fullName ||
                      '—'}
                  </TableCell>
                  <TableCell className="text-sm text-gray-500 max-w-[200px] truncate">
                    {line.notes || '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {line.status === 'STAGED' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-green-600 border-green-200 hover:bg-green-50"
                            onClick={() => openAction('post', line.id)}
                            disabled={submitting}
                          >
                            <Check className="mr-1 h-3 w-3" /> Post
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() => openAction('void', line.id)}
                            disabled={submitting}
                          >
                            <XIcon className="mr-1 h-3 w-3" /> Void
                          </Button>
                        </>
                      )}
                      {line.status === 'POSTED' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-amber-600 border-amber-200 hover:bg-amber-50"
                          onClick={() => openAction('reverse', line.id)}
                          disabled={submitting}
                        >
                          <RotateCcw className="mr-1 h-3 w-3" /> Reverse
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmOpen(false);
            setActionType(null);
            setActionLineId(null);
            setActionReason('');
          }
        }}
        title={confirmTitle}
        description={
          <div className="space-y-3">
            <p>{confirmDescription}</p>
            {(actionType === 'void' || actionType === 'reverse') && (
              <div>
                <Label>Reason *</Label>
                <Textarea
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  placeholder="Enter reason..."
                  className="mt-1"
                />
              </div>
            )}
          </div>
        }
        confirmLabel={submitting ? 'Processing...' : confirmLabel}
        confirmVariant={confirmVariant}
        onConfirm={executeAction}
      />
    </div>
  );
}
