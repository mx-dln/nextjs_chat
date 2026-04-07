import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET() {
  try {
    const [groups] = await pool.query(
      `SELECT g.*, u.username as created_by_name,
        (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count
       FROM groups_table g
       JOIN users u ON g.created_by = u.id
       ORDER BY g.created_at DESC`
    );

    return NextResponse.json(groups);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch groups' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { name, createdBy } = await request.json();

    if (!name || name.trim().length < 1) {
      return NextResponse.json(
        { error: 'Group name is required' },
        { status: 400 }
      );
    }

    const [result] = await pool.query(
      'INSERT INTO groups_table (name, created_by) VALUES (?, ?)',
      [name.trim(), createdBy]
    );

    const groupId = (result as any).insertId;

    // Add creator as member
    await pool.query(
      'INSERT INTO group_members (group_id, user_id) VALUES (?, ?)',
      [groupId, createdBy]
    );

    return NextResponse.json({
      id: groupId,
      name: name.trim(),
      created_by: createdBy,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create group' },
      { status: 500 }
    );
  }
}
