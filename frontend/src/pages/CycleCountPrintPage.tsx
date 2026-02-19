import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';

type CycleCountLine = {
  id: number;
  systemQty: number;
  item: {
    itemCode: string;
    description: string;
    unitOfMeasure: string;
  };
};

type CycleCountDetail = {
  id: number;
  countNumber: string;
  location: string;
  blindCount: boolean;
  notes: string | null;
  createdAt: string;
  creator: { fullName: string };
  lines: CycleCountLine[];
};

export function CycleCountPrintPage() {
  const { id } = useParams<{ id: string }>();
  const [cycleCount, setCycleCount] = useState<CycleCountDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ cycleCount: CycleCountDetail }>(`/api/cycle-counts/${id}`)
      .then((data) => setCycleCount(data.cycleCount))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p className="p-8 text-center">Loading...</p>;
  if (!cycleCount) return <p className="p-8 text-center text-red-600">Not found</p>;

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; font-size: 11px; }
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; }
        }
        @media screen {
          .print-page { max-width: 800px; margin: 0 auto; padding: 2rem; }
        }
      `}</style>

      <div className="print-page">
        {/* Screen-only controls */}
        <div className="no-print mb-6 flex gap-3">
          <button
            onClick={() => window.print()}
            className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
          >
            Print
          </button>
          <button
            onClick={() => window.history.back()}
            className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Back
          </button>
        </div>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
              Cycle Count Sheet
            </h1>
            <p style={{ fontSize: '0.875rem', color: '#666', margin: '0.25rem 0 0 0' }}>
              AWT Inventory Tracking
            </p>
          </div>
          <div style={{ textAlign: 'right', fontSize: '0.875rem' }}>
            <p style={{ margin: 0, fontWeight: 600 }}>{cycleCount.countNumber}</p>
            <p style={{ margin: 0, color: '#666' }}>Location: {cycleCount.location}</p>
            <p style={{ margin: 0, color: '#666' }}>
              Date: {formatDate(cycleCount.createdAt)}
            </p>
          </div>
        </div>

        {cycleCount.notes && (
          <p style={{ fontSize: '0.8rem', color: '#555', marginBottom: '1rem', fontStyle: 'italic' }}>
            Notes: {cycleCount.notes}
          </p>
        )}

        {/* Count table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #333' }}>
              <th style={{ textAlign: 'left', padding: '6px 8px', width: '40px' }}>#</th>
              <th style={{ textAlign: 'left', padding: '6px 8px' }}>Item Code</th>
              <th style={{ textAlign: 'left', padding: '6px 8px' }}>Description</th>
              <th style={{ textAlign: 'center', padding: '6px 8px', width: '50px' }}>UOM</th>
              {!cycleCount.blindCount && (
                <th style={{ textAlign: 'right', padding: '6px 8px', width: '80px' }}>System Qty</th>
              )}
              <th style={{ textAlign: 'right', padding: '6px 8px', width: '100px' }}>Counted Qty</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', width: '120px' }}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {cycleCount.lines.map((line, idx) => (
              <tr key={line.id} style={{ borderBottom: '1px solid #ddd' }}>
                <td style={{ padding: '6px 8px', color: '#999' }}>{idx + 1}</td>
                <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                  {line.item.itemCode}
                </td>
                <td style={{ padding: '6px 8px' }}>{line.item.description}</td>
                <td style={{ padding: '6px 8px', textAlign: 'center' }}>{line.item.unitOfMeasure}</td>
                {!cycleCount.blindCount && (
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>{line.systemQty}</td>
                )}
                <td style={{ padding: '6px 8px', borderBottom: '1px solid #aaa' }}></td>
                <td style={{ padding: '6px 8px', borderBottom: '1px solid #aaa' }}></td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Signature block */}
        <div style={{ marginTop: '3rem', display: 'flex', gap: '3rem' }}>
          <div style={{ flex: 1 }}>
            <div style={{ borderBottom: '1px solid #333', height: '2rem' }}></div>
            <p style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.25rem' }}>Counted By</p>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ borderBottom: '1px solid #333', height: '2rem' }}></div>
            <p style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.25rem' }}>Date</p>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ borderBottom: '1px solid #333', height: '2rem' }}></div>
            <p style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.25rem' }}>Signature</p>
          </div>
        </div>
      </div>
    </>
  );
}
