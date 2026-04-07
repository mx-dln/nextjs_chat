import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { username } = await request.json();

    if (!username || username.trim().length < 3) {
      return NextResponse.json(
        { error: 'Username must be at least 3 characters' },
        { status: 400 }
      );
    }

    const [result] = await pool.query(
      'INSERT INTO users (username) VALUES (?)',
      [username.trim()]
    );

    return NextResponse.json({
      id: (result as any).insertId,
      username: username.trim(),
    });
  } catch (error: any) {
    if (error.code === 'ER_DUP_ENTRY') {
      return NextResponse.json(
        { error: 'Username already exists' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to create user' },
      { status: 500 }
    );
  }
}
