import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { api } from "../../src/api";
import { useMe } from "../../src/auth/session";
import { errorKey, jsonOrThrow } from "../../src/errors";
import { AttendanceStats } from "../../src/features/callups/AttendanceStats";
import { Availability } from "../../src/features/health/TeamAvailability";
import { Button } from "../../src/ui/Button";
import { Centered } from "../../src/ui/Centered";
import { ListItem } from "../../src/ui/ListItem";
import { Screen } from "../../src/ui/Screen";
import { Body, Message, Title } from "../../src/ui/Text";

/** One team: squad and staff (names only; contacts are on the person screen). */
export default function TeamDetail() {
  const { t } = useTranslation();
  const router = useRouter();
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const canSeeAvailability = !!useMe().data?.permissions.includes("availability.read");
  const canSeeAttendance = !!useMe().data?.permissions.includes("callups.read");
  const team = useQuery({
    queryKey: ["team", teamId],
    queryFn: async () => jsonOrThrow(await api.teams[":teamId"].$get({ param: { teamId } })),
  });
  if (team.isPending) return <Centered />;
  return (
    <Screen>
      <Button label={t("common.back")} variant="secondary" onPress={() => router.back()} />
      {team.isError ? <Message tone="error">{t(errorKey(team.error))}</Message> : null}
      {team.data ? (
        <>
          <Title>{team.data.team.name}</Title>
          <Body muted>{t("teams.staff")}</Body>
          {team.data.staff.map((s) => (
            <ListItem
              key={`${s.personId}:${s.function}`}
              title={s.fullName}
              trailing={t(`staffFunctions.${s.function}`)}
            />
          ))}
          <Body muted>{t("teams.roster")}</Body>
          {team.data.roster.length === 0 ? <Body>{t("teams.noRoster")}</Body> : null}
          {team.data.roster.map((p) => (
            <ListItem
              key={p.personId}
              title={p.fullName}
              trailing={p.shirtNumber ? `#${p.shirtNumber}` : undefined}
              onPress={() =>
                router.push({ pathname: "/person/[personId]", params: { personId: p.personId } })
              }
            />
          ))}
          {canSeeAvailability ? <Availability teamId={teamId} /> : null}
          {canSeeAttendance ? <AttendanceStats teamId={teamId} /> : null}
        </>
      ) : null}
    </Screen>
  );
}
