import AcceptInviteClient from "@/components/AcceptInviteClient";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ token: string }> };

export default async function InvitePage({ params }: PageProps) {
  const { token } = await params;
  return <AcceptInviteClient token={token} />;
}
