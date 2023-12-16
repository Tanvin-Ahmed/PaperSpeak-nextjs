"use client";

import React, { ReactNode, createContext, useState } from "react";
import { useToast } from "../ui/use-toast";
import { useMutation } from "@tanstack/react-query";

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

  const { toast } = useToast();

  const { mutate: sendMessage, isLoading } = useMutation({
    mutationFn: async ({ message }: { message: string }) => {
      const res = await fetch("/api/message", {
        method: "POST",
        body: JSON.stringify({ fileId, message }),
      });

      if (!res.ok) {
        throw new Error("Failed to send message");
      }

      return res.body;
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
