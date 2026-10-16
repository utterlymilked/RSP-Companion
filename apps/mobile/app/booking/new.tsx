import Ionicons from "@expo/vector-icons/Ionicons";
import {
  BOOKING_ACTIVITIES,
  BOOKING_STATUSES,
  type BookingActivity,
  createBookingSchema,
  fromLisbon,
  hasPermission,
  parseLocal,
} from "@rsc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { type ComponentProps, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../../src/api";
import { useMe } from "../../src/auth/session";
import { errorKey, jsonOrThrow } from "../../src/errors";
import { MonthGrid } from "../../src/features/bookings/CalendarGrid";
import { DateNav } from "../../src/features/bookings/DateNav";
import { type AreaStatus, FloorPlan } from "../../src/features/bookings/FloorPlan";
import { FreeSlots } from "../../src/features/bookings/FreeSlots";
import {
  type BookingSummary,
  bookingsOf,
  type SpaceSummary,
  stateAt,
  whoOf,
} from "../../src/features/bookings/occupancy";
import { PartPicker } from "../../src/features/bookings/PartPicker";
import { partsOf, pitchOf, placeSpaces, planOrder } from "../../src/features/bookings/planLayout";
import {
  categoryOf,
  DEFAULT_DURATION,
  daySlots,
  type SpaceCategory,
} from "../../src/features/bookings/slots";
import { TakenSheet } from "../../src/features/bookings/TakenSheet";
import {
  addDays,
  addMonths,
  byName,
  clockTime,
  dayOf,
  minutesToClock,
  monthGrid,
  monthTitle,
  shortDayTitle,
  todayLisbon,
} from "../../src/features/bookings/time";
import { fontSize, radius, spacing, useColors } from "../../src/theme";
import { BackBar } from "../../src/ui/BackBar";
import { Button } from "../../src/ui/Button";
import { Card } from "../../src/ui/Card";
import { Choice } from "../../src/ui/Choice";
import { Screen } from "../../src/ui/Screen";
import { Segmented } from "../../src/ui/Segmented";
import { Select } from "../../src/ui/Select";
import { Body, Message, Title } from "../../src/ui/Text";
import { TextField } from "../../src/ui/TextField";
import { showToast } from "../../src/ui/Toast";

type Step = "space" | "date" | "time" | "details";

