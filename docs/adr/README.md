# Architecture Decision Records

Short records of decisions that are expensive to reverse. One file per decision,
numbered in order: `NNNN-short-title.md` with Status, Date, Context, Decision, Alternatives,
Consequences. Superseded ADRs stay in place with their status updated.

The directory is the index: `ls docs/adr` lists the records in order and each file's first
heading is its title. There is deliberately no table here, because every parallel PR that
added a row conflicted with the others. `pnpm next:numbers` prints the next free number.
