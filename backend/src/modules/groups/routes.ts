import type { FastifyPluginAsync } from "fastify";
import { Prisma } from "@prisma/client";
import {
  CreateGroupBody,
  GroupIdParam,
  InviteGroupBody,
  InviteIdParam,
  UpdateGroupBody,
} from "./schemas.js";

const groupRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", app.authenticate);

  app.get("/", async (req) => {
    const rows = await app.prisma.transactionGroup.findMany({
      where: accessibleGroupWhere(req.userId),
      include: groupInclude,
      orderBy: [{ name: "asc" }],
    });
    return rows.map((group) => serializeGroup(group, req.userId));
  });

  app.get("/invites/pending", async (req) => {
    const user = await app.prisma.user.findUniqueOrThrow({
      where: { id: req.userId },
      select: { email: true },
    });
    const invites = await app.prisma.transactionGroupInvite.findMany({
      where: {
        email: user.email.toLowerCase(),
        status: "pending",
      },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            color: true,
            user: { select: { email: true } },
          },
        },
        invitedBy: { select: { email: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return invites.map(serializeInvite);
  });

  app.post("/", async (req, reply) => {
    const body = CreateGroupBody.parse(req.body);

    const duplicate = await app.prisma.transactionGroup.findFirst({
      where: {
        userId: req.userId,
        name: body.name,
      },
      select: { id: true },
    });
    if (duplicate) return reply.code(409).send({ error: "group_already_exists" });

    const created = await app.prisma.transactionGroup.create({
      data: {
        userId: req.userId,
        ...body,
        members: {
          create: {
            userId: req.userId,
            role: "owner",
          },
        },
      },
      include: groupInclude,
    });
    return reply.code(201).send(serializeGroup(created, req.userId));
  });

  app.put("/:id", async (req, reply) => {
    const { id } = GroupIdParam.parse(req.params);
    const body = UpdateGroupBody.parse(req.body);

    const existing = await app.prisma.transactionGroup.findFirst({
      where: { id, userId: req.userId },
    });
    if (!existing) return reply.code(404).send({ error: "not_found" });

    if (body.name) {
      const duplicate = await app.prisma.transactionGroup.findFirst({
        where: {
          userId: req.userId,
          name: body.name,
          id: { not: id },
        },
        select: { id: true },
      });
      if (duplicate) return reply.code(409).send({ error: "group_already_exists" });
    }

    const updated = await app.prisma.transactionGroup.update({
      where: { id },
      data: body,
      include: groupInclude,
    });
    return reply.send(serializeGroup(updated, req.userId));
  });

  app.delete("/:id", async (req, reply) => {
    const { id } = GroupIdParam.parse(req.params);
    const existing = await app.prisma.transactionGroup.findFirst({
      where: { id, userId: req.userId },
      select: { id: true },
    });
    if (!existing) return reply.code(404).send({ error: "not_found" });

    await app.prisma.transactionGroup.delete({ where: { id } });
    return reply.code(204).send();
  });

  app.post("/:id/invites", async (req, reply) => {
    const { id } = GroupIdParam.parse(req.params);
    const body = InviteGroupBody.parse(req.body);

    const group = await app.prisma.transactionGroup.findFirst({
      where: { id, userId: req.userId },
      select: { id: true, user: { select: { email: true } } },
    });
    if (!group) return reply.code(404).send({ error: "not_found" });
    if (group.user.email.toLowerCase() === body.email) {
      return reply.code(400).send({ error: "cannot_invite_self" });
    }

    const invitedUser = await app.prisma.user.findUnique({
      where: { email: body.email },
      select: { id: true },
    });
    if (invitedUser) {
      const existingMember = await app.prisma.transactionGroupMember.findUnique({
        where: {
          groupId_userId: {
            groupId: id,
            userId: invitedUser.id,
          },
        },
        select: { userId: true },
      });
      if (existingMember) return reply.code(409).send({ error: "already_member" });
    }

    const existingInvite = await app.prisma.transactionGroupInvite.findFirst({
      where: {
        groupId: id,
        email: body.email,
        status: "pending",
      },
      include: inviteInclude,
    });
    if (existingInvite) return reply.code(200).send(serializeInvite(existingInvite));

    const invite = await app.prisma.transactionGroupInvite.create({
      data: {
        groupId: id,
        email: body.email,
        invitedById: req.userId,
      },
      include: inviteInclude,
    });
    return reply.code(201).send(serializeInvite(invite));
  });

  app.post("/invites/:inviteId/accept", async (req, reply) => {
    const { inviteId } = InviteIdParam.parse(req.params);
    const user = await app.prisma.user.findUniqueOrThrow({
      where: { id: req.userId },
      select: { id: true, email: true },
    });

    const invite = await app.prisma.transactionGroupInvite.findFirst({
      where: {
        id: inviteId,
        email: user.email.toLowerCase(),
        status: "pending",
      },
    });
    if (!invite) return reply.code(404).send({ error: "invite_not_found" });

    await app.prisma.$transaction([
      app.prisma.transactionGroupMember.upsert({
        where: {
          groupId_userId: {
            groupId: invite.groupId,
            userId: user.id,
          },
        },
        create: {
          groupId: invite.groupId,
          userId: user.id,
          role: "member",
        },
        update: {},
      }),
      app.prisma.transactionGroupInvite.update({
        where: { id: invite.id },
        data: {
          status: "accepted",
          acceptedAt: new Date(),
        },
      }),
    ]);

    const group = await app.prisma.transactionGroup.findUniqueOrThrow({
      where: { id: invite.groupId },
      include: groupInclude,
    });
    return reply.send(serializeGroup(group, req.userId));
  });

  app.delete("/invites/:inviteId", async (req, reply) => {
    const { inviteId } = InviteIdParam.parse(req.params);
    const user = await app.prisma.user.findUniqueOrThrow({
      where: { id: req.userId },
      select: { email: true },
    });

    const invite = await app.prisma.transactionGroupInvite.findUnique({
      where: { id: inviteId },
      include: { group: { select: { userId: true } } },
    });
    if (!invite || invite.status !== "pending") {
      return reply.code(404).send({ error: "invite_not_found" });
    }

    const canRevoke = invite.group.userId === req.userId;
    const canDecline = invite.email === user.email.toLowerCase();
    if (!canRevoke && !canDecline) return reply.code(404).send({ error: "invite_not_found" });

    await app.prisma.transactionGroupInvite.update({
      where: { id: invite.id },
      data: {
        status: canRevoke ? "revoked" : "declined",
        revokedAt: new Date(),
      },
    });
    return reply.code(204).send();
  });
};

export default groupRoutes;

export const accessibleGroupWhere = (userId: string) => ({
  OR: [
    { userId },
    {
      members: {
        some: {
          userId,
        },
      },
    },
  ],
});

const groupInclude = {
  user: { select: { id: true, email: true } },
  members: {
    include: {
      user: { select: { id: true, email: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
  invites: {
    where: { status: "pending" },
    include: {
      invitedBy: { select: { email: true } },
      group: {
        select: {
          id: true,
          name: true,
          color: true,
          user: { select: { email: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" as const },
  },
};

const inviteInclude = {
  invitedBy: { select: { email: true } },
  group: {
    select: {
      id: true,
      name: true,
      color: true,
      user: { select: { email: true } },
    },
  },
};

function serializeGroup(group: GroupWithRelations, viewerId: string) {
  const ownerMember = {
    userId: group.user.id,
    email: group.user.email,
    role: "owner",
    joinedAt: group.createdAt.toISOString(),
  };
  const members = [
    ownerMember,
    ...group.members
      .filter((member) => member.userId !== group.userId)
      .map((member) => ({
        userId: member.userId,
        email: member.user.email,
        role: member.role,
        joinedAt: member.createdAt.toISOString(),
      })),
  ];

  return {
    id: group.id,
    userId: group.userId,
    ownerEmail: group.user.email,
    name: group.name,
    color: group.color,
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
    role: group.userId === viewerId ? "owner" : "member",
    members,
    pendingInvites: group.invites.map(serializeInvite),
  };
}

function serializeInvite(invite: InviteWithRelations) {
  return {
    id: invite.id,
    groupId: invite.groupId,
    groupName: invite.group.name,
    groupColor: invite.group.color,
    ownerEmail: invite.group.user.email,
    email: invite.email,
    invitedByEmail: invite.invitedBy.email,
    status: invite.status,
    createdAt: invite.createdAt.toISOString(),
  };
}

type GroupWithRelations = Prisma.TransactionGroupGetPayload<{
  include: typeof groupInclude;
}>;

type InviteWithRelations = Prisma.TransactionGroupInviteGetPayload<{
  include: typeof inviteInclude;
}>;
