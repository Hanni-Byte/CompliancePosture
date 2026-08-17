import { describe, expect, it } from "vitest";
import { all, andThen, err, map, mapErr, ok, unwrapOr } from "./result";

describe("Result", () => {
  it("map transforms ok and passes err through", () => {
    expect(map(ok(2), (n) => n * 2)).toEqual(ok(4));
    expect(map(err("e"), (n: number) => n * 2)).toEqual(err("e"));
  });

  it("mapErr transforms err and passes ok through", () => {
    expect(mapErr(err("e"), (e) => `${e}!`)).toEqual(err("e!"));
    expect(mapErr(ok(1), (e: string) => `${e}!`)).toEqual(ok(1));
  });

  it("andThen chains and short-circuits on err", () => {
    const parse = (s: string) =>
      /^\d+$/.test(s) ? ok(Number(s)) : err("not a number" as const);
    expect(andThen(ok("42"), parse)).toEqual(ok(42));
    expect(andThen(ok("x"), parse)).toEqual(err("not a number"));
    expect(andThen(err("earlier"), parse)).toEqual(err("earlier"));
  });

  it("unwrapOr falls back only on err", () => {
    expect(unwrapOr(ok(1), 0)).toBe(1);
    expect(unwrapOr(err("e"), 0)).toBe(0);
  });

  it("all collects values, first error wins", () => {
    expect(all([ok(1), ok(2)])).toEqual(ok([1, 2]));
    expect(all([ok(1), err("a"), err("b")])).toEqual(err("a"));
  });
});