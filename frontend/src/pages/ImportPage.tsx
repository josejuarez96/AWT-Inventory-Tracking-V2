import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ImportTab } from '@/components/shared/ImportTab';

export function ImportPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">CSV Import</h1>
        <p className="mt-1 text-sm text-gray-500">
          Bulk-load vendors and items from CSV files. Preview and validate before committing.
        </p>
      </div>

      <Tabs defaultValue="vendors">
        <TabsList>
          <TabsTrigger value="vendors">Vendors</TabsTrigger>
          <TabsTrigger value="items">Items</TabsTrigger>
        </TabsList>

        <TabsContent value="vendors" className="mt-4">
          <ImportTab
            label="Vendor"
            previewEndpoint="/api/vendors/import/preview"
            commitEndpoint="/api/vendors/import"
            columnHint="vendor_code, vendor_name, contact_person, phone, email, payment_terms, notes"
          />
        </TabsContent>

        <TabsContent value="items" className="mt-4">
          <ImportTab
            label="Item"
            previewEndpoint="/api/items/import/preview"
            commitEndpoint="/api/items/import"
            columnHint="item_code, description, category, unit_of_measure, min_quantity, max_quantity, safety_stock, standard_cost, default_vendor_code, notes"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
