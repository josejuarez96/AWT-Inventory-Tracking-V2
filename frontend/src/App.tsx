import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { FormDirtyProvider } from '@/context/FormDirtyContext';
import { ProtectedRoute } from '@/components/shared/ProtectedRoute';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { UsersPage } from '@/pages/UsersPage';
import { StockPositionPage } from '@/pages/StockPositionPage';
import { TransactionHistoryPage } from '@/pages/TransactionHistoryPage';
import { ReceiptPage } from '@/pages/ReceiptPage';
import { ImportPage } from '@/pages/ImportPage';
import { AdjustmentPage } from '@/pages/AdjustmentPage';
import { TransferPage } from '@/pages/TransferPage';
import { OpeningBalancePage } from '@/pages/OpeningBalancePage';
import { ItemsPage } from '@/pages/ItemsPage';
import { VendorsPage } from '@/pages/VendorsPage';
import { AccountSettingsPage } from '@/pages/AccountSettingsPage';
import { CycleCountsPage } from '@/pages/CycleCountsPage';
import { CycleCountDetailPage } from '@/pages/CycleCountDetailPage';
import { CycleCountPrintPage } from '@/pages/CycleCountPrintPage';
import { BOMsPage } from '@/pages/BOMsPage';
import { KittingPage } from '@/pages/KittingPage';
import { CreateProductionOrderPage } from '@/pages/CreateProductionOrderPage';
import { InProductionPage } from '@/pages/InProductionPage';
import { ProductionOrderDetailPage } from '@/pages/ProductionOrderDetailPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
      <FormDirtyProvider>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />

          {/* Authenticated — print pages (no sidebar) */}
          <Route element={<ProtectedRoute />}>
            <Route path="/cycle-counts/:id/print" element={<CycleCountPrintPage />} />
          </Route>

          {/* Authenticated */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/inventory" element={<StockPositionPage />} />
              <Route path="/transactions" element={<TransactionHistoryPage />} />
              <Route path="/receipts" element={<ReceiptPage />} />
              <Route path="/adjustments" element={<AdjustmentPage />} />
              <Route path="/transfers" element={<TransferPage />} />
              <Route path="/cycle-counts" element={<CycleCountsPage />} />
              <Route path="/cycle-counts/:id" element={<CycleCountDetailPage />} />
              <Route path="/kitting" element={<KittingPage />} />
              <Route path="/production/create" element={<CreateProductionOrderPage />} />
              <Route path="/in-production" element={<InProductionPage />} />
              <Route path="/in-production/:id" element={<ProductionOrderDetailPage />} />
              <Route path="/items" element={<ItemsPage />} />
              <Route path="/vendors" element={<VendorsPage />} />
              <Route path="/account" element={<AccountSettingsPage />} />

              <Route path="/boms" element={<BOMsPage />} />

              {/* Admin only */}
              <Route element={<ProtectedRoute requiredRole="admin" />}>
                <Route path="/users" element={<UsersPage />} />
                <Route path="/import" element={<ImportPage />} />
                <Route path="/opening-balances" element={<OpeningBalancePage />} />
              </Route>
            </Route>
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </FormDirtyProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
