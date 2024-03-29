"use client";

import { useState } from "react";
import { Cloud, File, Loader2 } from "lucide-react";
import Dropzone from "react-dropzone";
import { Progress } from "./ui/progress";
import { useUploadThing } from "@/lib/uploadthing";
import { useToast } from "./ui/use-toast";
import { trpc } from "@/app/_trpc/client";
import { useRouter } from "next/navigation";

const PDFUploadDropzone = ({ isSubscribed }: { isSubscribed: boolean }) => {
  const { toast } = useToast();
  const router = useRouter();
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);

  const { startUpload } = useUploadThing(
    isSubscribed ? "proPlanUploader" : "freePlanUploader"
  );

  const { mutate: startPooling } = trpc.getFile.useMutation({
    onSuccess: (file) => {
      router.push(`/dashboard/${file.id}`);
    },
    retry: true,
    retryDelay: 500,
  });

  const startSimulatedProgress = () => {
    setUploadProgress(0);

    const interval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 95) {
          clearInterval(interval);
          return prev;
        }
        return prev + 5;
      });
    }, 500);

    return interval;
  };

  const handlePdfUpload = async (acceptedFile: File[]) => {
    // handle file upload exceptions

    const file = acceptedFile[0];
    // check if the file is pdf or not
    const isPDF = file.type === "application/pdf";
    if (!isPDF) {
      toast({
        title: "Only PDF files are acceptable",
        description: "Please enter a PDF file",
        variant: "destructive",
      });
      return;
    }

    // handle file size limit
    const maxSize = isSubscribed ? 16 * 1024 * 1024 : 4 * 1024 * 1024;

    if (file.size > maxSize) {
      toast({
        title: "File exceeds maximum size",
        description: `You can upload maximum ${
          isSubscribed ? "16MB" : "4MB"
        } file size`,
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    const progressInterval = startSimulatedProgress();

    // handle file upload
    const res = await startUpload(acceptedFile);

    if (!res || !res.length) {
      toast({
        title: "Something went wrong!",
        description: "Please try again later",
        variant: "destructive",
      });
      return;
    }

    const [fileResponse] = res;
    const key = fileResponse?.key;

    if (!key) {
      toast({
        title: "Something went wrong!",
        description: "Please try again later",
        variant: "destructive",
      });
      return;
    }

    clearInterval(progressInterval);
    setUploadProgress(100);

    startPooling({ key });
  };

  return (
    <Dropzone multiple={false} onDrop={handlePdfUpload}>
      {({ getRootProps, getInputProps, acceptedFiles }) => (
        <div
          {...getRootProps()}
          className="border h-64 m-4 border-dashed border-gray-300 rounded-lg"
        >
          <div className="flex justify-center items-center h-full w-full">
            <label
              htmlFor="dropzone-file"
              className="flex flex-col justify-center items-center w-full h-full rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100"
            >
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Cloud className="h-8 w-8 text-zinc-500 mb-2" />
                <p className="mb-2 text-sm text-zinc-700">
                  <span className="font-semibold">Click to upload</span> or drag
                  and drop
                </p>
                <p className="text-xs text-zinc-500">
                  PDF (up to {isSubscribed ? "16MB" : "4MB"})
                </p>
              </div>
              {acceptedFiles && acceptedFiles[0] ? (
                <div className="max-w-xs bg-white flex items-center rounded-md overflow-hidden outline outline-[1px] outline-zinc-200 divide-x divide-zinc-200">
                  <div className="px-3 py-2 h-full grid place-items-center">
                    <File className="h-4 w-4 text-blue-500" />
                  </div>
                  <div className="px-3 py-2 h-full text-sm truncate">
                    {acceptedFiles[0].name}
                  </div>
                </div>
              ) : null}
              {isUploading ? (
                <div className="mt-4 max-w-xs mx-auto w-full">
                  <Progress
                    indicatorColor={
                      uploadProgress === 100 ? "bg-green-500" : ""
                    }
                    value={uploadProgress}
                    className="h-1 w-full bg-zinc-200"
                  />
                  {uploadProgress === 100 ? (
                    <div className="flex gap-1 items-center justify-center text-sm text-zinc-700 text-center pt-2">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Redirecting...
                    </div>
                  ) : null}
                </div>
              ) : null}
              <input
                {...getInputProps()}
                type="file"
                className="hidden"
                id="dropzone-file"
              />
            </label>
          </div>
        </div>
      )}
    </Dropzone>
  );
};

export default PDFUploadDropzone;
