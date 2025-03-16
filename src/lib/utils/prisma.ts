import { PrismaClient } from "@prisma/client";

// Create a singleton instance of PrismaClient
const prismaClientSingleton = () => {
    return new PrismaClient({
        log: ['error', 'warn'],
    });
};

// Use a global variable to store the client instance
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
export const prisma = globalForPrisma.prisma || prismaClientSingleton();

// In development, reset the connection for hot reloading
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
