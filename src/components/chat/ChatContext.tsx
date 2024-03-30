"use client";

import React, { ReactNode, createContext, useRef, useState } from "react";
import { useToast } from "../ui/use-toast";
import { useMutation } from "@tanstack/react-query";
import { trpc } from "@/app/_trpc/client";
import { INFINITE_QUERY_LIMIT } from "@/config/infinite-query";

type StreamResponse = {
  isLoading: boolean;
  addMessage: () => void;
  message: string;
  handleInputChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
};

export const ChatContext = createContext<StreamResponse>({
  isLoading: false,
  addMessage: () => {},
  message: "",
  handleInputChange: () => {},
});

interface ChatContextProviderProps {
  fileId: string;
  children: ReactNode;
}

const ChatContextProvider = ({
  fileId,
  children,
}: ChatContextProviderProps) => {
  const [message, setMessage] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const backupMessage = useRef("");

  const { toast } = useToast();
  const utils = trpc.useUtils();

  const { mutate: sendMessage } = useMutation({
    mutationFn: async ({ message }: { message: string }) => {
      const res = await fetch("/api/message", {
        method: "POST",
        body: JSON.stringify({ fileId, message }),
      });

      if (!res.ok) {
        return res.json().then((error) => {
          throw new Error(error.message);
        });
      }

      return res.body;
    },
    onMutate: async ({ message }) => {
      backupMessage.current = message;
      setMessage("");

      // step 1
      // cancel all query to get any messages
      await utils.getFileMessages.cancel();
      // store previous messages in a variable
      const previousMessages = utils.getFileMessages.getInfiniteData();
      // set new message with the previous messages
      utils.getFileMessages.setInfiniteData(
        { fileId, limit: INFINITE_QUERY_LIMIT },
        (oldData) => {
          if (!oldData) {
            // return default value that generally return with infinite queries in trpc
            return {
              pages: [],
              pageParams: [],
            };
          }

          let newPages = [...oldData.pages];
          let latestPage = newPages[0]!;
          latestPage.messages = [
            {
              createdAt: new Date().toISOString(),
              id: crypto.randomUUID(),
              text: message,
              isUserMessage: true,
            },
            ...latestPage.messages,
          ];

          newPages[0] = latestPage;

          return {
            ...oldData,
            pages: newPages,
          };
        }
      );

      setIsLoading(true);

      return {
        previousMessages:
          previousMessages?.pages.flatMap((page) => page.messages) ?? [],
      };
    },
    onSuccess: async (stream) => {
      setIsLoading(false);

      if (!stream) {
        return toast({
          title: "There is a problem sending the message",
          description: "Please refresh this page and try again!",
          variant: "destructive",
        });
      }

      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let done = false;

      // accumulated response
      let accResponse = "";

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;

        const chunkValue = decoder.decode(value);
        accResponse += chunkValue;

        // append chunk with actual message
        utils.getFileMessages.setInfiniteData(
          { fileId, limit: INFINITE_QUERY_LIMIT },
          (oldData) => {
            if (!oldData) {
              return {
                pages: [],
                pageParams: [],
              };
            }

            let isAIResponseCreated = oldData.pages.some((page) =>
              page.messages.some((message) => message.id === "ai-response")
            );
            let updatePages = oldData.pages.map((page) => {
              if (page === oldData.pages[0]) {
                let updateMessages;

                if (!isAIResponseCreated) {
                  updateMessages = [
                    {
                      id: "ai-response",
                      createdAt: new Date().toISOString(),
                      isUserMessage: false,
                      text: accResponse,
                    },
                    ...page.messages,
                  ];
                } else {
                  updateMessages = page.messages.map((message) => {
                    if (message.id === "ai-response") {
                      return {
                        ...message,
                        text: accResponse,
                      };
                    } else {
                      return message;
                    }
                  });
                }
                return {
                  ...page,
                  messages: updateMessages,
                };
              }

              return page;
            });

            return { ...oldData, pages: updatePages };
          }
        );
      }
    },
    onError: (error, __, context) => {
      toast({
        title: "Something went wrong!",
        description: (error as Error).message,
        variant: "destructive",
      });
      setMessage(backupMessage.current);
      utils.getFileMessages.setData(
        { fileId },
        { messages: context?.previousMessages ?? [] }
      );
    },
    onSettled: async () => {
      setIsLoading(false);

      await utils.getFileMessages.invalidate({ fileId });
    },
  });

  const addMessage = () => sendMessage({ message });

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
  };

  return (
    <ChatContext.Provider
      value={{ addMessage, message, isLoading, handleInputChange }}
    >
      {children}
    </ChatContext.Provider>
  );
};

export default ChatContextProvider;
