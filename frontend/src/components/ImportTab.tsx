import { useRef, useState } from 'react';
import { api, API_BASE } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Upload, CheckCircle } from 'lucide-react';

type PreviewError = { rowNumber: number; field: string; message: string };

type ImportState = {
  file: File | null;
  rows: Record<string, string>[];
  errors: PreviewError[];
  warnings: PreviewError[];
  isPreviewing: boolean;
  isCommitting: boolean;
  commitResult: { inserted: number } | null;
  errorMessage: string | null;
};

const EMPTY_STATE: ImportState = {
  file: null,
  rows: [],
  errors: [],
  warnings: [],
  isPreviewing: false,
  isCommitting: false,
  commitResult: null,
  errorMessage: null,
};

export function ImportTab({
  label,
  previewEndpoint,
  commitEndpoint,
  columnHint,
}: {
  label: string;
  previewEndpoint: string;
  commitEndpoint: string;
  columnHint: string;
}) {
  const [state, setState] = useState<ImportState>(EMPTY_STATE);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  function setFile(file: File) {
    setState({ ...EMPTY_STATE, file });
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave() {
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) setFile(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setFile(file);
  }

  async function handlePreview() {
    if (!state.file) return;
    setState((s) => ({ ...s, isPreviewing: true, errorMessage: null }));

    try {
      const formData = new FormData();
      formData.append('file', state.file);
      const token = localStorage.getItem('awt_token');
      const res = await fetch(`${API_BASE}${previewEndpoint}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setState((s) => ({ ...s, isPreviewing: false, errorMessage: data.error ?? 'Preview failed.' }));
        return;
      }
      setState((s) => ({
        ...s,
        isPreviewing: false,
        rows: data.rows,
        errors: data.errors,
        warnings: data.warnings ?? [],
        commitResult: null,
      }));
    } catch {
      setState((s) => ({ ...s, isPreviewing: false, errorMessage: 'Network error during preview.' }));
    }
  }

  async function handleCommit() {
    setState((s) => ({ ...s, isCommitting: true, errorMessage: null }));
    try {
      const data = await api.post<{ inserted: number }>(commitEndpoint, { rows: state.rows });
      setState((s) => ({ ...s, isCommitting: false, commitResult: data, rows: [], errors: [], warnings: [], file: null }));
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Import failed.';
      setState((s) => ({ ...s, isCommitting: false, errorMessage: message }));
    }
  }

  // Build set of row indices with errors for highlighting
  const errorRowNumbers = new Set(state.errors.map((e) => e.rowNumber));
  const columnKeys = state.rows.length > 0 ? Object.keys(state.rows[0]) : [];

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-500">
        Upload a CSV file with columns: <span className="font-mono text-xs bg-gray-100 px-1 rounded">{columnHint}</span>
      </p>

      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 cursor-pointer transition-colors ${
          isDragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
        }`}
      >
        <Upload className="h-8 w-8 text-gray-400" />
        <p className="text-sm text-gray-600">
          {state.file ? (
            <span className="font-medium text-gray-900">{state.file.name}</span>
          ) : (
            <>Drag & drop a CSV file, or <span className="text-blue-600 underline">browse</span></>
          )}
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={handleFileInput}
        />
      </div>

      {state.file && state.rows.length === 0 && (
        <Button onClick={handlePreview} disabled={state.isPreviewing}>
          {state.isPreviewing ? 'Previewing\u2026' : 'Preview CSV'}
        </Button>
      )}

      {state.errorMessage && (
        <Alert variant="destructive">
          <AlertDescription>{state.errorMessage}</AlertDescription>
        </Alert>
      )}

      {state.commitResult && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            Successfully imported {state.commitResult.inserted} {label.toLowerCase()}(s).
          </AlertDescription>
        </Alert>
      )}

      {/* Validation errors summary */}
      {state.errors.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            <p className="font-medium mb-1">{state.errors.length} validation error(s) — fix your CSV and re-upload:</p>
            <ul className="list-disc list-inside space-y-0.5 text-xs">
              {state.errors.map((e, i) => (
                <li key={i}>Row {e.rowNumber}: {e.field} — {e.message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Warnings (non-blocking) */}
      {state.warnings.length > 0 && (
        <Alert>
          <AlertDescription>
            <p className="font-medium mb-1 text-amber-700">{state.warnings.length} warning(s) — review before importing:</p>
            <ul className="list-disc list-inside space-y-0.5 text-xs text-amber-600">
              {state.warnings.map((w, i) => (
                <li key={i}>Row {w.rowNumber}: {w.field} — {w.message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Preview table */}
      {state.rows.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              {state.rows.length} row(s) parsed
              {state.errors.length > 0 && (
                <span className="ml-2 text-red-600">&middot; {state.errors.length} with errors</span>
              )}
            </p>
            <Button
              onClick={handleCommit}
              disabled={state.errors.length > 0 || state.isCommitting}
            >
              {state.isCommitting ? 'Importing\u2026' : `Confirm Import (${state.rows.length} rows)`}
            </Button>
          </div>
          <div className="rounded-md border overflow-x-auto max-h-96">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  {columnKeys.map((col) => (
                    <TableHead key={col} className="font-mono text-xs">{col}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.rows.map((row, idx) => {
                  const rowNum = idx + 2;
                  const hasError = errorRowNumbers.has(rowNum);
                  return (
                    <TableRow key={idx} className={hasError ? 'bg-red-50' : undefined}>
                      <TableCell className="text-xs text-gray-400">{rowNum}</TableCell>
                      {columnKeys.map((col) => (
                        <TableCell key={col} className="text-sm">{row[col] || '\u2014'}</TableCell>
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
