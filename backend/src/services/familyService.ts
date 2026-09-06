import { customAlphabet } from 'nanoid';
import { prisma } from '../db/client.js';
import { HttpError } from '../lib/httpError.js';
import { assertMember } from '../auth/middleware.js';
import type { TelegramUser } from '../auth/initData.js';

// Unambiguous alphabet: no 0/O/1/I, since codes get read aloud and retyped.
const newInviteCode = customAlphabet('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 8);

export async function upsertUserFromTelegram(tg: TelegramUser) {
  const data = {
    firstName: tg.first_name,
    lastName: tg.last_name ?? null,
    username: tg.username ?? null,
    photoUrl: tg.photo_url ?? null,
  };
  return prisma.user.upsert({
    where: { telegramId: String(tg.id) },
    update: data,
    create: { telegramId: String(tg.id), ...data },
  });
}

export async function listFamiliesForUser(userId: string) {
  const memberships = await prisma.membership.findMany({
    where: { userId },
    include: { family: true },
    orderBy: { joinedAt: 'asc' },
  });
  return memberships.map((m) => ({ ...m.family, role: m.role }));
}

export async function createFamily(userId: string, name: string, timezone?: string) {
  return prisma.family.create({
    data: {
      name,
      inviteCode: newInviteCode(),
      ...(timezone ? { timezone } : {}),
      members: { create: { userId, role: 'owner' } },
    },
  });
}

export async function joinFamily(userId: string, inviteCode: string) {
  const family = await prisma.family.findUnique({
    where: { inviteCode: inviteCode.trim().toUpperCase() },
  });
  if (!family) throw new HttpError(404, 'Invite code not found');

  await prisma.membership.upsert({
    where: { userId_familyId: { userId, familyId: family.id } },
    update: {},
    create: { userId, familyId: family.id },
  });
  return family;
}

export async function listMembers(userId: string, familyId: string) {
  await assertMember(userId, familyId);
  const memberships = await prisma.membership.findMany({
    where: { familyId },
    include: { user: true },
    orderBy: { joinedAt: 'asc' },
  });
  return memberships.map((m) => ({
    id: m.user.id,
    firstName: m.user.firstName,
    lastName: m.user.lastName,
    username: m.user.username,
    photoUrl: m.user.photoUrl,
    role: m.role,
  }));
}

/** Rotating the code invalidates any link that has leaked out of the family. */
export async function regenerateInviteCode(userId: string, familyId: string) {
  const membership = await assertMember(userId, familyId);
  if (membership.role !== 'owner') {
    throw new HttpError(403, 'Only the family owner can reissue the invite code');
  }
  return prisma.family.update({
    where: { id: familyId },
    data: { inviteCode: newInviteCode() },
  });
}

export async function setColorPref(userId: string, colorPref: string) {
  return prisma.user.update({ where: { id: userId }, data: { colorPref } });
}
