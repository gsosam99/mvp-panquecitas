import type { Metadata } from "next";
import { UsersClient } from "@/components/admin/UsersClient";

export const metadata: Metadata = { title: "Usuarios — Panquecitas" };

export default function UsersPage() {
  return <UsersClient />;
}
