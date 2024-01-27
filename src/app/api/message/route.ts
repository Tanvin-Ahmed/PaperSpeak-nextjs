import { db } from "@/db";
import { openAI } from "@/lib/openai/openai";
import { getPineconeClient } from "@/lib/pinecone";
import { sendMessageValidator } from "@/lib/validators/sendMessageValidator";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { PineconeStore } from "langchain/vectorstores/pinecone";
import { NextRequest } from "next/server";
import { OpenAIStream, StreamingTextResponse } from "ai";

export const POST = async (req: NextRequest) => {
  try {
    const body = await req.json();
    const { getUser } = getKindeServerSession();
    const user = await getUser();

    if (!user || !user.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { fileId, message } = sendMessageValidator.parse(body);

    const file = await db.file.findFirst({
      where: { id: fileId, userId: user.id },
    });

    if (!file) {
      return new Response("Not found", { status: 404 });
    }

    await db.message.create({
      data: {
        text: message,
        isUserMessage: true,
        fileId,
        userId: user.id,
      },
    });

    // 1: vectorize message
    const pinecone = getPineconeClient();
    const pineconeIndex = pinecone.Index("paper-speak");

    const embeddings = new OpenAIEmbeddings({
      openAIApiKey: process.env.OPEN_AI_API_KEY,
    });

    // get the storage
    const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
      pineconeIndex,
      namespace: file.id,
    });

    const results = await vectorStore.similaritySearch(message, 4);

    const previousMessages = await db.message.findMany({
      where: { fileId },
      orderBy: { createdAt: "asc" },
      take: 6,
    });

    // format message for open ai
    const formattedPrevMessages = previousMessages.map((message) => ({
      role: message.isUserMessage ? ("user" as const) : ("assistant" as const),
      content: message.text,
    }));

    const responseFormOpenAI = await openAI.chat.completions.create({
      model: "gpt-3.5-turbo",
      stream: true,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "Use the following pieces of context (or previous conversaton if needed) to answer the users question in markdown format.",
        },
        {
          role: "user",
          content: `Use the following pieces of context (or previous conversaton if needed) to answer the users question in markdown format. \nIf you don't know the answer, just say that you don't know, don't try to make up an answer.
        
          \n----------------\n
          
          PREVIOUS CONVERSATION:
          ${formattedPrevMessages.map((message) => {
            if (message.role === "user") return `User: ${message.content}\n`;
            return `Assistant: ${message.content}\n`;
          })}
          
          \n----------------\n
          
          CONTEXT:
          ${results.map((r) => r.pageContent).join("\n\n")}
          
          USER INPUT: ${message}`,
        },
      ],
    });

    const stream = OpenAIStream(responseFormOpenAI, {
      async onCompletion(completion) {
        await db.message.create({
          data: {
            text: completion,
            isUserMessage: false,
            fileId,
            userId: user.id,
          },
        });
      },
    });

    return new StreamingTextResponse(stream);
  } catch (error) {
    return new Response("Something went wrong", { status: 500 });
  }
};
