import { z } from "zod";

/** Club van (managed by the office and coaches) or a parent's carpool offer. */
export const RIDE_KINDS = ["club_van", "carpool"] as const;
export type RideKind = (typeof RIDE_KINDS)[number];

const instant = z.iso.datetime({ offset: true }).transform((v) => new Date(v));
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
const seats = z.number().int().min(1).max(60);

/**
 * Body of POST /api/transport/events/:id/rides. Managers pick the kind and the driver (a
 * person, optional for a van); a participant offering a carpool is always the driver.
 */
export const createRideSchema = z.object({
  kind: z.enum(RIDE_KINDS),
  driverPersonId: z
    .uuid()
    .nullish()
    .transform((v) => v ?? null),
  label: optionalText(80),
  seats,
  pickupPoint: optionalText(200),
  pickupAt: instant.nullish().transform((v) => v ?? null),
  notes: optionalText(500),
});
export type CreateRideInput = z.infer<typeof createRideSchema>;

/** Body of PATCH /api/transport/rides/:id: only the fields sent change. */
export const updateRideSchema = z
  .object({
    driverPersonId: z.uuid().nullable(),
    label: z.string().trim().max(80).nullable(),
    seats,
    pickupPoint: z.string().trim().max(200).nullable(),
    pickupAt: instant.nullable(),
    notes: z.string().trim().max(500).nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0);
export type UpdateRideInput = z.infer<typeof updateRideSchema>;
