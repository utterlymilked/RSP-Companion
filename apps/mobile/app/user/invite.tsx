import { Redirect, useRouter } from "expo-router";
import { useMe } from "../../src/auth/session";
import { InviteForm } from "../../src/features/users/InviteForm";
import { canOpenTab } from "../../src/navigation";
import { BackBar } from "../../src/ui/BackBar";
import { Screen } from "../../src/ui/Screen";

/** Invite someone to create a login (users.manage). */
export default function Invite() {
  const router = useRouter();
  const allowed = canOpenTab("users", useMe().data?.permissions ?? []);
  if (!allowed) return <Redirect href="/" />;
  return (
    <Screen>
      <BackBar onPress={() => router.back()} />
      <InviteForm />
    </Screen>
  );
}