const clockMinutes = (clock: string) => {
  const [h, m] = clock.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** The last day of the season `date` falls in (seasons run July to June). */
const seasonEnd = (date: string) => {
  const year = Number(date.slice(0, 4));
  return `${Number(date.slice(5, 7)) >= 7 ? year + 1 : year}-06-30`;
};

/**
 * Books a field or a room the way TheFork books a table: pick the space on the plan, the day
 * on a calendar and a free time, then confirm. Each step done shows as a line that can be
 * tapped to change it. Coming from the plan or a free slot, the done steps are skipped.
 * Club-wide writers set the status; coaches and delegados pick their team and send a request
 * the club office confirms.
 */
export default function NewBooking() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const colors = useColors();
  const params = useLocalSearchParams<{
    spaceId?: string;
    date?: string;
    start?: string;
    end?: string;
    category?: SpaceCategory;
  }>();
  const queryClient = useQueryClient();
  const me = useMe().data;
  const clubWide = !!me && hasPermission(me.roles, "bookings.write");
  const today = todayLisbon();

  const [spaceId, setSpaceId] = useState(params.spaceId ?? "");
  const [date, setDate] = useState(params.date && params.date >= today ? params.date : today);
  const [start, setStart] = useState<number | null>(
    params.start ? clockMinutes(params.start) : null,
  );
  const [duration, setDuration] = useState(
    params.start && params.end
      ? clockMinutes(params.end) - clockMinutes(params.start)
      : DEFAULT_DURATION,
  );
  const [step, setStep] = useState<Step>(
    !params.spaceId ? "space" : !params.date ? "date" : !params.start ? "time" : "details",
  );
  const [category, setCategory] = useState<SpaceCategory | null>(params.category ?? null);
  const [form, setForm] = useState({
    departmentId: "",
    teamId: "",
    activity: "training" as BookingActivity,
    status: "confirmed",
    title: "",
    repeat: "none",
    targetGroup: "",
    expectedAttendance: "",
    notes: "",
  });
  const [more, setMore] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [done, setDone] = useState<{ count: number; pending: boolean } | null>(null);
  const [taken, setTaken] = useState<{ booking: BookingSummary; overlap?: boolean } | null>(null);
  const set = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const facilities = useQuery({
    queryKey: ["facilities"],
    queryFn: async () => jsonOrThrow(await api.facilities.$get()),
  });
  const teams = useQuery({
    queryKey: ["teams"],
    queryFn: async () => jsonOrThrow(await api.teams.$get({ query: {} })),
  });
  // The month around the chosen day: marks the calendar and gives the day's free times.
  const days = monthGrid(date);
  const range = { from: days[0] ?? date, to: days[days.length - 1] ?? date };
  const list = useQuery({
    queryKey: ["bookings", range.from, range.to],
    queryFn: async () => jsonOrThrow(await api.bookings.$get({ query: range })),
  });

  const spaces = (facilities.data?.spaces ?? []) as SpaceSummary[];
  const departments = facilities.data?.departments ?? [];
  const space = spaces.find((s) => s.id === spaceId) ?? null;
  const shownCategory = category ?? (space ? categoryOf(space) : "fields");
  const bookings = (list.data?.bookings ?? []) as BookingSummary[];
  const dayBookings = bookings.filter((b) => dayOf(b.startsAt) <= date && dayOf(b.endsAt) >= date);
  const departmentId = form.departmentId || (departments.length === 1 ? departments[0]?.id : "");

  const repeatUntil =
    form.repeat === "4"
      ? addDays(date, 21)
      : form.repeat === "8"
        ? addDays(date, 49)
        : form.repeat === "season"
          ? seasonEnd(date)
          : null;
  const from = start === null ? null : parseLocal(date, minutesToClock(start));
  const to = start === null ? null : parseLocal(date, minutesToClock(start + duration));
  const parsed = createBookingSchema.safeParse({
    spaceId,
    departmentId,
    teamId: form.teamId || null,
    activity: form.activity,
    status: clubWide ? form.status : "to_confirm",
    title: form.title,
    targetGroup: form.targetGroup,
    expectedAttendance: form.expectedAttendance,
    notes: form.notes,
    startsAt: from && fromLisbon(from).toISOString(),
    endsAt: to && fromLisbon(to).toISOString(),
    repeat: repeatUntil ? { everyWeeks: 1, until: repeatUntil } : null,
  });
  const needsTeam = !clubWide && !form.teamId;

  const create = useMutation({
    mutationFn: async () => {
      if (!parsed.success) throw new Error("invalid");
      return jsonOrThrow(await api.bookings.$post({ json: parsed.data as never }));
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["bookings"] });
      const status = data.bookings[0]?.status;
      setDone({ count: data.bookings.length, pending: status === "to_confirm" });
      showToast(t(status === "to_confirm" ? "bookings.toastRequested" : "bookings.toastCreated"));
    },
    onError: (error) => showToast(t(errorKey(error)), "error"),
  });

  const plan = placeSpaces(spaces);
  const live = date === today;
  const status = (id: string): AreaStatus =>
    live
      ? stateAt(id, new Date(), dayBookings, spaces)
      : {
          state: "free",
          booking: null,
          until: null,
          label: t("bookings.count", { count: bookingsOf(id, dayBookings, spaces).length }),
        };
  const next = () => setStep(params.date ? "time" : "date");
  /** A pitch that can be split stays on this step, to choose whole, half or third first. */
  const chooseSpace = (id: string) => {
    setSpaceId(id);
    setStart(null);
    const chosen = spaces.find((s) => s.id === id);
    const pitch = chosen ? pitchOf(chosen, spaces) : null;
    if (!pitch || partsOf(spaces, pitch.id).length === 0) next();
  };
  // TheFork's calendar shows plain days; free times come on the next step.
  const noMarks = new Map();
  const timeLabel =
    start === null ? "" : `${minutesToClock(start)}–${minutesToClock(start + duration)}`;

  if (done && space) {
    return (
      <Screen>
        <View style={styles.success}>
          <View style={[styles.successIcon, { backgroundColor: colors.successSoft }]}>
            <Ionicons name="checkmark" size={40} color={colors.success} />
          </View>
          <Title>
            {t(done.pending ? "bookings.success.requested" : "bookings.success.created")}
          </Title>
          {done.pending ? <Body muted>{t("bookings.success.pendingHint")}</Body> : null}
        </View>
        <Card>
          <SummaryRow icon="location-outline" text={space.name} />
          <SummaryRow
            icon="calendar-outline"
            text={`${shortDayTitle(date, i18n.language)}, ${timeLabel}`}
          />
          <SummaryRow
            icon="people-outline"
            text={[
              teams.data?.teams.find((x) => x.id === form.teamId)?.name,
              departments.find((d) => d.id === departmentId)?.name,
            ]
              .filter(Boolean)
              .join(" · ")}
          />
          {me ? (
            <SummaryRow
              icon="person-outline"
              text={t("bookings.bookedByName", { name: me.user.name })}
            />
          ) : null}
          {done.count > 1 ? (
            <SummaryRow
              icon="repeat-outline"
              text={t("bookings.success.series", { count: done.count })}
            />
          ) : null}
        </Card>
        <Button
          icon="bookmarks-outline"
          label={t("bookings.success.viewMine")}
          onPress={() => router.replace("/booking/mine")}
        />
        <Button
          variant="secondary"
          icon="add-circle-outline"
          label={t("bookings.success.another")}
          onPress={() => {
            setDone(null);
            setSubmitted(false);
            setStart(null);
            setStep("time");
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <BackBar onPress={() => router.back()} />
      <Title>{clubWide ? t("bookings.new") : t("bookings.request")}</Title>
      {clubWide ? null : <Body muted>{t("bookings.requestHint")}</Body>}

      {step !== "space" && space ? (
        <DoneStep
          icon="location-outline"
          label={t("bookings.space")}
          value={space.name}
          onChange={() => setStep("space")}
        />
      ) : null}
      {(step === "time" || step === "details") && space ? (
        <DoneStep
          icon="calendar-outline"
          label={t("bookings.day")}
          value={shortDayTitle(date, i18n.language)}
          onChange={() => setStep("date")}
        />
      ) : null}
      {step === "details" && start !== null ? (
        <DoneStep
          icon="time-outline"
          label={t("bookings.time")}
          value={timeLabel}
          onChange={() => setStep("time")}
        />
      ) : null}

      {step === "space" ? (
        <>
          <StepTitle number={1} text={t("bookings.steps.space")} />
          <Segmented
            label={t("bookings.category.label")}
            value={shownCategory}
            onChange={setCategory}
            options={[
              { value: "fields", label: t("bookings.category.fields"), icon: "football-outline" },
              { value: "rooms", label: t("bookings.category.rooms"), icon: "business-outline" },
            ]}
          />
          <FloorPlan
            part={shownCategory}
            spaces={spaces}
            areas={plan.areas}
            combinations={plan.combinations}
            status={status}
            selectedId={spaceId || null}
            onSelect={chooseSpace}
          />
          <Select
            icon="list-outline"
            label={t("bookings.orPickFromList")}
            placeholder={t("common.choose")}
            value={spaceId}
            onChange={chooseSpace}
            options={planOrder(spaces)
              .filter((s) => categoryOf(s) === shownCategory)
              .map((s) => ({ value: s.id, label: s.name }))}
          />
          {space && partsOf(spaces, pitchOf(space, spaces).id).length > 0 ? (
            <>
              <PartPicker
                space={space}
                spaces={spaces}
                onSelect={(id) => {
                  setSpaceId(id);
                  setStart(null);
                }}
              />
              <Button label={t("bookings.parts.continue", { space: space.name })} onPress={next} />
            </>
          ) : null}
        </>
      ) : null}

      {step === "date" ? (
        <>
          <StepTitle number={2} text={t("bookings.steps.date")} />
          <DateNav
            title={monthTitle(date, i18n.language)}
            previousLabel={t("bookings.previousMonth")}
            nextLabel={t("bookings.nextMonth")}
            onPrevious={
              date.slice(0, 7) > today.slice(0, 7)
                ? () => {
                    const first = addMonths(date, -1);
                    setDate(first < today ? today : first);
                  }
                : undefined
            }
            onNext={() => setDate(addMonths(date, 1))}
          />
          <MonthGrid
            date={date}
            marks={noMarks}
            minDate={today}
            onDay={(d) => {
              setDate(d);
              setStart(null);
              setStep("time");
            }}
          />
        </>
      ) : null}

      {step === "time" && space ? (
        <>
          <StepTitle number={3} text={t("bookings.steps.time")} />
          <Card>
            <FreeSlots
              duration={duration}
              onDuration={setDuration}
              slots={daySlots(space.id, date, duration, dayBookings, spaces)}
              selected={start}
              onPick={(s) => {
                setStart(s);
                setStep("details");
              }}
              onTaken={(b, overlap) => setTaken({ booking: b, overlap })}
            />
          </Card>
        </>
      ) : null}

      {step === "details" ? (
        <>
          <StepTitle number={4} text={t("bookings.steps.details")} />
          <Choice
            label={t("bookings.activity")}
            value={form.activity}
            onChange={set("activity")}
            options={BOOKING_ACTIVITIES.map((a) => ({ value: a, label: t(`activities.${a}`) }))}
          />
          <Select
            icon="briefcase-outline"
            label={t("bookings.department")}
            placeholder={t("common.choose")}
            value={departmentId ?? ""}
            onChange={set("departmentId")}
            options={departments.map((d) => ({ value: d.id, label: d.name }))}
          />
          <Select
            icon="shirt-outline"
            label={t("bookings.team")}
            value={form.teamId}
            onChange={set("teamId")}
            options={[
              { value: "", label: t("bookings.noTeam") },
              ...[...(teams.data?.teams ?? [])]
                .sort(byName)
                .map((team) => ({ value: team.id, label: team.name })),
            ]}
          />
          {needsTeam && submitted ? (
            <Message tone="error">{t("bookings.chooseTeam")}</Message>
          ) : null}
          <Select
            icon="repeat-outline"
            label={t("bookings.repeat")}
            value={form.repeat}
            onChange={set("repeat")}
            options={[
              { value: "none", label: t("bookings.repeatNone") },
              { value: "4", label: t("bookings.repeatWeeks", { count: 4 }) },
              { value: "8", label: t("bookings.repeatWeeks", { count: 8 }) },
              { value: "season", label: t("bookings.repeatSeason") },
            ]}
          />
          {clubWide ? (
            <Select
              icon="flag-outline"
              label={t("bookings.status")}
              value={form.status}
              onChange={set("status")}
              options={BOOKING_STATUSES.map((s) => ({
                value: s,
                label: t(`bookingStatus.${s}`),
              }))}
            />
          ) : null}
          <TextField
            label={t("bookings.titleLabel")}
            value={form.title}
            onChangeText={set("title")}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: more }}
            onPress={() => setMore(!more)}
            style={styles.more}
          >
            <Text style={[styles.moreText, { color: colors.primary }]}>
              {t("bookings.moreDetails")}
            </Text>
            <Ionicons
              name={more ? "chevron-up" : "chevron-down"}
              size={18}
              color={colors.primary}
            />
          </Pressable>
          {more ? (
            <>
              <TextField
                label={t("bookings.targetGroup")}
                value={form.targetGroup}
                onChangeText={set("targetGroup")}
              />
              <TextField
                label={t("bookings.expected")}
                value={form.expectedAttendance}
                onChangeText={set("expectedAttendance")}
                keyboardType="numeric"
              />
              <TextField
                label={t("bookings.notes")}
                value={form.notes}
                onChangeText={set("notes")}
              />
            </>
          ) : null}
          {submitted && !parsed.success ? (
            <Message tone="error">{t("bookings.chooseDepartment")}</Message>
          ) : null}
          {create.isError ? <Message tone="error">{t(errorKey(create.error))}</Message> : null}
          <Button
            icon="checkmark-circle-outline"
            label={clubWide ? t("bookings.confirm") : t("bookings.sendRequest")}
            busy={create.isPending}
            onPress={() => {
              setSubmitted(true);
              if (parsed.success && !needsTeam) create.mutate();
            }}
          />
        </>
      ) : null}
      <TakenSheet
        booking={taken?.booking ?? null}
        bookings={bookings}
        spaces={spaces}
        reason={
          taken?.overlap
            ? t("bookings.overlaps", {
                range: `${clockTime(taken.booking.startsAt)}–${clockTime(taken.booking.endsAt)}`,
                who: whoOf(taken.booking),
              })
            : undefined
        }
        onClose={() => setTaken(null)}
        onOpen={(b) => {
          setTaken(null);
          router.push({ pathname: "/booking/[bookingId]", params: { bookingId: b.id } });
        }}
      />
    </Screen>
  );
}

