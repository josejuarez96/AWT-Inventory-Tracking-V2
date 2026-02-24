import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api, ApiError } from '@/lib/api';
import { useFormDirty } from '@/context/FormDirtyContext';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { AdminAuthDialog } from '@/components/AdminAuthDialog';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ArrowLeft, Printer, CheckCircle, XCircle, Save, AlertTriangle } from 'lucide-react';

// --- Types ---

type CycleCountLine = {
  id: number;
  itemId: number;
  systemQty: number;
  countedQty: number | null;
  unitCost: number | null;
  variance: number | null;
  varianceValue: number | null;
  adjustmentId: number | null;
  isLargeVariance: boolean;
  item: {
    itemCode: string;
    description: string;
    category: string | null;
    unitOfMeasure: string;
  };
};

type CycleCountDetail = {
  id: number;
  countNumber: string;
  location: string;
  status: string;
  blindCount: boolean;
  notes: string | null;
  createdAt: string;
  postedAt: string | null;
  creator: { fullName: string };
  assignee: { fullName: string } | null;
  poster: { fullName: string } | null;
  lines: CycleCountLine[];
};

type Summary = {
  totalLines: number;
  countedLines: number;
  linesWithVariance: number;
  netVarianceValue: number;
  largeVarianceCount: number;
  requiresApproval: boolean;
};

// --- Helpers ---

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-yellow-100 text-yellow-700',
  POSTED: 'bg-green-100 text-green-700',
  VOID: 'bg-red-100 text-red-700',
};


function varianceColor(line: CycleCountLine): string {
  if (line.variance === null || line.variance === 0) return '';
  if (line.isLargeVariance) return 'bg-red-50';
  return 'bg-yellow-50';
}

// --- Component ---

