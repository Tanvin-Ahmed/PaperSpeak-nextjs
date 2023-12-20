// import { db } from "@/db";
// import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
// import { createUploadthing, type FileRouter } from "uploadthing/next";
// import { PDFLoader } from "langchain/document_loaders/fs/pdf";
// import { OpenAIEmbeddings } from "langchain/embeddings/openai";
// import { PineconeStore } from "langchain/vectorstores/pinecone";
// import { getPineconeClient } from "@/lib/pinecone";

// const f = createUploadthing();

// // FileRouter for your app, can contain multiple FileRoutes
// export const ourFileRouter = {
//   // Define as many FileRoutes as you like, each with a unique routeSlug
//   pdfUploader: f({ pdf: { maxFileSize: "4MB" } })
//     // Set permissions and file types for this FileRoute
//     .middleware(async ({ req }) => {
//       const { getUser } = getKindeServerSession();
//       const user = await getUser();

//       if (!user || !user.id) {
//         throw new Error("Unauthorized");
//       }
//       // Whatever is returned here is accessible in onUploadComplete as `metadata`
//       return { userId: user.id };
//     })
//     .onUploadComplete(async ({ metadata, file }) => {
//       const createdFile = await db.file.create({
//         data: {
//           key: file.key,
//           name: file.name,
//           userId: metadata.userId,
//           url: `https://uploadthing-prod.s3.us-west-2.amazonaws.com/${file.key}`,
//           uploadStatus: "PROCESSING",
//         },
//       });

//       try {
//         const response = await fetch(
//           `https://uploadthing-prod.s3.us-west-2.amazonaws.com/${file.key}`
//         );
//         // convert the pdf to blob data format
//         const blob = await response.blob();

//         // load pdf into memory
//         const loader = new PDFLoader(blob);
//         // get page level information(text)
//         const pageLevelDoc = await loader.load();
//         // get page amount information (how many pages are available)
//         const pageAmount = pageLevelDoc.length;

//         //* vectorize and index the entire document
//         const pinecone = getPineconeClient();
//         const pineconeIndex = pinecone.Index("paper-speak");
//         // convert text to vector
//         const embeddings = new OpenAIEmbeddings({
//           openAIApiKey: process.env.OPEN_AI_API_KEY,
//         });

//         // store this vector in pinecone data base
//         // ? pageLevelDoc is the text of the pages
//         // ? embeddings provide the information how to verctorized the text
//         // ? pineconeIndex is the name of table
//         // ? namespace is the unique name to store the vector data under the specified namespace that is help to find the vector data
//         await PineconeStore.fromDocuments(pageLevelDoc, embeddings, {
//           pineconeIndex,
//           namespace: createdFile.id,
//         });

//         await db.file.update({
//           data: {
//             uploadStatus: "SUCCESS",
//           },
//           where: {
//             id: createdFile.id,
//           },
//         });
//       } catch (error) {
//         console.log(error);
//         await db.file.update({
//           data: {
//             uploadStatus: "FAILED",
//           },
//           where: {
//             id: createdFile.id,
//           },
//         });
//       }
//     }),
// } satisfies FileRouter;

// export type OurFileRouter = typeof ourFileRouter;

import { db } from "@/db";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { createUploadthing, type FileRouter } from "uploadthing/next";

import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { PineconeStore } from "langchain/vectorstores/pinecone";
import { getPineconeClient } from "@/lib/pinecone";

const f = createUploadthing();

const middleware = async () => {
  const { getUser } = getKindeServerSession();
  const user = await getUser();

  if (!user || !user.id) throw new Error("Unauthorized");

  return { userId: user.id };
};

const onUploadComplete = async ({
  metadata,
  file,
}: {
  metadata: Awaited<ReturnType<typeof middleware>>;
  file: {
    key: string;
    name: string;
    url: string;
  };
}) => {
  const isFileExist = await db.file.findFirst({
    where: {
      key: file.key,
    },
  });

  if (isFileExist) return;

  const createdFile = await db.file.create({
    data: {
      key: file.key,
      name: file.name,
      userId: metadata.userId,
      url: `https://uploadthing-prod.s3.us-west-2.amazonaws.com/${file.key}`,
      uploadStatus: "PROCESSING",
    },
  });

  try {
    const response = await fetch(
      `https://uploadthing-prod.s3.us-west-2.amazonaws.com/${file.key}`
    );

    const blob = await response.blob();

    const loader = new PDFLoader(blob);

    const pageLevelDocs = await loader.load();

    const pagesAmt = pageLevelDocs.length;

    // vectorize and index entire document
    const pinecone = getPineconeClient();
    const pineconeIndex = pinecone.Index("paper-speak");

    const embeddings = new OpenAIEmbeddings({
      openAIApiKey: process.env.OPEN_AI_API_KEY,
    });

    await PineconeStore.fromDocuments(pageLevelDocs, embeddings, {
      pineconeIndex,
      namespace: createdFile.id,
    });

    await db.file.update({
      data: {
        uploadStatus: "SUCCESS",
      },
      where: {
        id: createdFile.id,
      },
    });
  } catch (err) {
    await db.file.update({
      data: {
        uploadStatus: "FAILED",
      },
      where: {
        id: createdFile.id,
      },
    });
  }
};

export const ourFileRouter = {
  pdfUploader: f({ pdf: { maxFileSize: "4MB" } })
    .middleware(middleware)
    .onUploadComplete(onUploadComplete),
  proPlanUploader: f({ pdf: { maxFileSize: "16MB" } })
    .middleware(middleware)
    .onUploadComplete(onUploadComplete),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
