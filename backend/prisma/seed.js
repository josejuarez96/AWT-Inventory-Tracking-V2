const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create test users
  console.log('Creating users...');
  const hashedPassword = await bcrypt.hash('password123', 10);

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
      update: {},
      create: {
        itemCode: 'AX-12K-EZ',
        description: '12K EZ Lube Axle',
        category: 'Axles',
        unitOfMeasure: 'EA',
        minQuantity: 2,
        maxQuantity: 10
      }
    }),
    prisma.item.upsert({
      where: { itemCode: 'AX-7K-STD' },
      update: {},
      create: {
        itemCode: 'AX-7K-STD',
        description: '7K Standard Axle',
        category: 'Axles',
        unitOfMeasure: 'EA',
        minQuantity: 3,
        maxQuantity: 15
      }
    }),
    // Brakes
    prisma.item.upsert({
      where: { itemCode: 'BR-10-DRUM' },
      update: {},
      create: {
        itemCode: 'BR-10-DRUM',
        description: '10" Drum Brake Kit',
        category: 'Brakes',
        unitOfMeasure: 'EA',
        minQuantity: 5,
        maxQuantity: 20
      }
    }),
    prisma.item.upsert({
      where: { itemCode: 'BR-12-DISC' },
      update: {},
      create: {
        itemCode: 'BR-12-DISC',
        description: '12" Disc Brake Assembly',
        category: 'Brakes',
        unitOfMeasure: 'EA',
        minQuantity: 4,
        maxQuantity: 15
      }
    }),
    // Lights
    prisma.item.upsert({
      where: { itemCode: 'LT-LED-TAIL' },
      update: {},
      create: {
        itemCode: 'LT-LED-TAIL',
        description: 'LED Tail Light Assembly',
        category: 'Lights',
        unitOfMeasure: 'EA',
        minQuantity: 10,
        maxQuantity: 30
      }
    }),
    prisma.item.upsert({
      where: { itemCode: 'LT-MARKER' },
      update: {},
      create: {
        itemCode: 'LT-MARKER',
        description: 'Amber Marker Light',
        category: 'Lights',
        unitOfMeasure: 'EA',
        minQuantity: 20,
        maxQuantity: 50
      }
    }),
    // Fasteners
    prisma.item.upsert({
      where: { itemCode: 'FT-BOLT-KIT' },
      update: {},
      create: {
        itemCode: 'FT-BOLT-KIT',
        description: 'Bolt Kit (Assorted)',
        category: 'Fasteners',
        unitOfMeasure: 'BOX',
        minQuantity: 5,
        maxQuantity: 20
      }
    }),
    // Couplers
    prisma.item.upsert({
      where: { itemCode: 'CP-2-516' },
      update: {},
      create: {
        itemCode: 'CP-2-516',
        description: '2-5/16" Coupler',
        category: 'Couplers',
        unitOfMeasure: 'EA',
        minQuantity: 3,
        maxQuantity: 10
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

  console.log('\n🎉 Database seeding completed successfully!');
  console.log('\n📝 Test Accounts:');
  console.log('   Admin: username=jose, password=password123');
  console.log('   User:  username=alix, password=password123');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