export function CycleCountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [cycleCount, setCycleCount] = useState<CycleCountDetail | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editable counted quantities (lineId → string value)
  const [countInputs, setCountInputs] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [adminAuthOpen, setAdminAuthOpen] = useState(false);
  const [adminAuthError, setAdminAuthError] = useState<string | null>(null);
  const [flaggedInfo, setFlaggedInfo] = useState<{ flaggedCount: number; flaggedLines: Array<{ itemCode: string; variance: number; varianceValue: number }> } | null>(null);
  const [voidConfirmOpen, setVoidConfirmOpen] = useState(false);
  const [postConfirmOpen, setPostConfirmOpen] = useState(false);
  const [savedInputs, setSavedInputs] = useState<Record<number, string>>({});
  const { setDirty: setFormDirty } = useFormDirty();

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<{ cycleCount: CycleCountDetail; summary: Summary }>(
        `/api/cycle-counts/${id}`
      );
      setCycleCount(data.cycleCount);
      setSummary(data.summary);

      // Initialize inputs from existing data
      const inputs: Record<number, string> = {};
      for (const line of data.cycleCount.lines) {
        inputs[line.id] = line.countedQty !== null ? String(line.countedQty) : '';
      }
      setCountInputs(inputs);
      setSavedInputs(inputs);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load cycle count';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  // Track dirty state for logout warning
  const isDirty = Object.keys(countInputs).some(
    (key) => countInputs[Number(key)] !== savedInputs[Number(key)]
  );

  useEffect(() => {
    setFormDirty(isDirty);
    return () => setFormDirty(false);
  }, [isDirty, setFormDirty]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  function handleCountChange(lineId: number, value: string) {
    setCountInputs((prev) => ({ ...prev, [lineId]: value }));
  }

  // Compute real-time variance for a line based on current input
  function getRealtimeVariance(line: CycleCountLine) {
    const inputVal = countInputs[line.id];
    if (inputVal === undefined || inputVal === '') {
      return { variance: null, varianceValue: null, isLarge: false };
    }
    const counted = parseFloat(inputVal);
    if (isNaN(counted)) {
      return { variance: null, varianceValue: null, isLarge: false };
    }
    const variance = counted - line.systemQty;
    const unitCost = line.unitCost ?? 0;
    const varianceValue = Math.round(variance * unitCost * 100) / 100;
    const absVariance = Math.abs(variance);
    const absValue = Math.abs(varianceValue);
    const isLarge =
      (line.systemQty > 0 && absVariance / line.systemQty > 0.1) ||
      absValue > 500;
    return { variance, varianceValue, isLarge };
  }

  // Live summary computed from current inputs (updates as user types)
  const liveSummary = useMemo(() => {
    if (!cycleCount) return null;
    let countedLines = 0;
    let linesWithVariance = 0;
    let netVarianceValue = 0;
    let largeVarianceCount = 0;

    for (const line of cycleCount.lines) {
      const rt = getRealtimeVariance(line);
      if (rt.variance !== null) {
        countedLines++;
        if (rt.variance !== 0) {
          linesWithVariance++;
          netVarianceValue += rt.varianceValue ?? 0;
        }
        if (rt.isLarge) largeVarianceCount++;
      }
    }

    return {
      totalLines: cycleCount.lines.length,
      countedLines,
      linesWithVariance,
      netVarianceValue: Math.round(netVarianceValue * 100) / 100,
      largeVarianceCount,
      requiresApproval: largeVarianceCount > 0,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleCount, countInputs]);

  async function handleSave() {
    if (!cycleCount) return;
    setSaving(true);
    setSaveMessage(null);
    setActionError(null);
    try {
      const lines = Object.entries(countInputs)
        .filter(([, val]) => val !== '')
        .map(([lineId, val]) => ({
          lineId: parseInt(lineId),
          countedQty: parseFloat(val),
        }));

      if (lines.length === 0) {
        setActionError('No counts entered');
        setSaving(false);
        return;
      }

      const data = await api.put<{
        message: string;
        status: string;
        totalLines: number;
        countedLines: number;
      }>(`/api/cycle-counts/${id}/lines`, { lines });

      setSaveMessage(`Saved ${lines.length} line(s). Status: ${data.status}`);
      await loadDetail();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save counts';
      setActionError(message);
    } finally {
      setSaving(false);
    }
  }

  async function handlePost(adminCredentials?: { username: string; password: string }) {
    if (!cycleCount) return;
    setPosting(true);
    setActionError(null);
    setAdminAuthError(null);
    try {
      const headers: Record<string, string> = {};
      if (adminCredentials) {
        const encoded = btoa(`${adminCredentials.username}:${adminCredentials.password}`);
        headers['X-Admin-Authorization'] = `Basic ${encoded}`;
      }
      await api.post<{ message: string }>(`/api/cycle-counts/${id}/post`, {}, headers);
      setAdminAuthOpen(false);
      setFlaggedInfo(null);
      await loadDetail();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.data?.requiresApproval) {
        setFlaggedInfo({
          flaggedCount: (err.data.flaggedCount as number) ?? 0,
          flaggedLines: (err.data.flaggedLines as Array<{ itemCode: string; variance: number; varianceValue: number }>) ?? [],
        });
        if (adminCredentials) {
          setAdminAuthError('Invalid admin credentials');
        } else {
          setAdminAuthOpen(true);
        }
        setPosting(false);
        return;
      }
      const message = err instanceof Error ? err.message : 'Failed to post cycle count';
      setActionError(message);
    } finally {
      setPosting(false);
    }
  }

  async function handleVoid() {
    if (!cycleCount) return;
    setVoidConfirmOpen(false);
    setVoiding(true);
    setActionError(null);
    try {
      await api.post<{ message: string }>(`/api/cycle-counts/${id}/void`, {});
      await loadDetail();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to void cycle count';
      setActionError(message);
    } finally {
      setVoiding(false);
    }
  }

  if (loading) {
    return <p className="py-8 text-center text-sm text-gray-500">Loading...</p>;
  }

  if (error || !cycleCount || !summary) {
    return (
      <div className="py-8 text-center">
        <p className="text-red-600">{error ?? 'Cycle count not found'}</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/cycle-counts')}>
          Back to list
        </Button>
      </div>
    );
  }

  const isEditable = ['DRAFT', 'IN_PROGRESS', 'COMPLETED'].includes(cycleCount.status);
  const isCompleted = cycleCount.status === 'COMPLETED';
  const isPosted = cycleCount.status === 'POSTED';
  const isVoid = cycleCount.status === 'VOID';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/cycle-counts')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{cycleCount.countNumber}</h1>
            <p className="text-sm text-gray-500">
              {cycleCount.location} &middot; Created by {cycleCount.creator.fullName}
              {cycleCount.assignee && <> &middot; Assigned to {cycleCount.assignee.fullName}</>}
            </p>
          </div>
          <Badge className={STATUS_COLORS[cycleCount.status] ?? ''}>
            {cycleCount.status.replace('_', ' ')}
          </Badge>
          {cycleCount.blindCount && (
            <Badge variant="outline">Blind Count</Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Link to={`/cycle-counts/${cycleCount.id}/print`}>
            <Button variant="outline" size="sm">
              <Printer className="mr-2 h-4 w-4" />
              Print Sheet
            </Button>
          </Link>
          {isEditable && (
            <Button size="sm" onClick={handleSave} disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? 'Saving...' : 'Save Progress'}
            </Button>
          )}
          {isCompleted && (
            <Button size="sm" onClick={() => setPostConfirmOpen(true)} disabled={posting}>
              <CheckCircle className="mr-2 h-4 w-4" />
              {posting ? 'Posting...' : 'Post Adjustments'}
            </Button>
          )}
          {(isAdmin || ['DRAFT', 'IN_PROGRESS'].includes(cycleCount.status)) && !isPosted && !isVoid && (
            <Button variant="destructive" size="sm" onClick={() => setVoidConfirmOpen(true)} disabled={voiding}>
              <XCircle className="mr-2 h-4 w-4" />
              {voiding ? 'Voiding...' : 'Void'}
            </Button>
          )}
        </div>
      </div>

      {/* Notes */}
      {cycleCount.notes && (
        <p className="text-sm text-gray-600 bg-gray-50 rounded-md px-4 py-2">{cycleCount.notes}</p>
      )}

      {/* Summary cards */}
      {isVoid ? (
        <Alert className="border-red-200 bg-red-50">
          <XCircle className="h-4 w-4 text-red-500" />
          <AlertDescription className="text-red-700">
            This cycle count has been voided. No adjustments were applied to inventory.
          </AlertDescription>
        </Alert>
      ) : (() => {
        const s = isEditable && liveSummary ? liveSummary : summary;
        return (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card>
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-xs text-gray-500 font-normal">Progress</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-lg font-semibold">
                {s.countedLines}/{s.totalLines}
              </p>
              <div className="mt-1 h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: `${s.totalLines > 0 ? (s.countedLines / s.totalLines) * 100 : 0}%` }}
                />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-xs text-gray-500 font-normal">Lines with Variance</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-lg font-semibold">{s.linesWithVariance}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-xs text-gray-500 font-normal">Net Variance $</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className={`text-lg font-semibold ${s.netVarianceValue < 0 ? 'text-red-600' : s.netVarianceValue > 0 ? 'text-green-600' : ''}`}>
                {formatCurrency(s.netVarianceValue)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-xs text-gray-500 font-normal">Large Variances</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className={`text-lg font-semibold ${s.largeVarianceCount > 0 ? 'text-red-600' : ''}`}>
                {s.largeVarianceCount}
              </p>
              {s.requiresApproval && !isAdmin && (
                <p className="text-xs text-red-600 mt-1">Admin approval required</p>
              )}
            </CardContent>
          </Card>
        </div>
        );
      })()}

      {/* Messages */}
      {saveMessage && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">{saveMessage}</AlertDescription>
        </Alert>
      )}
      {actionError && (
        <Alert variant="destructive">
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      {/* Lines table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">#</TableHead>
            <TableHead>Item Code</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>UOM</TableHead>
            {!cycleCount.blindCount && <TableHead className="text-right">System Qty</TableHead>}
            <TableHead className="text-right w-32">Counted Qty</TableHead>
            <TableHead className="text-right">Variance</TableHead>
            <TableHead className="text-right">Unit Cost</TableHead>
            <TableHead className="text-right">Variance $</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cycleCount.lines.map((line, idx) => {
            const rt = isEditable ? getRealtimeVariance(line) : null;
            const rowLarge = rt ? rt.isLarge : line.isLargeVariance;
            const rowVariance = rt ? rt.variance : line.variance;
            const rowBg = rowLarge ? 'bg-red-50' : (rowVariance !== null && rowVariance !== 0) ? 'bg-yellow-50' : '';
            return (
            <TableRow key={line.id} className={isEditable ? rowBg : varianceColor(line)}>
              <TableCell className="text-gray-400">{idx + 1}</TableCell>
              <TableCell className="font-mono text-xs">{line.item.itemCode}</TableCell>
              <TableCell className="max-w-[200px] truncate">{line.item.description}</TableCell>
              <TableCell>{line.item.unitOfMeasure}</TableCell>
              {!cycleCount.blindCount && (
                <TableCell className="text-right">{line.systemQty}</TableCell>
              )}
              <TableCell className="text-right">
                {isEditable ? (
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    className="w-24 ml-auto text-right h-8"
                    value={countInputs[line.id] ?? ''}
                    onChange={(e) => handleCountChange(line.id, e.target.value)}
                  />
                ) : (
                  line.countedQty ?? '—'
                )}
              </TableCell>
              {(() => {
                const displayVariance = rt ? rt.variance : line.variance;
                const displayValue = rt ? rt.varianceValue : line.varianceValue;
                const displayLarge = rt ? rt.isLarge : line.isLargeVariance;
                return (
                  <>
                    <TableCell className="text-right">
                      {displayVariance !== null ? (
                        <span className={
                          displayLarge ? 'text-red-600 font-semibold' :
                          displayVariance !== 0 ? 'text-yellow-600' : ''
                        }>
                          {displayVariance}
                        </span>
                      ) : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {line.unitCost !== null ? formatCurrency(line.unitCost) : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {displayValue !== null ? (
                        <span className={
                          displayLarge ? 'text-red-600 font-semibold' :
                          displayValue !== 0 ? 'text-yellow-600' : ''
                        }>
                          {formatCurrency(displayValue)}
                        </span>
                      ) : '—'}
                    </TableCell>
                  </>
                );
              })()}
            </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* Posted info */}
      {isPosted && cycleCount.poster && (
        <p className="text-sm text-gray-500">
          Posted by {cycleCount.poster.fullName} on{' '}
          {cycleCount.postedAt
            ? formatDateTime(cycleCount.postedAt)
            : '—'}
        </p>
      )}

      {/* Void confirmation dialog */}
      <Dialog open={postConfirmOpen} onOpenChange={setPostConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-blue-500" />
              Post Adjustments
            </DialogTitle>
            <DialogDescription>
              This will create inventory adjustment transactions for all counted variances in <strong>{cycleCount.countNumber}</strong>. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setPostConfirmOpen(false)}>Cancel</Button>
            <Button onClick={() => { setPostConfirmOpen(false); handlePost(); }}>Post Adjustments</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={voidConfirmOpen} onOpenChange={setVoidConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Void Cycle Count
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to void <strong>{cycleCount.countNumber}</strong>? All entered quantities will be discarded and no adjustments will be applied to inventory. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setVoidConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleVoid}>Void Cycle Count</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AdminAuthDialog
        open={adminAuthOpen}
        onOpenChange={setAdminAuthOpen}
        description={`${flaggedInfo?.flaggedCount ?? 0} line(s) exceed variance thresholds (>10% or >$500). Admin authorization is required to post this cycle count.`}
        onAuthorize={(creds) => handlePost(creds)}
        isSubmitting={posting}
        error={adminAuthError}
      />
    </div>
  );
}
