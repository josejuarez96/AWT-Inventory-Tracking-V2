import { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, Plus } from 'lucide-react';

type CutPiece = {
  lengthInches: number;
  quantity: number;
};

type CutDetails = {
  pieces: CutPiece[];
  stockLengthInches: number;
};

type CutPieceEditorValue = {
  cutDetails: CutDetails | null;
  scrapPercent: number | null;
  quantityPer: number | null;
};

type CutPieceEditorProps = {
  stockLength: number;
  value: CutPieceEditorValue;
  onChange: (val: CutPieceEditorValue) => void;
};

type PieceRow = {
  lengthInches: string;
  quantity: string;
};

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function parsePiecesFromValue(value: CutPieceEditorValue): PieceRow[] {
  const cd = value.cutDetails;
  if (cd && cd.pieces && cd.pieces.length > 0) {
    return cd.pieces.map((p) => ({
      lengthInches: String(p.lengthInches),
      quantity: String(p.quantity),
    }));
  }
  return [{ lengthInches: '', quantity: '1' }];
}

export default function CutPieceEditor({ stockLength, value, onChange }: CutPieceEditorProps) {
  const [pieces, setPieces] = useState<PieceRow[]>(() => parsePiecesFromValue(value));
  const [scrapOverride, setScrapOverride] = useState<string | null>(null);

  // Sync from parent when value.cutDetails changes externally (e.g. loading saved data)
  const cdJson = JSON.stringify(value.cutDetails);
  useEffect(() => {
    setPieces(parsePiecesFromValue(value));
    setScrapOverride(null);
  }, [cdJson]); // eslint-disable-line react-hooks/exhaustive-deps

  const recalculate = useCallback(
    (rows: PieceRow[], manualScrap: string | null) => {
      const validPieces: CutPiece[] = [];
      for (const r of rows) {
        const len = parseFloat(r.lengthInches);
        const qty = parseInt(r.quantity) || 0;
        if (len > 0 && qty > 0) {
          validPieces.push({ lengthInches: len, quantity: qty });
        }
      }

      if (validPieces.length === 0) {
        onChange({ cutDetails: null, scrapPercent: null, quantityPer: null });
        return;
      }

      const totalCut = validPieces.reduce((sum, p) => sum + p.lengthInches * p.quantity, 0);
      const quantityPer = round4(totalCut / stockLength);

      // Distinct cut lengths
      const distinctLengths = new Set(validPieces.map((p) => p.lengthInches));
      const isSingleCut = distinctLengths.size === 1;

      let scrapPercent: number;
      if (manualScrap !== null && manualScrap !== '') {
        scrapPercent = parseFloat(manualScrap) || 0;
      } else if (isSingleCut) {
        const cutLen = validPieces[0].lengthInches;
        const fitsPerUnit = Math.floor(stockLength / cutLen);
        if (fitsPerUnit > 0) {
          const usedLength = fitsPerUnit * cutLen;
          scrapPercent = round4(((stockLength - usedLength) / stockLength) * 100);
        } else {
          scrapPercent = 0;
        }
      } else {
        // Mixed: can't auto-calculate, default 0
        scrapPercent = 0;
      }

      const cutDetails: CutDetails = {
        pieces: validPieces,
        stockLengthInches: stockLength,
      };

      onChange({
        cutDetails,
        scrapPercent: round4(scrapPercent),
        quantityPer,
      });
    },
    [stockLength, onChange]
  );

  const updatePiece = (index: number, field: keyof PieceRow, val: string) => {
    const next = pieces.map((p, i) => (i === index ? { ...p, [field]: val } : p));
    setPieces(next);
    recalculate(next, scrapOverride);
  };

  const addPiece = () => {
    const next = [...pieces, { lengthInches: '', quantity: '1' }];
    setPieces(next);
  };

  const removePiece = (index: number) => {
    if (pieces.length <= 1) return;
    const next = pieces.filter((_, i) => i !== index);
    setPieces(next);
    recalculate(next, scrapOverride);
  };

  const handleScrapOverride = (val: string) => {
    setScrapOverride(val);
    recalculate(pieces, val);
  };

  // Derived display values
  const validPieces = pieces.filter(
    (p) => parseFloat(p.lengthInches) > 0 && (parseInt(p.quantity) || 0) > 0
  );
  const totalCut = validPieces.reduce(
    (sum, p) => sum + parseFloat(p.lengthInches) * (parseInt(p.quantity) || 0),
    0
  );
  const distinctLengths = new Set(validPieces.map((p) => parseFloat(p.lengthInches)));
  const isMixed = distinctLengths.size > 1;
  const currentScrap = value.scrapPercent ?? 0;
  const effectiveQty =
    value.quantityPer != null ? round4(value.quantityPer * (1 + currentScrap / 100)) : null;

  return (
    <div className="space-y-2">
      {/* Cut pieces rows */}
      <div className="space-y-1">
        {pieces.map((piece, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <Input
              type="number"
              step="any"
              min="0.01"
              placeholder="Length (in)"
              className="h-7 w-28 text-xs"
              value={piece.lengthInches}
              onChange={(e) => updatePiece(i, 'lengthInches', e.target.value)}
            />
            <span className="text-xs text-muted-foreground">×</span>
            <Input
              type="number"
              step="1"
              min="1"
              placeholder="Qty"
              className="h-7 w-14 text-xs"
              value={piece.quantity}
              onChange={(e) => updatePiece(i, 'quantity', e.target.value)}
            />
            <span className="text-xs text-muted-foreground">pcs</span>
            {pieces.length > 1 && (
              <button
                type="button"
                onClick={() => removePiece(i)}
                className="text-muted-foreground hover:text-destructive p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
        <Button type="button" variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={addPiece}>
          <Plus className="h-3 w-3 mr-1" /> Add piece
        </Button>
      </div>

      {/* Summary */}
      {validPieces.length > 0 && (
        <div className="rounded border bg-muted/40 px-2 py-1.5 space-y-1 text-xs">
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-muted-foreground">
            <span>Cut: {totalCut}in</span>
            <span>Stock: {stockLength}in</span>
            <span>BOM qty: {value.quantityPer ?? '—'}</span>
            {effectiveQty != null && <span>Eff. qty: {effectiveQty}</span>}
          </div>

          {/* Scrap row */}
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Scrap:</span>
            {isMixed ? (
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  className="h-6 w-16 text-xs"
                  value={scrapOverride ?? String(currentScrap)}
                  onChange={(e) => handleScrapOverride(e.target.value)}
                />
                <span className="text-muted-foreground">%</span>
              </div>
            ) : (
              <span>{currentScrap}%</span>
            )}
            {isMixed && (
              <span className="text-amber-600 text-[11px]">Mixed sizes — set scrap manually</span>
            )}
            {currentScrap > 40 && (
              <Badge variant="outline" className="text-amber-600 border-amber-300 text-[10px] h-4 px-1">
                High scrap
              </Badge>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
