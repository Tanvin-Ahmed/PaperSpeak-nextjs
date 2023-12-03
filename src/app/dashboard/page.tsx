import Dashboard from "@/components/Dashboard";
import { db } from "@/db";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { redirect } from "next/navigation";

const DashboardPage = async () => {
  const { getUser } = getKindeServerSession();
  const user = await getUser();
  const userInDB = await db.user.findFirst({ where: { id: user?.id } });

  // if user not logged in properly
  if (!user || !user.id || !userInDB) {
    redirect("/auth-callback?origin=dashboard");
  }

  return <Dashboard />;
};

export default DashboardPage;
