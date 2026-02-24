const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding production database (admin users only)...');

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

  console.log(`Created admin user: ${adminUser.username}`);
  console.log('\n--- IMPORTANT ---');
  console.log('Change the default password (Password1) immediately after first login.');
  console.log('Go to Account Settings to set a real password.');
  console.log('\nTo load demo/training data instead, run:');
  console.log('  node prisma/seed.dev.js');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
