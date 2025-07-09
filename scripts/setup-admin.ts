import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/auth';

const prisma = new PrismaClient();

async function main() {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'changeme123';
  
  const passwordHash = await hashPassword(password);
  
  try {
    const user = await prisma.user.upsert({
      where: { username },
      update: { passwordHash },
      create: {
        username,
        passwordHash,
      },
    });
    
    console.log(`Admin user created/updated: ${user.username}`);
    console.log('Default password:', password);
    console.log('Please change this password after first login!');
  } catch (error) {
    console.error('Error creating admin user:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();