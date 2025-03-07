import { prisma } from "$lib/utils/prisma.js";

export const load = async (event) => {
  const session =
    (await event.locals.getSession()) as EnhancedSessionType | null;
  const tickets = await prisma.ticket.findMany({
    where: {
      customerId: session?.customerData.id,
    },
    include: {
      AssignedTo: {
        include: {
          User: true,
        },
      },
      Warehouse: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
  // console.log(tickets);
  return { tickets };
};
