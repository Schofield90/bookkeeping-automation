import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, SessionData } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { parseCSV, parsePDF } from '@/lib/parsers';
import { categorizeTransactions } from '@/lib/claude';
import { promises as fs } from 'fs';
import path from 'path';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const response = NextResponse.next();
  const session = await getIronSession<SessionData>(request, response, sessionOptions);

  if (!session.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Save file temporarily
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    const tmpDir = path.join(process.cwd(), 'tmp');
    await fs.mkdir(tmpDir, { recursive: true });
    
    const filename = `${Date.now()}-${file.name}`;
    const filepath = path.join(tmpDir, filename);
    await fs.writeFile(filepath, buffer);

    // Create upload record
    const upload = await prisma.upload.create({
      data: {
        filename,
        originalName: file.name,
        fileType: file.type,
        userId: session.userId,
        status: 'PROCESSING'
      }
    });

    // Process file asynchronously
    processFile(filepath, file.type, upload.id, session.userId);

    return NextResponse.json({ 
      success: true, 
      uploadId: upload.id,
      message: 'File uploaded successfully. Processing will begin shortly.' 
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}

async function processFile(filepath: string, fileType: string, uploadId: string, userId: string) {
  try {
    let transactions;
    
    // Parse file based on type
    if (fileType === 'text/csv') {
      transactions = await parseCSV(filepath);
    } else if (fileType === 'application/pdf') {
      transactions = await parsePDF(filepath);
    } else {
      throw new Error('Unsupported file type');
    }

    // Save raw transactions to database
    const savedTransactions = await prisma.transaction.createMany({
      data: transactions.map(tx => ({
        uploadId,
        date: tx.date,
        description: tx.description,
        amount: tx.amount,
        balance: tx.balance,
        rawData: tx,
        status: 'PENDING'
      }))
    });

    // Start AI categorization
    await categorizeTransactions(uploadId);

    // Update upload status
    await prisma.upload.update({
      where: { id: uploadId },
      data: { status: 'COMPLETED' }
    });

    // Clean up temp file
    await fs.unlink(filepath);
  } catch (error) {
    console.error('Processing error:', error);
    
    // Update upload status to failed
    await prisma.upload.update({
      where: { id: uploadId },
      data: { status: 'FAILED' }
    });
  }
}