import { describe, expect, it } from "vitest";
import {
  feedbackMailSubject,
  parseSupportMessage,
} from "./supportMessage";

describe("parseSupportMessage", () => {
  it("requires kind help or feedback", () => {
    expect(parseSupportMessage({ message: "hi" })).toEqual({
      error: "kind must be help or feedback",
    });
  });

  it("requires a non-empty message", () => {
    expect(parseSupportMessage({ kind: "feedback", message: "  " })).toEqual({
      error: "Message is required",
    });
  });

  it("requires subject for help", () => {
    expect(
      parseSupportMessage({ kind: "help", message: "Need help" }),
    ).toEqual({ error: "Subject is required" });
  });

  it("leaves feedback subject for the server", () => {
    expect(
      parseSupportMessage({ kind: "feedback", message: "Love it" }),
    ).toEqual({
      kind: "feedback",
      subject: null,
      message: "Love it",
      email: null,
      name: null,
    });
  });

  it("accepts help with subject", () => {
    expect(
      parseSupportMessage({
        kind: "help",
        subject: " RMD question ",
        message: " How does it work? ",
      }),
    ).toEqual({
      kind: "help",
      subject: "RMD question",
      message: "How does it work?",
      email: null,
      name: null,
    });
  });

  it("accepts guest name and email", () => {
    expect(
      parseSupportMessage({
        kind: "help",
        subject: "Question",
        message: "Hello",
        name: " Omri ",
        email: " omri@example.com ",
      }),
    ).toEqual({
      kind: "help",
      subject: "Question",
      message: "Hello",
      name: "Omri",
      email: "omri@example.com",
    });
  });

  it("rejects invalid guest email", () => {
    expect(
      parseSupportMessage({
        kind: "help",
        subject: "Question",
        message: "Hello",
        email: "not-an-email",
      }),
    ).toEqual({ error: "Enter a valid email" });
  });
});

describe("feedbackMailSubject", () => {
  it("uses the user's name", () => {
    expect(feedbackMailSubject("Omri Regev")).toBe("feedback from Omri Regev");
  });

  it("falls back when name is missing", () => {
    expect(feedbackMailSubject(null)).toBe("feedback from a user");
    expect(feedbackMailSubject("  ")).toBe("feedback from a user");
  });
});
