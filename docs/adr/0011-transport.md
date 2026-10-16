# ADR 0011: Transport

- Status: Accepted
- Date: 2026-10-16

## Context

Away games need seats: a club van assigned by the office and carpools offered by parents.
A driver's phone is personal data of a person who may be a parent, not a staff member.

## Decision

- Rides belong to an event; passengers must be called up (M11) and sit in one ride per event
  (a unique key on event and person), so seating twice moves the person.
- Seat limits are checked in the service while the ride row is locked, so two people cannot
  take the last seat; shrinking a ride below its passengers is refused.
- No new permissions. Managers reuse `callups.read` / `callups.write` over the event's team;
  athletes and guardians act for themselves and their wards (as for RSVPs), only in carpools,
  and a carpool's driver is always the offering person.
- The driver's contact is never stored on the ride. It is read from the person record and
  returned only to the driver and to people riding with them. Managers do not see it by
  role; they reach the driver through the usual people screens if they hold that right.

## Consequences

- Vans are managed by the office; parents cannot take van seats themselves.
- Notifying people when they are seated needs a new notification kind (a later change).
