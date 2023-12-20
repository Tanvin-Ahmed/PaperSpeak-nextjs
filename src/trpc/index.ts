import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { privateProcedure, publicProcedure, router } from "./trpc";
import { TRPCError } from "@trpc/server";
import { db } from "@/db";
import { z } from "zod";
import { UTApi } from "uploadthing/server";
import { getPineconeClient } from "@/lib/pinecone";

export const appRouter = router({
  authCallback: publicProcedure.query(async () => {
    const { getUser } = getKindeServerSession();
    const user = await getUser();

    if (!user || !user.id || !user.email) return { success: false, code: 401 };

    // check if the user is in the database
    const dbUser = await db.user.findFirst({
      where: {
        id: user.id,
      },
    });

    if (!dbUser) {
      // create user in db
      await db.user.create({
        data: {
          id: user.id,
          email: user.email,
        },
      });
    }

    return { success: true, code: 200 };
  }),
  getUserFiles: privateProcedure.query(async ({ ctx }) => {
    const { user, userId } = ctx;

    return await db.file.findMany({
      where: {
        userId,
      },
    });
  }),
  getFileUploadStatus: privateProcedure
    .input(z.object({ fileId: z.string() }))
    .query(async ({ input, ctx }) => {
      const file = await db.file.findFirst({
        where: { id: input.fileId, userId: ctx.userId },
      });

      if (!file) {
        return { status: "PENDING" as const };
      }
      return { status: file.uploadStatus };
    }),
  getFile: privateProcedure
    .input(z.object({ key: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { userId } = ctx;

      const file = await db.file.findFirst({
        where: { key: input.key, userId },
      });

      if (!file) throw new TRPCError({ code: "UNAUTHORIZED" });
      return file;
    }),
  deleteFile: privateProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { userId } = ctx;

      const file = await db.file.findFirst({ where: { id: input.id, userId } });

      if (!file) throw new TRPCError({ code: "NOT_FOUND" });

      await db.file.delete({
        where: { id: input.id },
      });

      const uploadThing = new UTApi({ apiKey: process.env.UPLOADTHING_SECRET });
      // get file key from url to delete it
      const regex = /(?<=\.com\/).*/;
      const fileKey = file?.url?.match(regex);
      if (fileKey?.length) {
        uploadThing.deleteFiles(fileKey[0]);
        // delete the vector from pinecone vector db
        const pinecone = getPineconeClient();
        const pineconeIndex = pinecone.Index("paper-speak");
        await pineconeIndex.deleteOne(fileKey[0]);
      }

      return file;
    }),
});

export type AppRouter = typeof appRouter;
