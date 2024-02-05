"use client";

import { getUserSubscriptionPlan } from "@/lib/stripe";
import React from "react";
import { useToast } from "./ui/use-toast";
import { trpc } from "@/app/_trpc/client";

interface BillingFormProps {
  subscriptionPlan: Awaited<ReturnType<typeof getUserSubscriptionPlan>>;
}

const BillingForm: React.FC<BillingFormProps> = ({ subscriptionPlan }) => {
  const { toast } = useToast();

  const { mutate } = trpc.createStripeSession.useMutation({});

  return <div>BillingForm</div>;
};

export default BillingForm;
