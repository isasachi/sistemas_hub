import { NextRequest, NextResponse } from 'next/server';
import { getSession, deleteSession } from '@/lib/db';
import { readUserId } from '@/lib/product-hunter/session'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession(id, await readUserId());
  if (!session) return NextResponse.json({ error: 'No se encontró la sesión' }, { status: 404 });
  return NextResponse.json(session);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const borrado = await deleteSession(id, await readUserId());
    if (!borrado)
      return NextResponse.json({ error: 'No se encontró la sesión' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'No se pudo eliminar' }, { status: 500 });
  }
}
