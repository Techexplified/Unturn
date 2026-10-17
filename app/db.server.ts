import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient;
}

if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal || !(global.prismaGlobal as any).shop) {
    global.prismaGlobal = new PrismaClient();
  }
}

const prisma = (global.prismaGlobal && (global.prismaGlobal as any).shop) ? global.prismaGlobal : new PrismaClient();

export default prisma;
