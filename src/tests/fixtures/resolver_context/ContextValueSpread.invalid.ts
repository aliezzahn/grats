/** @gqlType */
export class Query {
  /** @gqlField */
  greeting(args: never, ...ctx: SomeType): string {
    return ctx[0].greeting;
  }
}

type SomeType = { greeting: string };