function SummaryRow({
  icon,
  text,
}: {
  icon: ComponentProps<typeof Ionicons>["name"];
  text: string;
}) {
  const colors = useColors();
  return (
    <View style={styles.summaryRow}>
      <Ionicons name={icon} size={20} color={colors.primary} />
      <Text style={[styles.summaryText, { color: colors.text }]}>{text}</Text>
    </View>
  );
}

function StepTitle({ number, text }: { number: number; text: string }) {
  const colors = useColors();
  return (
    <View style={styles.stepTitle}>
      <View style={[styles.stepNumber, { backgroundColor: colors.primary }]}>
        <Text style={[styles.stepNumberText, { color: colors.onPrimary }]}>{number}</Text>
      </View>
      <Text accessibilityRole="header" style={[styles.stepText, { color: colors.text }]}>
        {text}
      </Text>
    </View>
  );
}

/** A step already done: what was chosen, tappable to change it. */
function DoneStep({
  icon,
  label,
  value,
  onChange,
}: {
  icon: "location-outline" | "calendar-outline" | "time-outline";
  label: string;
  value: string;
  onChange: () => void;
}) {
  const { t } = useTranslation();
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}. ${t("bookings.change")}`}
      onPress={onChange}
      style={({ pressed }) => [
        styles.done,
        { backgroundColor: colors.surface, borderColor: colors.border },
        pressed && { opacity: 0.8 },
      ]}
    >
      <Ionicons name={icon} size={20} color={colors.primary} />
      <View style={styles.doneText}>
        <Text style={[styles.doneLabel, { color: colors.textMuted }]}>{label}</Text>
        <Text style={[styles.doneValue, { color: colors.text }]}>{value}</Text>
      </View>
      <Text style={[styles.change, { color: colors.primary }]}>{t("bookings.change")}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  success: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.lg },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  summaryText: { flex: 1, fontSize: fontSize.md, fontWeight: "600" },
  stepTitle: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  stepNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumberText: { fontSize: fontSize.sm, fontWeight: "800" },
  stepText: { fontSize: fontSize.lg, fontWeight: "800" },
  done: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    minHeight: 56,
  },
  doneText: { flex: 1, gap: 1 },
  doneLabel: { fontSize: fontSize.xs, fontWeight: "600" },
  doneValue: { fontSize: fontSize.md, fontWeight: "700" },
  change: { fontSize: fontSize.sm, fontWeight: "700" },
  more: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: 44,
    alignSelf: "flex-start",
  },
  moreText: { fontSize: fontSize.sm, fontWeight: "700" },
});
