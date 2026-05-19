import type { FastifyPluginAsync } from "fastify";
import { Prisma } from "@prisma/client";
import { ReportsRangeQuery } from "./schemas.js";
import { getMonthlySeries, getNetWorthHistory } from "./service.js";
import { accessibleGroupWhere } from "../groups/routes.js";

const reportRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", app.authenticate);

  app.get("/monthly-series", async (req) => {
    const q = ReportsRangeQuery.parse(req.query);
    const groupIds = dedupeIds(q.groupIds);
    const groupFilter = await buildAccessibleGroupFilter(app, req.userId, groupIds);

    return {
      months: q.months,
      items:
        groupFilter === false
          ? []
          : await getMonthlySeries(app.prisma, req.userId, q.months, groupFilter, groupIds.length > 0),
    };
  });

  app.get("/net-worth-history", async (req) => {
    const q = ReportsRangeQuery.parse(req.query);
    const groupIds = dedupeIds(q.groupIds);
    const groupFilter = await buildAccessibleGroupFilter(app, req.userId, groupIds);

    return {
      months: q.months,
      items:
        groupFilter === false
          ? []
          : await getNetWorthHistory(
              app.prisma,
              app.redis,
              req.userId,
              q.months,
              groupFilter,
              groupIds.length > 0
            ),
    };
  });
};

export default reportRoutes;

function dedupeIds(ids: string[] | undefined) {
  return [...new Set((ids ?? []).filter(Boolean))];
}

async function buildAccessibleGroupFilter(
  app: Parameters<FastifyPluginAsync>[0],
  userId: string,
  groupIds: string[]
): Promise<Prisma.TransactionWhereInput | false | null> {
  if (!groupIds.length) return null;

  const groups = await app.prisma.transactionGroup.findMany({
    where: {
      AND: [accessibleGroupWhere(userId), { id: { in: groupIds } }],
    },
    select: { id: true },
  });
  if (groups.length !== groupIds.length) return false;

  return {
    groupLinks: {
      some: {
        groupId: { in: groupIds },
      },
    },
  };
}
