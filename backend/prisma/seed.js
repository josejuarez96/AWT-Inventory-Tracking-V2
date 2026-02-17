const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create test users
  console.log('Creating users...');
  const hashedPassword = await bcrypt.hash('Password1', 10);

  const adminUser = await prisma.user.upsert({
    where: { username: 'jose' },
    update: {},
    create: {
      username: 'jose',
      passwordHash: hashedPassword,
      fullName: 'Jose Juarez',
      role: 'admin'
    }
  });

  const standardUser = await prisma.user.upsert({
    where: { username: 'alix' },
    update: {},
    create: {
      username: 'alix',
      passwordHash: hashedPassword,
      fullName: 'Alix (Test Account)',
      role: 'user'
    }
  });

  console.log(`✅ Created users: ${adminUser.username}, ${standardUser.username}`);

  // Create sample vendors
  console.log('Creating vendors...');
  const vendors = await Promise.all([
    prisma.vendor.upsert({
      where: { vendorCode: 'DEXTER' },
      update: {},
      create: {
        vendorCode: 'DEXTER',
        vendorName: 'Dexter Axle Company',
        contactPerson: 'John Smith',
        phone: '555-0101',
        email: 'sales@dexter.com',
        paymentTerms: 'Net 30'
      }
    }),
    prisma.vendor.upsert({
      where: { vendorCode: 'LIPPERT' },
      update: {},
      create: {
        vendorCode: 'LIPPERT',
        vendorName: 'Lippert Components',
        contactPerson: 'Jane Doe',
        phone: '555-0102',
        email: 'orders@lippert.com',
        paymentTerms: 'Net 30'
      }
    }),
    prisma.vendor.upsert({
      where: { vendorCode: 'ACME' },
      update: {},
      create: {
        vendorCode: 'ACME',
        vendorName: 'ACME Trailer Parts',
        contactPerson: 'Bob Johnson',
        phone: '555-0103',
        email: 'bob@acmetrailer.com',
        paymentTerms: 'Net 45'
      }
    }),
    prisma.vendor.upsert({
      where: { vendorCode: 'TITAN' },
      update: {},
      create: {
        vendorCode: 'TITAN',
        vendorName: 'Titan Brake Systems',
        contactPerson: 'Sarah Wilson',
        phone: '555-0104',
        email: 'info@titanbrakes.com',
        paymentTerms: 'Due on Receipt'
      }
    })
  ]);

  console.log(`✅ Created ${vendors.length} vendors`);

  // Create sample items
  console.log('Creating items...');
  const items = await Promise.all([
    // Axles
    prisma.item.upsert({
      where: { itemCode: 'AX-12K-EZ' },
      update: { standardCost: 245.00, defaultVendorId: vendors[0].id },
      create: {
        itemCode: 'AX-12K-EZ',
        description: '12K EZ Lube Axle',
        category: 'Axles',
        unitOfMeasure: 'EA',
        minQuantity: 2,
        maxQuantity: 10,
        standardCost: 245.00,
        defaultVendorId: vendors[0].id,
      }
    }),
    prisma.item.upsert({
      where: { itemCode: 'AX-7K-STD' },
      update: { standardCost: 185.00, defaultVendorId: vendors[0].id },
      create: {
        itemCode: 'AX-7K-STD',
        description: '7K Standard Axle',
        category: 'Axles',
        unitOfMeasure: 'EA',
        minQuantity: 3,
        maxQuantity: 15,
        standardCost: 185.00,
        defaultVendorId: vendors[0].id,
      }
    }),
    // Brakes
    prisma.item.upsert({
      where: { itemCode: 'BR-10-DRUM' },
      update: { standardCost: 85.50, defaultVendorId: vendors[3].id },
      create: {
        itemCode: 'BR-10-DRUM',
        description: '10" Drum Brake Kit',
        category: 'Brakes',
        unitOfMeasure: 'EA',
        minQuantity: 5,
        maxQuantity: 20,
        standardCost: 85.50,
        defaultVendorId: vendors[3].id,
      }
    }),
    prisma.item.upsert({
      where: { itemCode: 'BR-12-DISC' },
      update: { standardCost: 125.00, defaultVendorId: vendors[3].id },
      create: {
        itemCode: 'BR-12-DISC',
        description: '12" Disc Brake Assembly',
        category: 'Brakes',
        unitOfMeasure: 'EA',
        minQuantity: 4,
        maxQuantity: 15,
        standardCost: 125.00,
        defaultVendorId: vendors[3].id,
      }
    }),
    // Lights
    prisma.item.upsert({
      where: { itemCode: 'LT-LED-TAIL' },
      update: { standardCost: 15.75, defaultVendorId: vendors[1].id },
      create: {
        itemCode: 'LT-LED-TAIL',
        description: 'LED Tail Light Assembly',
        category: 'Lights',
        unitOfMeasure: 'EA',
        minQuantity: 10,
        maxQuantity: 30,
        standardCost: 15.75,
        defaultVendorId: vendors[1].id,
      }
    }),
    prisma.item.upsert({
      where: { itemCode: 'LT-MARKER' },
      update: { standardCost: 8.50, defaultVendorId: vendors[1].id },
      create: {
        itemCode: 'LT-MARKER',
        description: 'Amber Marker Light',
        category: 'Lights',
        unitOfMeasure: 'EA',
        minQuantity: 20,
        maxQuantity: 50,
        standardCost: 8.50,
        defaultVendorId: vendors[1].id,
      }
    }),
    // Fasteners
    prisma.item.upsert({
      where: { itemCode: 'FT-BOLT-KIT' },
      update: { standardCost: 12.00, defaultVendorId: vendors[2].id },
      create: {
        itemCode: 'FT-BOLT-KIT',
        description: 'Bolt Kit (Assorted)',
        category: 'Fasteners',
        unitOfMeasure: 'BOX',
        minQuantity: 5,
        maxQuantity: 20,
        standardCost: 12.00,
        defaultVendorId: vendors[2].id,
      }
    }),
    // Couplers
    prisma.item.upsert({
      where: { itemCode: 'CP-2-516' },
      update: { standardCost: 55.00, defaultVendorId: vendors[2].id },
      create: {
        itemCode: 'CP-2-516',
        description: '2-5/16" Coupler',
        category: 'Couplers',
        unitOfMeasure: 'EA',
        minQuantity: 3,
        maxQuantity: 10,
        standardCost: 55.00,
        defaultVendorId: vendors[2].id,
      }
    })
  ]);

  console.log(`✅ Created ${items.length} items`);

  // Create sample transactions
  console.log('Creating transactions...');
  const transactions = await Promise.all([
    // Opening balances for ADEL location
    prisma.transaction.create({
      data: {
        transactionType: 'OPENING_BALANCE',
        itemId: items[0].id,
        location: 'ADEL',
        quantity: 5,
        unitCost: 245.00,
        transactionDate: new Date('2025-01-01'),
        notes: 'Initial inventory count',
        createdBy: adminUser.id
      }
    }),
    prisma.transaction.create({
      data: {
        transactionType: 'OPENING_BALANCE',
        itemId: items[2].id,
        location: 'ADEL',
        quantity: 12,
        unitCost: 85.50,
        transactionDate: new Date('2025-01-01'),
        notes: 'Initial inventory count',
        createdBy: adminUser.id
      }
    }),
    // Receipts
    prisma.transaction.create({
      data: {
        transactionType: 'RECEIPT',
        itemId: items[0].id,
        vendorId: vendors[0].id,
        location: 'ADEL',
        quantity: 3,
        unitCost: 245.00,
        referencePrice: 245.00,
        invoiceNumber: 'INV-2025-001',
        transactionDate: new Date('2025-01-15'),
        notes: 'Regular order',
        createdBy: standardUser.id
      }
    }),
    prisma.transaction.create({
      data: {
        transactionType: 'RECEIPT',
        itemId: items[4].id,
        vendorId: vendors[1].id,
        location: 'CALHOUN',
        quantity: 20,
        unitCost: 15.75,
        referencePrice: 15.75,
        invoiceNumber: 'INV-2025-002',
        transactionDate: new Date('2025-01-16'),
        notes: 'LED lights order',
        createdBy: standardUser.id
      }
    }),
    // Transfer
    prisma.transaction.create({
      data: {
        transactionType: 'TRANSFER',
        itemId: items[0].id,
        location: 'ADEL',
        quantity: -2,
        transactionDate: new Date('2025-01-20'),
        notes: 'Transfer to CALHOUN',
        createdBy: standardUser.id
      }
    }),
    prisma.transaction.create({
      data: {
        transactionType: 'TRANSFER',
        itemId: items[0].id,
        location: 'CALHOUN',
        quantity: 2,
        transactionDate: new Date('2025-01-20'),
        notes: 'Transfer from ADEL',
        createdBy: standardUser.id
      }
    }),
    // Adjustment (damage)
    prisma.transaction.create({
      data: {
        transactionType: 'ADJUSTMENT',
        itemId: items[2].id,
        location: 'ADEL',
        quantity: -2,
        transactionDate: new Date('2025-01-25'),
        notes: 'Damaged during installation',
        createdBy: standardUser.id
      }
    })
  ]);

  console.log(`✅ Created ${transactions.length} transactions`);

  // Create finished good items
  console.log('Creating finished good items...');
  const finishedGoods = await Promise.all([
    prisma.item.upsert({
      where: { itemCode: 'TR-7K-UTIL' },
      update: { standardCost: 1250.00 },
      create: {
        itemCode: 'TR-7K-UTIL',
        description: '7K Utility Trailer',
        category: 'Finished Goods',
        unitOfMeasure: 'EA',
        minQuantity: 0,
        maxQuantity: 5,
        standardCost: 1250.00,
      }
    }),
    prisma.item.upsert({
      where: { itemCode: 'TR-12K-FLAT' },
      update: { standardCost: 2800.00 },
      create: {
        itemCode: 'TR-12K-FLAT',
        description: '12K Flatbed Trailer',
        category: 'Finished Goods',
        unitOfMeasure: 'EA',
        minQuantity: 0,
        maxQuantity: 3,
        standardCost: 2800.00,
      }
    }),
    prisma.item.upsert({
      where: { itemCode: 'TR-14K-DUMP' },
      update: { standardCost: 4200.00 },
      create: {
        itemCode: 'TR-14K-DUMP',
        description: '14K Dump Trailer',
        category: 'Finished Goods',
        unitOfMeasure: 'EA',
        minQuantity: 0,
        maxQuantity: 2,
        standardCost: 4200.00,
      }
    }),
  ]);
  console.log(`✅ Created ${finishedGoods.length} finished goods`);

  // Create sample BOMs
  console.log('Creating BOMs...');
  const bom1 = await prisma.bom.upsert({
    where: { bomCode: 'BOM-7K-UTIL' },
    update: { status: 'ACTIVE' },
    create: {
      bomCode: 'BOM-7K-UTIL',
      name: '7K Utility Trailer Standard Build',
      finishedGoodId: finishedGoods[0].id,
      status: 'ACTIVE',
      createdBy: adminUser.id,
      lines: {
        create: [
          { itemId: items[1].id, quantityPer: 1, sortOrder: 0 },    // 7K Axle ×1
          { itemId: items[2].id, quantityPer: 2, sortOrder: 1 },    // Drum Brakes ×2
          { itemId: items[4].id, quantityPer: 2, sortOrder: 2 },    // LED Tails ×2
          { itemId: items[5].id, quantityPer: 4, sortOrder: 3 },    // Markers ×4
          { itemId: items[6].id, quantityPer: 1, sortOrder: 4 },    // Bolt Kit ×1
          { itemId: items[7].id, quantityPer: 1, sortOrder: 5 },    // Coupler ×1
        ],
      },
    },
  });

  const bom2 = await prisma.bom.upsert({
    where: { bomCode: 'BOM-12K-FLAT' },
    update: { status: 'ACTIVE' },
    create: {
      bomCode: 'BOM-12K-FLAT',
      name: '12K Flatbed Trailer Build',
      finishedGoodId: finishedGoods[1].id,
      status: 'ACTIVE',
      createdBy: adminUser.id,
      lines: {
        create: [
          { itemId: items[0].id, quantityPer: 2, sortOrder: 0 },    // 12K Axles ×2
          { itemId: items[3].id, quantityPer: 4, sortOrder: 1 },    // Disc Brakes ×4
          { itemId: items[4].id, quantityPer: 2, sortOrder: 2 },    // LED Tails ×2
          { itemId: items[5].id, quantityPer: 6, sortOrder: 3 },    // Markers ×6
          { itemId: items[6].id, quantityPer: 2, sortOrder: 4 },    // Bolt Kits ×2
          { itemId: items[7].id, quantityPer: 1, sortOrder: 5 },    // Coupler ×1
        ],
      },
    },
  });

  console.log(`✅ Created BOMs: ${bom1.bomCode}, ${bom2.bomCode}`);

  // Update lastPurchaseCost for items that had receipts
  await prisma.item.update({ where: { id: items[0].id }, data: { lastPurchaseCost: 245.00 } });
  await prisma.item.update({ where: { id: items[4].id }, data: { lastPurchaseCost: 15.75 } });
  console.log('✅ Updated lastPurchaseCost for items with receipts');

  console.log('\n🎉 Database seeding completed successfully!');
  console.log('\n📝 Test Accounts:');
  console.log('   Admin: username=jose, password=Password1');
  console.log('   User:  username=alix, password=Password1');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
